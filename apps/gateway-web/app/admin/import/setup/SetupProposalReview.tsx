'use client';

import { useState, type FormEvent } from 'react';
import type { OutlineKindWrite } from '../../../../lib/api';
import type { SetupProposal } from '../../../../lib/ingestion-api';
import { displayKinds, setupKinds, setupOutline } from '../../../../lib/setup-review';
import { ui } from '../../../../lib/messages';
import { useTranslation } from '../../../components/TranslationProvider';
import { Alert, Button, Card, Input, Select } from '../../../components/ui';
import { OutlineReaderPreview } from '../../constitutions/OutlineReaderPreview';
import { previewRoots } from '../ImportPreview';
import { reviewSetupAction } from './actions';
import styles from './SetupProposalReview.module.css';

function Hierarchy({ kinds }: { kinds: OutlineKindWrite[] }) {
  const t = useTranslation();
  return <ul className={styles.hierarchy}>{setupOutline(kinds).kinds.map(kind => <li key={kind.kindCode}>
    <strong>{kind.displayLabel}</strong>{kind.root ? ` · ${t(ui.setupReview.root)}` : ''}
    {' → '}{kind.allowedChildKinds?.length ? kind.allowedChildKinds.map(code => kinds.find(child => child.kindCode === code)?.displayLabel ?? code).join(', ') : t(ui.setupReview.text)}
  </li>)}</ul>;
}

export function SetupProposalReview({ proposal, error }: { proposal: SetupProposal; error?: string }) {
  const t = useTranslation();
  const [kinds, setKinds] = useState(() => setupKinds(proposal.payload));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const editable = proposal.status === 'proposed';
  const previous = proposal.previousPayload;
  const status = proposal.status === 'confirmed' ? ui.setupReview.confirmed : proposal.status === 'confirming' ? ui.setupReview.confirming
    : !editable ? ui.setupReview.closed : proposal.changesRequested ? ui.setupReview.changesRequested : previous ? ui.setupReview.revised : ui.setupReview.waiting;
  function update(index: number, patch: Partial<OutlineKindWrite>) { setKinds(current => current.map((kind, i) => i === index ? { ...kind, ...patch } : kind)); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(event.currentTarget);
    data.set('intent', submitter?.value ?? 'display');
    setBusy(true); setFailed(false);
    try { window.location.assign(await reviewSetupAction(data)); }
    catch { setBusy(false); setFailed(true); }
  }
  const metadata = ['constitutionTitle', 'countryName', 'isoCode', 'languageCode', 'sourceUrl', 'gazetteReference', 'constitutionSlug', 'jurisdictionId', 'predecessorConstitutionId', 'interim'] as const;
  const changedMetadata = previous ? metadata.filter(field => previous[field] !== proposal.payload[field]) : [];
  const structure = (values: OutlineKindWrite[]) => values.map(kind => ({ kindCode: kind.kindCode, root: kind.root, allowedChildKinds: kind.allowedChildKinds, allowTextAlongsideChildren: kind.allowTextAlongsideChildren, titlePolicy: kind.titlePolicy, labelPolicy: kind.labelPolicy, segmentation: kind.segmentation }));
  const hierarchyChanged = previous && JSON.stringify(structure(setupKinds(previous))) !== JSON.stringify(structure(setupKinds(proposal.payload)));
  const sampleChanged = previous && JSON.stringify(previous.sampleRoots) !== JSON.stringify(proposal.payload.sampleRoots);
  const displayChanged = previous && JSON.stringify(displayKinds(setupKinds(previous))) !== JSON.stringify(displayKinds(setupKinds(proposal.payload)));
  return <form onSubmit={submit}>
    <input type="hidden" name="proposalId" value={proposal.id} />
    <input type="hidden" name="revision" value={proposal.revision} />
    <input type="hidden" name="display" value={JSON.stringify(displayKinds(kinds))} />
    <Card className="import-workflow">
      <h2>{t(status)}</h2>
      <p>{t(ui.setupReview.revision)} {proposal.revision}</p>
      {editable ? <p>{t(ui.setupReview.waitHelp)}</p> : proposal.status === 'confirmed' ? <p>{t(ui.setupReview.resume)}</p> : null}
      {error || failed ? <Alert tone="error">{t(error === 'stale' ? ui.setupReview.stale : ui.setupReview.error)}</Alert> : null}
      <a href={`/admin/import/setup/${proposal.id}`}>{t(ui.setupReview.reload)}</a>
      {editable ? <p><a href="#setup-final-review">{t(ui.admin.import.setup.proposalid.page.finalReview)}</a></p> : null}
    </Card>
    <div className={styles.grid}>
        <Card className={styles.hierarchyCard}><h2>{t(ui.setupReview.hierarchy)}</h2><Hierarchy kinds={kinds} /><p>{t(ui.setupReview.hierarchyHelp)}</p></Card>

      <Card className={styles.sample}><h2>{t(ui.setupReview.sample)}</h2><p>{t(ui.setupReview.sampleHelp)}</p>
        <OutlineReaderPreview roots={previewRoots(proposal.payload.sampleRoots)} outline={setupOutline(kinds)} label={t(ui.setupReview.current)} />
      </Card>
      <div className={styles.controls}>
        {previous ? <Card><h2>{t(ui.setupReview.changes)}</h2>
          {hierarchyChanged ? <p>{t(ui.setupReview.hierarchyChanged)}</p> : null}
          {sampleChanged ? <p>{t(ui.setupReview.sampleChanged)}</p> : null}
          {displayChanged ? <p>{t(ui.setupReview.displayChanged)}</p> : null}
          {changedMetadata.length ? <dl className={styles.comparison}>{changedMetadata.map(field => <div key={field}>
            <dt>{t(field === 'sourceUrl' || field === 'gazetteReference' ? ui.admin.import.setup.proposalid.page.source : field === 'languageCode' ? ui.admin.import.setup.proposalid.page.language : field === 'constitutionSlug' ? ui.admin.import.setup.proposalid.page.slug : ui.admin.import.setup.proposalid.page.sourceAndIdentity)}</dt>
            <dd>{t(ui.setupReview.previous)}: {String(previous[field] ?? '—')}</dd><dd>{t(ui.setupReview.current)}: {String(proposal.payload[field] ?? '—')}</dd>
          </div>)}</dl> : null}
          {!hierarchyChanged && !sampleChanged && !changedMetadata.length ? <p>{t(ui.setupReview.unchanged)}</p> : null}
          <details><summary>{t(ui.setupReview.previous)}</summary><Hierarchy kinds={setupKinds(previous)} />
            <OutlineReaderPreview roots={previewRoots(previous.sampleRoots)} outline={setupOutline(setupKinds(previous))} label={t(ui.setupReview.previous)} />
          </details>
        </Card> : null}
        {proposal.requestedChanges ? <Card><h2>{t(ui.setupReview.recorded)}</h2><p className={styles.feedback}>{proposal.requestedChanges}</p></Card> : null}
        {editable ? <Card><details><summary>{t(ui.setupReview.display)}</summary>
          {kinds.map((kind, index) => <fieldset className={styles.controls} key={kind.kindCode}><legend>{kind.displayLabel}</legend>
            <Input label={t(ui.setupReview.name)} value={kind.displayLabel} required onChange={event => update(index, { displayLabel: event.target.value })} />
            <Select label={t(ui.setupReview.layout)} value={kind.presentation ?? 'section'} onChange={event => update(index, { presentation: event.target.value as OutlineKindWrite['presentation'] })}>
              <option value="section">{t(ui.setupReview.block)}</option><option value="concatenated">{t(ui.setupReview.running)}</option>
            </Select>
            <label><input type="checkbox" checked={Boolean(kind.showKind)} disabled={kind.presentation === 'concatenated'} onChange={event => update(index, { showKind: event.target.checked })} /> {t(ui.setupReview.kind)}</label>
            <label><input type="checkbox" checked={kind.showLabel !== false} disabled={kind.labelPolicy === 'none' || (kind.presentation === 'concatenated' && !['inline', 'superscript'].includes(kind.labelPlacement ?? 'before_title'))} onChange={event => update(index, { showLabel: event.target.checked })} /> {t(ui.setupReview.label)}</label>
            <label><input type="checkbox" checked={kind.showTitle !== false} disabled={kind.titlePolicy === 'none' || kind.presentation === 'concatenated'} onChange={event => update(index, { showTitle: event.target.checked })} /> {t(ui.setupReview.titleLabel)}</label>
            {kind.presentation === 'concatenated' ? <p>{t(ui.admin.constitutions.outlineeditor.runningTextHidesKindNamesAndEditorial)}</p> : null}
            <Select label={t(ui.setupReview.placement)} value={kind.labelPlacement ?? 'before_title'} disabled={kind.labelPolicy === 'none' || (!kind.showLabel && kind.presentation !== 'concatenated')} onChange={event => update(index, { labelPlacement: event.target.value as OutlineKindWrite['labelPlacement'] })}>
              <option value="before_title" disabled={kind.presentation === 'concatenated'}>{t(ui.setupReview.before)}</option><option value="after_title" disabled={kind.presentation === 'concatenated' || !kind.showTitle || kind.titlePolicy === 'none'}>{t(ui.setupReview.after)}</option><option value="inline" disabled={!setupOutline(kinds).kinds[index].mayHoldText}>{t(ui.setupReview.inline)}</option><option value="superscript" disabled={Boolean(setupOutline(kinds).kinds[index].allowedChildKinds?.length)}>{t(ui.setupReview.superscript)}</option>
            </Select>
          </fieldset>)}
          <div className={styles.actions}><Button name="intent" value="display" disabled={busy}>{t(ui.setupReview.save)}</Button></div>
        </details></Card> : null}
      </div>

    </div>
    {editable ? <Card id="setup-final-review">
      <h2>{t(ui.admin.import.setup.proposalid.page.finalReview)}</h2>
      <div className={styles.actions}><Button variant="primary" name="intent" value="confirm" disabled={busy || proposal.changesRequested}>{t(busy ? ui.setupReview.saving : ui.setupReview.confirm)}</Button></div>
      <details><summary>{t(ui.setupReview.feedback)}</summary><p>{t(ui.setupReview.feedbackHelp)}</p>
        <label htmlFor="setup-requested-changes">{t(ui.setupReview.feedbackLabel)}</label>
        <textarea id="setup-requested-changes" name="message" value={message} maxLength={4000} rows={4} onChange={event => setMessage(event.target.value)} />
        <div className={styles.actions}><Button name="intent" value="request-changes" disabled={busy || message.trim().length < 10}>{t(ui.setupReview.feedbackButton)}</Button></div>
      </details>
      <div className={styles.actions}><Button name="intent" value="withdraw" formNoValidate disabled={busy}>{t(ui.admin.import.setup.proposalid.page.withdrawProposal)}</Button></div>
    </Card> : null}
  </form>;
}
