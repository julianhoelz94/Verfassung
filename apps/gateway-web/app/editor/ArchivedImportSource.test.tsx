import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArchivedImportSource } from "./ArchivedImportSource";

describe("archived source rendering", () => {
  it('keeps text from deeply nested legacy markup without rendering active descendants', () => {
    const html = '<div>'.repeat(2500) + 'Exact source wording<script>hidden code</script>' + '</div>'.repeat(2500);
    const output = renderToStaticMarkup(<ArchivedImportSource sourceUrl="https://archive.example/source" html={html} />);
    const doc = new DOMParser().parseFromString(output, 'text/html');
    expect(doc.body.textContent).toBe('Exact source wording');
    expect(doc.querySelector('script')).toBeNull();
  });
  it("preserves authored headings, marks, tables and source-relative links", () => {
    const output = renderToStaticMarkup(
      <ArchivedImportSource
        sourceUrl="https://archive.example/constitution/page.html"
        html={
          '<h2 id="a1">Art. I</h2><p>Human <strong>dignity</strong><sup><a href="#n1">1</a></sup></p><table><tr><td colspan="2">Exact table wording</td></tr></table><p id="n1"><a href="notes.html">Source note</a></p>'
        }
      />,
    );
    const doc = new DOMParser().parseFromString(output, "text/html");
    expect(doc.querySelector('[role="heading"]')?.textContent).toBe("Art. I");
    expect(doc.querySelector('[role="heading"]')?.getAttribute('aria-level')).toBe('3');
    expect(doc.querySelector('h1')).toBeNull();
    expect(doc.querySelector("strong")?.textContent).toBe("dignity");
    expect(doc.querySelector("td")?.getAttribute("colspan")).toBe("2");
    expect(doc.querySelector("sup a")?.getAttribute("href")).toBe(
      "#archived-source-n1",
    );
    expect(doc.querySelector("#archived-source-n1 a")?.getAttribute("href")).toBe(
      "https://archive.example/constitution/notes.html",
    );
  });
  it("does not execute or load active source content while keeping ordinary wording", () => {
    const output = renderToStaticMarkup(
      <ArchivedImportSource
        sourceUrl="https://archive.example/source"
        html={
          '<script>evil()</script><style>body{display:none}</style><meta http-equiv="refresh" content="0;url=https://other.example"><iframe src="https://other.example"></iframe><p onclick="evil()" style="display:none">Keep this wording<img src="https://other.example/pixel"><a href="javascript:evil()">label</a></p>'
        }
      />,
    );
    const doc = new DOMParser().parseFromString(output, "text/html");
    expect(
      doc.querySelector("script,style,meta,iframe,img,[onclick],[style]"),
    ).toBeNull();
    expect(doc.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(doc.body.textContent).toBe("Keep this wordinglabel");
  });
});
