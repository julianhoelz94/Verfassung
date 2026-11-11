import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
const require = createRequire(
  new URL("../../../../apps/gateway-web/package.json", import.meta.url),
);
const { build } = require("esbuild");
const result = await build({
  entryPoints: [fileURLToPath(new URL("./preview.tsx", import.meta.url))],
  outfile: "preview.js",
  bundle: true,
  write: false,
  minify: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  nodePaths: [
    fileURLToPath(
      new URL("../../../../apps/gateway-web/node_modules", import.meta.url),
    ),
  ],
  plugins: [
    {
      name: "local-preview-adapters",
      setup(build) {
        build.onResolve({ filter: /^next\/(navigation|link)$/ }, (args) => ({
          path: args.path,
          namespace: "preview",
        }));
        build.onResolve(
          { filter: /(login|content-translation)\/actions$/ },
          (args) => ({ path: args.path, namespace: "preview-actions" }),
        );
        build.onResolve({ filter: /NodeTitleForm$/ }, () => ({
          path: "NodeTitleForm",
          namespace: "preview-node",
        }));
        build.onLoad({ filter: /.*/, namespace: "preview-node" }, () => ({
          contents: "export function NodeTitleForm(){return null}",
        }));
        build.onLoad({ filter: /.*/, namespace: "preview-actions" }, () => ({
          contents:
            'export async function logoutAction(){throw new Error("Preview only")} export async function translateContentAction(){throw new Error("Preview only")}',
        }));
        build.onLoad({ filter: /.*/, namespace: "preview" }, (args) => ({
          loader: "jsx",
          contents:
            args.path === "next/link"
              ? "export default function Link({children,...props}) {return <a {...props}>{children}</a>}"
              : 'export const usePathname=()=>"/admin/import/setup/preview"; export const useSearchParams=()=>new URLSearchParams(location.search); export const useRouter=()=>({push(){},replace(){},refresh(){}});',
        }));
      },
    },
  ],
});
const js = result.outputFiles.find((file) => file.path.endsWith(".js")).text;
const css = result.outputFiles.find((file) => file.path.endsWith(".css")).text;
const output = process.argv[2] || "/tmp/constitution-setup-review/index.html";
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Interaktiver Entwurf für die Prüfung einer Verfassungseinrichtung. Beispieldaten, keine Änderungen am Live-System."><title>Verfassung einrichten · Constitution Atlas</title><style>${css}</style></head><body><div id="root"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`,
);
console.log(output);
