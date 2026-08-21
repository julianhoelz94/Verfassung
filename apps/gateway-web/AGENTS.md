# gateway-web

Next.js 14 App Router, TypeScript. Public reading experience and later editor routes.

- Keep this app a composition layer: fetch via service HTTP clients, no direct DB.
- SSR for public content pages when adding real routes.
- Fail optional backend data gracefully; do not block the whole page on a down search index.
- Reuse the same article renderer for public and preview once the editor exists.
- After UI changes: `npm run lint` and `npm run build` in this directory only.
