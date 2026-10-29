import type { ReactNode } from 'react';

export type ReaderIconName = 'book' | 'contents' | 'search' | 'compare' | 'wiki' | 'details' | 'settings' | 'up' | 'down' | 'close' | 'swap' | 'check' | 'link' | 'arrow' | 'edit' | 'copy';
const paths: Record<ReaderIconName, ReactNode> = {
  book: <><path d="M12 7c-3-3-7-3-9-2v15c2-1 6-1 9 2 3-3 7-3 9-2V5c-2-1-6-1-9 2Z" /><path d="M12 7v15" /></>,
  contents: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>,
  search: <><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></>,
  compare: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="19" r="2" /><path d="M6 7v9a3 3 0 0 0 3 3h3m-3-3 3 3-3 3M18 17V8a3 3 0 0 0-3-3h-3m3-3-3 3 3 3" /></>,
  wiki: <><path d="M4 3h13a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2Zm0 14h15M8 7h7M8 11h7" /></>,
  details: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  settings: <><path d="M3 6h5m6 0h7M3 12h10m6 0h2M3 18h2m6 0h10" /><path d="M8 3v6m5 0v6M5 15v6" /></>,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  swap: <path d="M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4" />,
  check: <path d="m4 12 5 5L20 6" />,
  link: <><path d="m10 13 4-4M9 15l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></>,
  arrow: <path d="M5 5v12h12m-5-5 5 5-5 5" />,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
  edit: <><path d="m16 3 5 5-12 12-6 1 1-6Zm-10 10 5 5M14 5l5 5" /></>,
};
export function ReaderIcon({ name }: { name: ReaderIconName }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
