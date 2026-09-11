'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Amendment } from '../../lib/api';
import { Button, Select } from '../components/ui';
import { publishAction } from './actions';

type PublishFormProps = {
  sessionId: string;
  versionId: string;
  articleId: string;
  amendments: Amendment[];
};

const HOP_KINDS = [
  { value: 'legal_amendment', label: 'Amending law' },
  { value: 'official_errata', label: 'Official errata' },
  { value: 'editorial_correction', label: 'Fix transcription (not a law)' },
] as const;

export function PublishForm({ sessionId, versionId, articleId, amendments }: PublishFormProps) {
  const [hopKind, setHopKind] = useState<string>('legal_amendment');
  const matchingAmendments = amendments.filter((item) => !item.kind || item.kind === hopKind);
  const [amendmentId, setAmendmentId] = useState(matchingAmendments[0]?.id ?? '');
  const [amendmentTitle, setAmendmentTitle] = useState(matchingAmendments[0]?.title ?? '');
  const showAmendmentSelect = hopKind === 'legal_amendment' || hopKind === 'official_errata';

  function onHopKindChange(nextKind: string) {
    setHopKind(nextKind);
    const nextList = amendments.filter((item) => !item.kind || item.kind === nextKind);
    const next = nextList[0];
    setAmendmentId(next?.id ?? '');
    setAmendmentTitle(next?.title ?? '');
  }

  function onAmendmentChange(nextId: string) {
    setAmendmentId(nextId);
    const selected = amendments.find((item) => item.id === nextId);
    setAmendmentTitle(selected?.title ?? '');
  }

  return (
    <form action={publishAction} className="stack">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="hopKind" value={hopKind} />
      {showAmendmentSelect ? (
        <>
          <input type="hidden" name="amendmentId" value={amendmentId} />
          <input type="hidden" name="amendmentTitle" value={amendmentTitle} />
        </>
      ) : null}
      <Select
        id="publish-hop-kind"
        name="publishHopKind"
        label="What kind of change is this?"
        value={hopKind}
        onChange={(event) => onHopKindChange(event.target.value)}
      >
        {HOP_KINDS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {showAmendmentSelect ? (
        <>
          <Select
            id="publish-amendment"
            name="publishAmendment"
            label="Amending law"
            value={amendmentId}
            required={matchingAmendments.length > 0}
            onChange={(event) => onAmendmentChange(event.target.value)}
          >
            {matchingAmendments.length === 0 ? (
              <option value="">No laws available</option>
            ) : (
              matchingAmendments.map((amendment) => (
                <option key={amendment.id} value={amendment.id}>
                  {amendment.title}
                  {amendment.status === 'draft' ? ' (draft)' : ''}
                </option>
              ))
            )}
          </Select>
          {matchingAmendments.length === 0 ? (
            <p className="muted">
              <Link href="/editor/amendments">Record a law first</Link> before publishing this hop.
            </p>
          ) : null}
        </>
      ) : (
        <p className="muted">This hop will not appear on the public amendment timeline.</p>
      )}
      <Button variant="primary" disabled={showAmendmentSelect && !amendmentId}>
        Publish
      </Button>
    </form>
  );
}
