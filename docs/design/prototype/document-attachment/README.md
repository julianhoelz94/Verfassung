# Document attachment preview

User-facing interactive preview: https://document-attachment-studio.sillycurlew.chatgpt.site

The Site is private to its owner and uses sample data. The preview bundles the actual shared component; files and notes stay in browser memory.

In the cloud environment, localhost is for internal verification only. Give the user the hosted HTTPS URL. Restarting a cloud-local server does not make localhost reachable from their computer.

The separate hosting checkout is `/workspace/sites/document-attachment-preview`; preserve its `.openai/hosting.json` and existing Site identity when publishing updates. Follow the Sites skill for source synchronization and private deployment. Rebuild its `index.html` from this directory's `build.mjs`, then run its `build.mjs` to populate `dist`.
