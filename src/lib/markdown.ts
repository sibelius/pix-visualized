/** The same DOM reader runs against build-time HTML and the current browser page. */
export type MarkdownSection = {
  id: string;
  title: string;
  explanation: string;
  conceptIds: string[];
  example: string;
};

export type MarkdownChapter = {
  href: string;
  title: string;
  introduction: string;
  sections: MarkdownSection[];
  concepts: Map<string, string>;
  takeaways: string;
};

function normalize(text: string) {
  let fence = "";
  let blanks = 0;
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    if (fence) {
      lines.push(line);
      if (line === fence) fence = "";
      continue;
    }
    const opening = /^(\s*)(`{3,})[^`]*$/.exec(line);
    if (opening) {
      fence = `${opening[1]}${opening[2]}`;
      blanks = 0;
      lines.push(line);
    } else {
      const trimmed = line.replace(/[ \t]+$/, "");
      blanks = trimmed ? 0 : blanks + 1;
      if (blanks < 2) lines.push(trimmed);
    }
  }
  return lines.join("\n").trim();
}
const escape = (text: string) => text.replace(/([\\`*_[\]<>])/g, "\\$1");

export function codeBlock(text: string, language = "") {
  const runs = text.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
  return `${fence}${language}\n${text.replace(/\n$/, "")}\n${fence}`;
}

function inlineCode(text: string) {
  const fence = "`".repeat(Math.max(1, ...(text.match(/`+/g) ?? []).map((run) => run.length + 1)));
  const padding = text.startsWith("`") || text.endsWith("`") || /^ .* $/.test(text) ? " " : "";
  return `${fence}${padding}${text}${padding}${fence}`;
}

function children(node: Node, exclude?: string): string {
  return Array.from(node.childNodes).map((child) => render(child, exclude)).join("");
}

function codeText(element: Element): string {
  const raw = element.getAttribute("data-export-code");
  if (raw !== null) return raw;
  return Array.from(element.childNodes).map((child) => {
    const text = child.textContent ?? "";
    return child.nodeType === 1 && (child as Element).tagName === "DIV" ? `${text}\n` : text;
  }).join("");
}

function codeLanguage(text: string) {
  if (text.trimStart().startsWith("<")) return "xml";
  if (/^[\[{]/.test(text.trimStart())) {
    try { JSON.parse(text); return "json"; } catch { /* An editable example can contain invalid JSON. */ }
  }
  return "";
}

function render(node: Node, exclude?: string): string {
  if (node.nodeType === 3) return escape((node.textContent ?? "").replace(/\s+/g, " "));
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (element.matches("[data-export-ignore], [data-export-pending], [hidden], [aria-hidden='true'], script, style, svg, nav") ||
      (exclude && element.matches(exclude))) return "";
  if (element.hasAttribute("data-export-browser-only")) return "\n\nThis example requires the interactive web page.\n\n";
  if (tag === "button") return element.getAttribute("aria-pressed") === "true" ? ` ${inlineCode(element.textContent ?? "")} ` : "";
  if (tag === "input") {
    const input = element as HTMLInputElement;
    const type = element.getAttribute("type") ?? "text";
    if (type === "hidden") return "";
    if (type === "checkbox" || type === "radio") return `${input.checked ?? element.hasAttribute("checked") ? "yes" : "no"} `;
    return ` ${inlineCode(input.value ?? element.getAttribute("value") ?? "")} `;
  }
  if (tag === "textarea") {
    const text = (element as HTMLTextAreaElement).value ?? element.textContent ?? "";
    return `\n\n${codeBlock(text, element.getAttribute("data-export-language") ?? codeLanguage(text))}\n\n`;
  }
  if (tag === "select") {
    const select = element as HTMLSelectElement;
    const value = select.value;
    const selected = Array.from(element.querySelectorAll("option")).find((option) => option.getAttribute("value") === value || option.hasAttribute("selected"));
    return inlineCode(selected?.textContent ?? value ?? "");
  }
  if (tag === "pre" || element.hasAttribute("data-export-code") || element.hasAttribute("data-export-language")) {
    const text = codeText(element);
    const language = element.getAttribute("data-export-language") ?? codeLanguage(text);
    return text.trim() ? `\n\n${codeBlock(text, language)}\n\n` : "";
  }
  if (tag === "code") return inlineCode(element.textContent ?? "");
  if (tag === "table") {
    const rows = Array.from(element.querySelectorAll("tr")).filter((row) => !row.closest("[data-export-ignore], [hidden]"));
    const cells = rows.map((row) => Array.from(row.children).map((cell) => normalize(children(cell, exclude)).replace(/\|/g, "\\|").replace(/\n+/g, "<br>")));
    const width = Math.max(0, ...cells.map((row) => row.length));
    if (!width) return "";
    const line = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? "").join(" | ")} |`;
    const hasHeader = rows[0]?.querySelector("th") !== null;
    const header = hasHeader ? cells.shift()! : Array<string>(width).fill("");
    return `\n\n${[line(header), line(Array<string>(width).fill("---")), ...cells.map(line)].join("\n")}\n\n`;
  }
  if (tag === "ul" || tag === "ol") {
    const items = Array.from(element.children).filter((child) => child.tagName === "LI");
    return `\n\n${items.map((item, i) => {
      const text = normalize(children(item, exclude));
      return text ? `${tag === "ol" ? `${i + 1}.` : "-"} ${text.replace(/\n/g, "\n  ")}` : "";
    }).filter(Boolean).join("\n")}\n\n`;
  }
  const content = children(element, exclude);
  if (/^h[1-6]$/.test(tag)) return `\n\n${"#".repeat(Number(tag[1]))} ${normalize(content)}\n\n`;
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${content}**`;
  if (tag === "em" || tag === "i") return `*${content}*`;
  if (tag === "a") {
    const href = element.getAttribute("href") ?? "";
    return /^(https?:\/\/|\/|#)/.test(href) && content.trim() ? `[${content}](<${href.replace(/>/g, "%3E")}>)` : content;
  }
  if (tag === "blockquote") return `\n\n${normalize(content).split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
  if (["p", "div", "section", "header", "dl", "dt", "dd", "label"].includes(tag)) return content.trim() ? `\n\n${content}\n\n` : "";
  return content;
}

export function elementToMarkdown(element: Element, exclude?: string) {
  return normalize(render(element, exclude));
}

export function readMarkdownChapter(root: Element, href: string): MarkdownChapter {
  const header = root.querySelector("[data-export-header]");
  if (!header) throw new Error(`Missing chapter header: ${href}`);
  const concepts = new Map<string, string>();
  for (const element of root.querySelectorAll("[data-export-concept]")) {
    const id = element.getAttribute("data-export-concept")!;
    if (concepts.has(id)) throw new Error(`Duplicate concept: ${href}#${id}`);
    const name = element.querySelector("[data-export-concept-name]")?.textContent ?? id;
    const paragraphs = Array.from(element.querySelectorAll("p")).map((p) => elementToMarkdown(p));
    const examples = Array.from(element.querySelectorAll("[data-export-concept-examples] > span")).map((span) => escape(span.textContent ?? ""));
    concepts.set(id, [`### ${escape(name)}`, ...paragraphs, examples.length ? `Examples: ${examples.join(", ")}.` : ""].filter(Boolean).join("\n\n"));
  }
  const ids = new Set<string>();
  const sections = Array.from(root.querySelectorAll("[data-export-section]")).map((section) => {
    const id = section.closest("[id]")?.id;
    if (!id || !/^[a-z0-9-]+$/.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate section: ${href}#${id}`);
    ids.add(id);
    const introduction = section.querySelector("[data-export-intro]");
    const notes = Array.from(section.querySelectorAll("[data-export-callout]")).map((note) => elementToMarkdown(note));
    const example = elementToMarkdown(section, "[data-export-lead], [data-export-callout]");
    return {
      id,
      title: section.querySelector("h2")?.textContent?.trim() ?? id,
      explanation: [introduction ? elementToMarkdown(introduction) : "", ...notes].filter(Boolean).join("\n\n"),
      conceptIds: Array.from(new Set((section.getAttribute("data-export-concepts") ?? "").split(" ").filter(Boolean))),
      example,
    };
  });
  for (const section of sections) {
    for (const id of section.conceptIds) {
      if (!concepts.has(id)) throw new Error(`Unknown concept: ${href}/${section.id} → ${id}`);
    }
  }
  if (!sections.length) throw new Error(`No sections: ${href}`);
  const description = header.querySelector("[data-export-description]");
  const takeaways = root.querySelector("[data-export-takeaways]");
  return {
    href,
    title: header.querySelector("h1")?.textContent?.trim() ?? href,
    introduction: description ? elementToMarkdown(description) : "",
    sections,
    concepts,
    takeaways: takeaways ? elementToMarkdown(takeaways) : "",
  };
}

export function markdownPath(href: string, sectionId?: string, examples = false) {
  return `${href}${sectionId ? `/${sectionId}` : ""}${examples ? ".examples" : ""}.md`;
}

export function chapterToMarkdown(chapter: MarkdownChapter, options: { sectionId?: string; examples?: "initial" | "current"; origin?: string } = {}) {
  const sections = options.sectionId ? chapter.sections.filter((section) => section.id === options.sectionId) : chapter.sections;
  if (!sections.length) throw new Error(`Unknown section: ${options.sectionId}`);
  const source = `${options.origin ?? ""}${chapter.href}${options.sectionId ? `#${options.sectionId}` : ""}`;
  const parts = [`# ${escape(chapter.title)}${options.sectionId ? ` — ${escape(sections[0].title)}` : ""}`, `Source: ${source}`];
  if (!options.sectionId) parts.push(chapter.introduction);
  for (const section of sections) {
    if (!options.sectionId) parts.push(`## ${escape(section.title)}`);
    parts.push(section.explanation);
    if (options.examples && section.example) parts.push(`### ${options.examples === "current" ? "Current" : "Initial"} example`, section.example);
  }
  const conceptIds = options.sectionId ? sections[0].conceptIds : Array.from(chapter.concepts.keys());
  if (conceptIds.length) parts.push("## Related concepts", ...conceptIds.map((id) => chapter.concepts.get(id)!));
  if (!options.sectionId && chapter.takeaways) parts.push("## Takeaways", chapter.takeaways);
  if (!options.sectionId) parts.push("## Sections", ...sections.map((section) => `- [${escape(section.title)}](${markdownPath(chapter.href, section.id)})`));
  else parts.push(`[Chapter context](${markdownPath(chapter.href)})`);
  if (!options.examples) parts.push(`[With initial examples](${markdownPath(chapter.href, options.sectionId, true)})`);
  else if (options.examples === "initial") parts.push("Examples show the initial page state. Browser-only computations and interactive results are available on the web page.", `[Explanations only](${markdownPath(chapter.href, options.sectionId)})`);
  return `${parts.filter(Boolean).join("\n\n")}\n`;
}
