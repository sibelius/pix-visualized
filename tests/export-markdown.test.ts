import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildMarkdownAssets, writeMarkdownAssets } from "../scripts/export-markdown.ts";
import { CHAPTERS } from "../src/content/index.ts";

test("generates every chapter and section reproducibly, with resolvable export links", async () => {
  const assets = await buildMarkdownAssets();
  assert.deepEqual(await buildMarkdownAssets(), assets);
  for (const chapter of CHAPTERS) {
    assert.ok(assets.has(`${chapter.href}.md`));
    assert.ok(assets.has(`${chapter.href}.examples.md`));
  }
  assert.ok(assets.get("/llms.txt")!.length < 10000);
  for (const [path, markdown] of assets) {
    assert.match(markdown, /^# /, path);
    assert.doesNotMatch(markdown, /<script|Copy Markdown|generating RSA|Generating RSA|computing…/, path);
    for (const match of markdown.matchAll(/\]\((\/[a-z0-9/.\-]+(?:\.md))\)/g)) {
      assert.ok(assets.has(match[1]), `${path}: unresolved ${match[1]}`);
    }
  }
  assert.match(assets.get("/qrcode/crc.md")!, /polynomial 0x1021/);
  assert.doesNotMatch(assets.get("/qrcode/crc.md")!, /Initial example/);
  assert.match(assets.get("/pacs008/builder.examples.md")!, /```xml\n<Envelope/);
  assert.match(assets.get("/pacs008/builder.examples.md")!, /<AppHdr>\n\s+<Fr>/);
  assert.match(assets.get("/api-pix/console.examples.md")!, /```json/);
  const requestJson = assets.get("/api-pix/console.examples.md")!.match(/```json\n([\s\S]*?)\n```/)![1];
  assert.equal(JSON.parse(requestJson).valor.original, "37.00");
});

test("removes only stale generated files and refuses unsafe manifest paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "pix-markdown-test-"));
  try {
    await mkdir(join(root, "public"));
    await writeFile(join(root, "public", "notes.md"), "Hand-authored file");
    await writeMarkdownAssets(new Map([["/old.md", "# Old\n"]]), root);
    await writeMarkdownAssets(new Map([["/new.md", "# New\n"]]), root);
    await assert.rejects(readFile(join(root, "public", "old.md")), { code: "ENOENT" });
    assert.equal(await readFile(join(root, "public", "notes.md"), "utf8"), "Hand-authored file");
    assert.equal(await readFile(join(root, "public", "new.md"), "utf8"), "# New\n");
    await writeFile(join(root, ".markdown-export-manifest.json"), '["/../notes.md"]');
    await assert.rejects(writeMarkdownAssets(new Map(), root), /refusing to write outside/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
