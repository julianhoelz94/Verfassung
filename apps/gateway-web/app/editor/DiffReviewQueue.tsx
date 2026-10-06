'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DiffReviewState, ReviewCandidate, ReviewDecisionInput, ReviewRef } from '../../lib/diff-review';
import { decisionReadyForReview, decisionResolved } from '../../lib/diff-review';
import { diffText, segsForSide } from '../../lib/text-diff';
import { saveDiffDecisionAction, refreshDiffReviewAction, type ReviewTarget } from './diff-review-actions';
import { Button } from '../components/ui';

type Props = {
  target: ReviewTarget;
  initial: DiffReviewState;
  rows: { id: string; label: string }[];
  canDecide: boolean;
  canAcknowledge: boolean;
  onAddRow?: (candidate: ReviewCandidate) => void;
};

function label(ref: ReviewRef): string {
  return ref.path.join(' › ') || ref.label || ref.kind;
}

function statusText(status: string): string {
  return status.replaceAll('_', ' ');
}

function wording(refs: ReviewRef[]): string {
  return refs.map((ref) => ref.excerpt ?? '').filter(Boolean).join('\n');
}

export function DiffReviewQueue({ target, initial, rows, canDecide, canAcknowledge, onAddRow }: Props) {
  const router = useRouter();
  const [review, setReview] = useState(initial);
  const [selectedKey, setSelectedKey] = useState(initial.candidates[(initial.currentPosition ?? 1) - 1]?.key ?? initial.candidates[0]?.key ?? '');
  const [level, setLevel] = useState('all');
  const [facet, setFacet] = useState('all');
  const [status, setStatus] = useState('all');
  const [scope, setScope] = useState('all');
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [acknowledge, setAcknowledge] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const activeRef = useRef<HTMLDivElement>(null);
  const focusAfterNavigation = useRef(false);
  const decisions = useMemo(() => new Map(review.decisions.map((decision) => [decision.key, decision])), [review.decisions]);
  const scopes = useMemo(() => [...new Set(review.candidates.map((candidate) => (candidate.afterRefs[0] ?? candidate.beforeRefs[0])?.path[0]).filter(Boolean))] as string[], [review.candidates]);
  const visible = review.candidates.filter((candidate) => {
    const decision = decisions.get(candidate.key);
    return (level === 'all' || String(candidate.level) === level) &&
      (facet === 'all' || candidate.facet === facet) &&
      (status === 'all' || (decision?.status ?? 'open') === status) &&
      (scope === 'all' || (candidate.afterRefs[0] ?? candidate.beforeRefs[0])?.path[0] === scope);
  });
  const selected = visible.find((candidate) => candidate.key === selectedKey) ?? visible[0];
  const selectedIndex = selected ? visible.findIndex((candidate) => candidate.key === selected.key) : -1;
  const selectedDecision = selected ? decisions.get(selected.key) : undefined;
  useEffect(() => {
    setLinkedIds(selectedDecision?.linkedChangeIds ?? selectedDecision?.linkedRowIds ?? []);
    setReason(selectedDecision?.reason ?? selectedDecision?.exclusionReason ?? '');
    setAcknowledge(selectedDecision?.reviewerAcknowledged ?? false);
  }, [selected?.key, selectedDecision]);
  useEffect(() => {
    if (focusAfterNavigation.current) {
      activeRef.current?.focus();
      focusAfterNavigation.current = false;
    }
  }, [selected?.key]);
  const resolved = review.candidates.filter((candidate) => decisionResolved(candidate, decisions.get(candidate.key))).length;
  const readyForReview = review.candidates.filter((candidate) => decisionReadyForReview(candidate, decisions.get(candidate.key))).length;
  const levels = [...new Set(review.candidates.map((candidate) => candidate.level))].sort((a, b) => a - b);
  const counts = review.candidates.reduce<Record<string, number>>((result, candidate) => {
    const value = decisions.get(candidate.key)?.status ?? 'open';
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
  const sourceText = selected ? wording(selected.beforeRefs) : '';
  const targetText = selected ? wording(selected.afterRefs) : '';
  const spans = selected ? sourceText.length + targetText.length < 8000 ? diffText(sourceText, targetText) : [
    { type: 'remove' as const, text: sourceText }, { type: 'add' as const, text: targetText },
  ] : [];

  function choose(key: string) {
    focusAfterNavigation.current = true;
    setSelectedKey(key);
    setMessage('');
  }

  function save(input: ReviewDecisionInput) {
    startTransition(async () => {
      const result = await saveDiffDecisionAction(target, review, input);
      if ('error' in result) { setMessage(result.error); return; }
      setReview(result.review);
      const byKey = new Map(result.review.decisions.map((decision) => [decision.key, decision]));
      const next = result.review.candidates.find((candidate) => !decisionReadyForReview(candidate, byKey.get(candidate.key)))
        ?? (canAcknowledge ? result.review.candidates.find((candidate) => !decisionResolved(candidate, byKey.get(candidate.key))) : undefined);
      choose(next?.key ?? input.key);
      setMessage('Decision saved.');
      router.refresh();
    });
  }

  function refresh() {
    startTransition(async () => {
      const result = await refreshDiffReviewAction(target);
      if ('error' in result) { setMessage(result.error); return; }
      const previousTotal = review.candidates.length;
      setReview(result.review);
      setMessage(result.review.candidates.length > previousTotal
        ? `${result.review.candidates.length - previousTotal} deeper differences were added after the pairing changed.`
        : 'Review refreshed from the saved draft.');
      router.refresh();
    });
  }

  const navigation = (index: number) => index >= 0 && index < visible.length && choose(visible[index].key);
  return <section className="panel stack diff-review" aria-labelledby={`diff-review-${target.id}`}>
    <div className="section-header"><div><h2 className="section-title" id={`diff-review-${target.id}`}>Review differences</h2>
      <p className="muted">Review each actionable difference before publication.</p></div>
      <Button type="button" size="sm" disabled={pending} onClick={refresh}>Refresh</Button>
    </div>
    <div className="diff-review-progress" aria-live="polite">
      <strong>Reviewed {resolved} of {review.candidates.length}</strong>
      <progress value={resolved} max={Math.max(1, review.candidates.length)} aria-label={`Reviewed ${resolved} of ${review.candidates.length} differences`} />
      <p>{counts.linked ?? 0} linked · {counts.excluded_with_reason ?? 0} excluded · {counts.open ?? 0} open · {counts.needs_recheck ?? 0} need recheck</p>
      {readyForReview !== resolved ? <p>{readyForReview} of {review.candidates.length} ready for reviewer handoff</p> : null}
    </div>
    {review.candidates.length === 0 ? <p role="status">No differences found for the pinned snapshots.</p> : <>
      <div className="form-row" aria-label="Difference filters">
        <label>Level <select value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">All</option>{levels.map((value) => <option key={value} value={value}>Level {value}</option>)}</select></label>
        <label>Type <select value={facet} onChange={(event) => setFacet(event.target.value)}><option value="all">All</option>{[...new Set(review.candidates.map((candidate) => candidate.facet))].sort().map((value) => <option key={value} value={value}>{statusText(value)}</option>)}</select></label>
        <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All</option>{['open', 'linked', 'excluded_with_reason', 'needs_recheck'].map((value) => <option key={value} value={value}>{statusText(value)}</option>)}</select></label>
        <label>Scope <select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">All</option>{scopes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <p className="muted">Showing {visible.length} of {review.candidates.length} differences.</p>
      <ul className="diff-review-levels" aria-label="Progress by level">{levels.map((value) => {
        const atLevel = review.candidates.filter((candidate) => candidate.level === value);
        const done = atLevel.filter((candidate) => decisionResolved(candidate, decisions.get(candidate.key))).length;
        return <li key={value}><button type="button" onClick={() => setLevel(String(value))}>Level {value}: {done} of {atLevel.length} reviewed</button></li>;
      })}</ul>
      {scopes.length > 1 ? <ul className="diff-review-branches">{scopes.map((branch) => {
        const branchCandidates = review.candidates.filter((candidate) => (candidate.afterRefs[0] ?? candidate.beforeRefs[0])?.path[0] === branch);
        const open = branchCandidates.filter((candidate) => !decisionResolved(candidate, decisions.get(candidate.key))).length;
        return <li key={branch}><button type="button" onClick={() => setScope(branch)}>{branch}: {open} open</button></li>;
      })}</ul> : null}
      {selected ? <div ref={activeRef} className="stack diff-review-active" tabIndex={-1} aria-live="polite">
        <p className="muted">Difference {review.candidates.findIndex((candidate) => candidate.key === selected.key) + 1} of {review.candidates.length} · {statusText(selectedDecision?.status ?? 'open')}</p>
        <h3>{statusText(selected.facet)} · {label(selected.afterRefs[0] ?? selected.beforeRefs[0])}</h3>
        <p>Level {selected.level}{selected.ambiguous ? ' · Ambiguous pairing: confirm multiple exact rows or exclude with a reviewed reason.' : ''}</p>
        <div className="diff-review-sides">
          <div><h4>Before</h4><p>{selected.beforeRefs.map(label).join('; ') || 'No source unit'}</p><p className="diff-review-text">{segsForSide(spans, 'from').map((seg, index) => seg.type === 'remove' ? <del key={index}>{seg.text}</del> : <span key={index}>{seg.text}</span>)}</p>{selected.beforeRefs.map((ref) => <code key={`${ref.logicalId}-${ref.occurrenceId}`}>{ref.versionId ?? 'draft'} · {ref.logicalId}</code>)}</div>
          <div><h4>After</h4><p>{selected.afterRefs.map(label).join('; ') || 'No target unit'}</p><p className="diff-review-text">{segsForSide(spans, 'to').map((seg, index) => seg.type === 'add' ? <ins key={index}>{seg.text}</ins> : <span key={index}>{seg.text}</span>)}</p>{selected.afterRefs.map((ref) => <code key={`${ref.logicalId}-${ref.occurrenceId}`}>{ref.versionId ?? 'draft'} · {ref.logicalId}</code>)}</div>
        </div>
        <div className="action-bar"><Button type="button" disabled={selectedIndex <= 0} onClick={() => navigation(selectedIndex - 1)}>Previous</Button><Button type="button" disabled={selectedIndex >= visible.length - 1} onClick={() => navigation(selectedIndex + 1)}>Next</Button><Button type="button" onClick={() => { const next = visible.find((candidate) => !decisionReadyForReview(candidate, decisions.get(candidate.key)) && candidate.key !== selected.key) ?? (canAcknowledge ? visible.find((candidate) => !decisionResolved(candidate, decisions.get(candidate.key)) && candidate.key !== selected.key) : undefined); if (next) choose(next.key); }}>Next unreviewed</Button></div>
        {canDecide ? <div className="stack">
          {onAddRow ? <Button type="button" onClick={() => { onAddRow(selected); setMessage('A change row was added. Check the exact units and save the draft before linking this difference.'); }}>Create change row from this difference</Button> : null}
          <Button type="button" onClick={() => { document.querySelector<HTMLElement>('[aria-label="Change record"], #amendment-changes-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setMessage('Correct the pairing in the exact unit selectors, save, then link the saved row.'); }}>Correct pairing in change record</Button>
          <label>Link to saved change rows <select multiple value={linkedIds} onChange={(event) => setLinkedIds([...event.target.selectedOptions].map((option) => option.value))}>{rows.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
          {selected.ambiguous && canAcknowledge ? <label className="choice-row"><input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} /> Confirm the multi-row pairing as reviewer</label> : null}
          <Button type="button" disabled={pending || linkedIds.length === 0 || selected.ambiguous && linkedIds.length < 2} onClick={() => save({ key: selected.key, fingerprint: selected.fingerprint, status: 'linked', linkedIds, reviewerAcknowledged: selected.ambiguous && canAcknowledge && acknowledge })}>Link selected rows and next</Button>
          <label>Reason for exclusion <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></label>
          {canAcknowledge ? <label className="choice-row"><input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} /> Acknowledge this exclusion for publication</label> : <p className="muted">A reviewer must acknowledge an exclusion before publication.</p>}
          <Button type="button" disabled={pending || !reason.trim()} onClick={() => save({ key: selected.key, fingerprint: selected.fingerprint, status: 'excluded_with_reason', exclusionReason: reason.trim(), reviewerAcknowledged: acknowledge })}>Exclude with reason and next</Button>
        </div> : null}
      </div> : <p>No differences match these filters.</p>}
    </>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
