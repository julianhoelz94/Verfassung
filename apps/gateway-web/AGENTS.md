# gateway-web

Next.js 16 App Router + TypeScript. See the [`frontend map`](../../docs/CODEMAPS/frontend.md).

- Compose service data through HTTP clients; no direct database access. Use SSR for public content and let optional services fail gracefully.
- Reuse the article renderer for public and preview views.
- Verify UI changes with `npm run lint && npm run build` here. For journey, axe, or visual changes, run `npm run test:e2e`; Linux Chromium snapshots are in `e2e/snapshots/`.
- Prefer server components for public pages and client components for interactive editor UI. Follow existing TypeScript conventions; add UI libraries only when needed.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
