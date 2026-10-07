import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { CHAPTERS } from "../src/content/index.ts";
import { chapterToMarkdown, markdownPath, readMarkdownChapter } from "../src/lib/markdown.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildMarkdownAssets() {
  const assets = new Map<string, string>();
  const add = (path: string, content: string) => {
    if (assets.has(path) || !content.trim()) throw new Error(`Duplicate or empty Markdown asset: ${path}`);
    assets.set(path, content);
  };
  const index = ["# Pix, visualized", "An independent study aid for Pix. Start with one chapter or section; examples are optional.", "## Chapters"];
  for (const chapter of CHAPTERS) {
    try {
      const module = await import(pathToFileURL(join(root, "src/app", chapter.href, "page.tsx")).href);
      const Page = module.default as ComponentType;
      const html = renderToStaticMarkup(createElement(Page));
      const { document } = parseHTML(`<html><body><main>${html}</main></body></html>`);
      // linkedom leaves RCDATA entities encoded in textarea values; browsers decode them.
      for (const textarea of document.querySelectorAll("textarea")) {
        const decoder = document.createElement("div");
        decoder.innerHTML = textarea.textContent ?? "";
        textarea.value = decoder.textContent ?? "";
      }
      const content = readMarkdownChapter(document.querySelector("main")!, chapter.href);
      for (const examples of [false, true]) {
        const options = examples ? { examples: "initial" as const } : {};
        add(markdownPath(chapter.href, undefined, examples), chapterToMarkdown(content, options));
        for (const section of content.sections) {
          add(markdownPath(chapter.href, section.id, examples), chapterToMarkdown(content, { ...options, sectionId: section.id }));
        }
      }
      index.push(`- [${content.title}](${markdownPath(chapter.href)}): ${chapter.thesis}`);
    } catch (error) {
      throw new Error(`Markdown export failed for ${chapter.href}`, { cause: error });
    }
  }
  add("/llms.txt", `${index.join("\n\n")}\n`);
  return assets;
}

export async function writeMarkdownAssets(assets: Map<string, string>, projectRoot = root) {
  const manifest = join(projectRoot, ".markdown-export-manifest.json");
  let previous: string[] = [];
  try {
    previous = JSON.parse(await readFile(manifest, "utf8")) as string[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const ownedPath = (path: string) => path === "/llms.txt" || /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)?(?:\.examples)?\.md$/.test(path);
  if (!Array.isArray(previous) || [...previous, ...assets.keys()].some((path) => typeof path !== "string" || !ownedPath(path))) {
    throw new Error("Invalid Markdown export manifest; refusing to write outside generated paths.");
  }
  for (const [path, content] of assets) {
    const file = join(projectRoot, "public", path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
  for (const path of previous) {
    if (!assets.has(path)) await unlink(join(projectRoot, "public", path)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  await writeFile(manifest, `${JSON.stringify(Array.from(assets.keys()), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const assets = await buildMarkdownAssets();
  await writeMarkdownAssets(assets);
  console.log(`Generated ${assets.size} Markdown assets from ${CHAPTERS.length} chapters.`);
}
