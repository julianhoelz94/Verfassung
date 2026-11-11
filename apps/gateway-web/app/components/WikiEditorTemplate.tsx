"use client";

import type { WikiPageRevision } from "../../lib/api";
import type { Locale } from "../../lib/locale";
import type { WikiOwner } from "../../lib/wiki-routing";
import type { WikiCommand } from "../../lib/wiki-workspace";
import { WikiWorkspaceView } from "../editor/wiki/WikiWorkspaceView";

export type WikiEditorTemplateProps = {
  owner: WikiOwner;
  ownerName: string;
  actorId: string;
  publicHref: string;
  locale: Locale;
  draft: WikiPageRevision | null;
  published: WikiPageRevision | null;
  history: WikiPageRevision[];
  historyPage: number;
  historyLinks: { newer?: string; older?: string };
  query: { saved?: string; published?: string; error?: string };
  embedded: boolean;
  returnTo?: string;
  canEdit: boolean;
  canPublish: boolean;
  saveAction: WikiCommand;
  publishAction: WikiCommand;
};

/** One retained workspace for country, regional and constitution Wikis. */
export function WikiEditorTemplate(props: WikiEditorTemplateProps) {
  return <WikiWorkspaceView {...props} />;
}
