import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { chapterToMarkdown, codeBlock, elementToMarkdown, readMarkdownChapter } from "../src/lib/markdown.ts";

const element = (html: string) => parseHTML(`<html><body><main>${html}</main></body></html>`).document.querySelector("main")!;

test("preserves semantic text, nested lists, links, and table cells without interface noise", () => {
  const markdown = elementToMarkdown(element(`
    <h2>API &amp; validation</h2>
    <p>Use <code>client_id</code> with <strong>mTLS</strong>. <a href="/api-pix">Details</a></p>
    <ol><li>Validate<ul><li>Check the signature</li></ul></li><li>Settle</li></ol>
    <table><tr><th>Field</th><th>Value</th></tr><tr><td>reason</td><td>A|B<br>next</td></tr></table>
    <button>Reset</button><svg><text>chart noise</text></svg><p data-export-ignore>Copy Markdown</p>
  `));
  assert.match(markdown, /## API & validation/);
  assert.match(markdown, /Use `client_id` with \*\*mTLS\*\*/);
  assert.match(markdown, /\[Details\]\(<\/api-pix>\)/);
  assert.match(markdown, /1\. Validate\n\s+- Check the signature/);
  assert.match(markdown, /2\. Settle/);
  assert.match(markdown, /\| reason \| A\\\|B<br>next \|/);
  assert.doesNotMatch(markdown, /Reset|chart noise|Copy Markdown/);
});

test("keeps code bytes, indentation, blank lines, and embedded backticks intact", () => {
  const source = '<Root>\n  <Value>A & B</Value>  \n\n\n  ```\n</Root>\n';
  const root = element('<div data-export-language="xml"><span>collapsed view</span></div>');
  root.firstElementChild!.setAttribute("data-export-code", source);
  const markdown = elementToMarkdown(root);
  assert.equal(markdown, codeBlock(source, "xml"));
  assert.ok(markdown.startsWith("````xml\n"));
  assert.doesNotMatch(markdown, /collapsed view/);
  assert.equal(elementToMarkdown(element('<pre><div>&lt;Root&gt;</div><div>  &lt;Value/&gt;</div><div>&lt;/Root&gt;</div></pre>')), '```xml\n<Root>\n  <Value/>\n</Root>\n```');
});

test("exports current form values and explains unavailable browser computations", () => {
  const root = element('<label>Amount<input value="42.90"></label><p data-export-pending>computing…</p><div data-export-browser-only>Generating RSA keys</div>');
  root.querySelector("input")!.value = "99.00";
  const markdown = elementToMarkdown(root);
  assert.match(markdown, /Amount `99\.00`/);
  assert.match(markdown, /requires the interactive web page/);
  assert.doesNotMatch(markdown, /42\.90|computing|Generating/);
});

const fixture = () => element(`
  <header data-export-header><h1>Payments</h1><div data-export-description>Chapter introduction.</div></header>
  <div id="build"><section data-export-section data-export-concepts="shared shared">
    <div data-export-lead><h2>Build</h2><div data-export-intro>Build the message.</div></div>
    <div><p>Output example.</p></div><div data-export-callout>Important rule.</div>
  </section></div>
  <div id="send"><section data-export-section data-export-concepts="shared other">
    <div data-export-lead><h2>Send</h2><div data-export-intro>Send the message.</div></div>
  </section></div>
  <ul data-export-takeaways><li>One conclusion.</li></ul>
  <li data-export-concept="shared"><div data-export-concept-name>Shared concept</div><p>Definition.</p><p>Explanation.</p></li>
  <li data-export-concept="other"><div data-export-concept-name>Other concept</div><p>Other definition.</p></li>
`);

test("limits sections to related concepts and includes each chapter concept once", () => {
  const chapter = readMarkdownChapter(fixture(), "/payments");
  const full = chapterToMarkdown(chapter);
  assert.equal(full.match(/### Shared concept/g)?.length, 1);
  assert.match(full, /One conclusion/);
  assert.match(full, /\[Build\]\(\/payments\/build\.md\)/);
  assert.doesNotMatch(full, /Output example/);
  const section = chapterToMarkdown(chapter, { sectionId: "build" });
  assert.match(section, /Source: \/payments#build/);
  assert.match(section, /Important rule/);
  assert.doesNotMatch(section, /Other definition|Send the message|Chapter introduction|One conclusion/);
  const initial = chapterToMarkdown(chapter, { sectionId: "build", examples: "initial" });
  assert.match(initial, /### Initial example\n\nOutput example/);
  assert.equal(initial.match(/Important rule/g)?.length, 1);
  const current = chapterToMarkdown(chapter, { sectionId: "build", examples: "current", origin: "https://example.com" });
  assert.match(current, /Source: https:\/\/example.com\/payments#build/);
  assert.match(current, /### Current example/);
  assert.doesNotMatch(current, /initial page state/);
});

test("fails clearly for missing sections, duplicate anchors, and unknown concepts", () => {
  const duplicate = fixture();
  duplicate.querySelector("#send")!.id = "build";
  assert.throws(() => readMarkdownChapter(duplicate, "/payments"), /duplicate section/);
  const unknown = fixture();
  unknown.querySelector("[data-export-section]")!.setAttribute("data-export-concepts", "missing");
  assert.throws(() => readMarkdownChapter(unknown, "/payments"), /Unknown concept/);
  assert.throws(() => chapterToMarkdown(readMarkdownChapter(fixture(), "/payments"), { sectionId: "missing" }), /Unknown section/);
});
