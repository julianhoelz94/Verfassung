import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import type { ReactNode } from 'react';
import type { Amendment, VersionSummary } from '../../../lib/api';
import type { AmendmentRevision } from '../../../lib/amendment-editor-api';
import { Badge, Button } from '../../components/ui';

type QuoteReviewPanelProps = {
  amendment: Amendment;
  publishedRevision: AmendmentRevision | null;
  versions: VersionSummary[];
  canConfirm: boolean;
  contentByVersion: Record<string, string[]>;
};

function versionFor(id: string | null | undefined, versions: VersionSummary[]): VersionSummary | null {
  return id ? versions.find((version) => version.id === id) ?? null : null;
}

function liveVersionFor(version: VersionSummary | null, versions: VersionSummary[]): VersionSummary | null {
  if (!version) return null;
  const liveId = version.currentVersionId ?? version.id;
  return versionFor(liveId, versions) ?? version;
}

function QuoteSide({ label, reviewed, live, contentByVersion }: { label: ReactNode; reviewed: VersionSummary | null; live: VersionSummary | null; contentByVersion: Record<string, string[]> }) {
  return (
    <section className="panel quote-review-side">
      <h2 className="panel-title">{label}</h2>
      <p><strong><T value={ui.editor.amendments.quotereviewpanel.lastReviewed} /></strong><br />{reviewed?.versionLabel ?? <T value={ui.quoteReview.noQuotedSnapshot} />}</p>
      <p><strong><T value={ui.editor.amendments.quotereviewpanel.liveTip} /></strong><br />{live?.versionLabel ?? <T value={ui.quoteReview.noQuotedSnapshot} />}</p>
      {reviewed && live && reviewed.id !== live.id ? <Badge tone="changed"><T value={ui.editor.amendments.quotereviewpanel.updatedSinceReview} /></Badge> : <Badge tone="added"><T value={ui.editor.amendments.quotereviewpanel.current} /></Badge>}
      {reviewed ? <details><summary><T value={ui.editor.amendments.quotereviewpanel.lastReviewedConstitutionalText} /></summary><ul>{(contentByVersion[reviewed.id] ?? []).map((text) => <li key={text}>{text}</li>)}</ul></details> : null}
      {live && live.id !== reviewed?.id ? <details><summary><T value={ui.editor.amendments.quotereviewpanel.liveConstitutionalText} /></summary><ul>{(contentByVersion[live.id] ?? []).map((text) => <li key={text}>{text}</li>)}</ul></details> : null}
    </section>
  );
}

export function QuoteReviewPanel({ amendment, publishedRevision, versions, canConfirm, contentByVersion }: QuoteReviewPanelProps) {
  const source = versionFor(publishedRevision?.sourceVersionId, versions);
  const target = versionFor(publishedRevision?.targetVersionId, versions);
  const sourceLive = liveVersionFor(source, versions);
  const targetLive = liveVersionFor(target, versions);
  return (
    <section aria-labelledby="quote-review-title">
      <h2 id="quote-review-title" className="section-title"><T value={ui.editor.amendments.quotereviewpanel.flaggedRecordReview} /></h2>
      <div className="quote-review-grid">
        <QuoteSide label={<T value={ui.accessibility.source} />} reviewed={source} live={sourceLive} contentByVersion={contentByVersion} />
        <section className="panel quote-review-instrument">
          <h2 className="panel-title"><T value={ui.editor.amendments.quotereviewpanel.instrument} /></h2>
          <p><strong>{publishedRevision?.title ?? amendment.title}</strong></p>
          <p>{publishedRevision?.comment ?? amendment.comment ?? <T value={ui.quoteReview.noReviewerComment} />}</p>
          <ul>
            {(publishedRevision?.changes ?? amendment.changes).map((change, index) => (
              <li key={`${change.articleNumber ?? 'change'}-${index}`}>
                {change.articleNumber ? <><T value={ui.quoteReview.article} /> {change.articleNumber}: </> : ''}{change.changeType}{change.note ? ` — ${change.note}` : ''}
              </li>
            ))}
          </ul>
          {canConfirm ? (
            <form action="/editor/command" method="post"><input type="hidden" name="command" value="amendment-confirm" />
              <input type="hidden" name="amendmentId" value={amendment.id} />
              <Button type="submit"><T value={ui.editor.amendments.quotereviewpanel.confirmLiveQuotesAndRepublish} /></Button>
            </form>
          ) : null}
        </section>
        <QuoteSide label={<T value={ui.accessibility.target} />} reviewed={target} live={targetLive} contentByVersion={contentByVersion} />
      </div>
    </section>
  );
}
