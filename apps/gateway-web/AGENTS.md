# gateway-web

Next.js 15 App Router + TypeScript. See the [`frontend map`](../../docs/CODEMAPS/frontend.md).

- Compose service data through HTTP clients; no direct database access. Use SSR for public content and let optional services fail gracefully.
- Reuse the article renderer for public and preview views.
- Verify UI changes with `npm run lint && npm run build` here. For journey, axe, or visual changes, run `npm run test:e2e`; Linux Chromium snapshots are in `e2e/snapshots/`.
- Prefer server components for public pages and client components for interactive editor UI. Follow existing TypeScript conventions; add UI libraries only when needed.
