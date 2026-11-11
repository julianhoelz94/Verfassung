import type { WikiPageRevision } from "./api";

export type WikiCommandResult =
  | { ok: true; page: WikiPageRevision }
  | { ok: false; error: "documents" | "save" | "publish" };
export type WikiCommand = (data: FormData) => Promise<WikiCommandResult>;
