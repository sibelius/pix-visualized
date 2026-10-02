"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";

/** A tiny XML tree: enough to build SPI messages and render them with hover explanations. */
export type XNode = {
  tag: string;
  attrs?: Record<string, string>;
  text?: string;
  children?: (XNode | null | false | undefined)[];
  /** visually flag this element (e.g. the field that changed) */
  mark?: "good" | "bad" | "warn";
};

export const x = (tag: string, ...kids: (XNode | string | null | false | undefined)[]): XNode => {
  if (kids.length === 1 && typeof kids[0] === "string") return { tag, text: kids[0] };
  return { tag, children: kids.filter((k): k is XNode => !!k && typeof k !== "string") };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Serialize to the 4-space-indented form used in the Catálogo examples. */
export function toXml(n: XNode, decl = true, ind = 0): string {
  const pad = "    ".repeat(ind);
  const attrs = n.attrs ? Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("") : "";
  const kids = (n.children ?? []).filter((c): c is XNode => !!c);
  let out: string;
  if (n.text !== undefined) out = `${pad}<${n.tag}${attrs}>${esc(n.text)}</${n.tag}>`;
  else if (!kids.length) out = `${pad}<${n.tag}${attrs}/>`;
  else out = `${pad}<${n.tag}${attrs}>\n${kids.map((c) => toXml(c, false, ind + 1)).join("\n")}\n${pad}</${n.tag}>`;
  return decl ? `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${out}` : out;
}

/** The SPI envelope: AppHdr (head.001) + Document, namespace https://www.bcb.gov.br/pi/{msg}/{version}. */
export function envelope(msg: string, version: string, from: string, to: string, bizMsgIdr: string, creDt: string, doc: XNode): XNode {
  const fi = (id: string) => x("FIId", x("FinInstnId", x("Othr", x("Id", id))));
  return {
    tag: "Envelope",
    attrs: { xmlns: `https://www.bcb.gov.br/pi/${msg}/${version}` },
    children: [
      x(
        "AppHdr",
        x("Fr", fi(from)),
        x("To", fi(to)),
        x("BizMsgIdr", bizMsgIdr),
        x("MsgDefIdr", `${msg}.spi.${version}`),
        x("CreDt", creDt),
        { tag: "Sgntr", text: "…XMLDSig omitted…" },
      ),
      x("Document", doc),
    ],
  };
}

type Line = { depth: number; node: XNode; kind: "open" | "close" | "leaf" | "empty" | "folded"; path: string };

function lines(n: XNode, folded: Set<string>, depth = 0, path = ""): Line[] {
  const p = path ? `${path}/${n.tag}` : n.tag;
  const kids = (n.children ?? []).filter((c): c is XNode => !!c);
  if (n.text !== undefined) return [{ depth, node: n, kind: "leaf", path: p }];
  if (!kids.length) return [{ depth, node: n, kind: "empty", path: p }];
  if (folded.has(p)) return [{ depth, node: n, kind: "folded", path: p }];
  return [{ depth, node: n, kind: "open", path: p }, ...kids.flatMap((c) => lines(c, folded, depth + 1, p)), { depth, node: n, kind: "close", path: p }];
}

/** Explanations keyed by tag name, or by a path suffix such as "Bal/Tp/CdOrPrtry/Prtry" (longest match wins). */
export type Glossary = Record<string, ReactNode>;

function lookup(g: Glossary, path: string): ReactNode | undefined {
  const parts = path.split("/");
  for (let i = 0; i < parts.length; i++) {
    const key = parts.slice(i).join("/");
    if (g[key] !== undefined) return g[key];
  }
  return undefined;
}

/** XML viewer: hover (or tap) an element to see what it means. */
export function XmlView({
  node,
  glossary = {},
  maxHeight = 420,
  className,
  title,
  fold = ["Envelope/AppHdr"],
}: {
  node: XNode;
  glossary?: Glossary;
  maxHeight?: number;
  className?: string;
  title?: ReactNode;
  /** element paths that start collapsed (click the tag to toggle) */
  fold?: string[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [folded, setFolded] = useState(() => new Set(fold));
  const toggle = (p: string) =>
    setFolded((f) => {
      const n = new Set(f);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const ls = lines(node, folded);
  const info = hover ? lookup(glossary, hover) : undefined;
  return (
    <div className={clsx("min-w-0", className)}>
      {title && <div className="mb-1 font-mono text-[11px] text-faint">{title}</div>}
      <div className="overflow-auto rounded-lg border border-line bg-bg/60 py-2 font-mono text-[11.5px] leading-[1.55]" style={{ maxHeight }}>
        {ls.map((l, i) => {
          const n = l.node;
          const known = lookup(glossary, l.path) !== undefined;
          const active = hover === l.path;
          const attrs = n.attrs
            ? Object.entries(n.attrs).map(([k, v]) => (
                <span key={k}>
                  {" "}
                  <span className="text-info">{k}</span>=<span className="text-warn">&quot;{v}&quot;</span>
                </span>
              ))
            : null;
          const tagCls = clsx(
            known ? "cursor-help underline decoration-dotted decoration-faint underline-offset-2" : "",
            n.mark === "bad" ? "text-bad" : n.mark === "warn" ? "text-warn" : n.mark === "good" ? "text-ok" : "text-accent",
          );
          return (
            <div
              key={i}
              className={clsx("whitespace-pre px-3", active && "bg-panel-2")}
              onMouseEnter={() => setHover(l.path)}
              onClick={() => {
                setHover(l.path);
                if (l.kind === "open" || l.kind === "folded") toggle(l.path);
              }}
            >
              <span>{"  ".repeat(l.depth)}</span>
              {l.kind === "close" ? (
                <span className="text-faint">
                  &lt;/<span className={tagCls}>{n.tag}</span>&gt;
                </span>
              ) : (
                <>
                  <span className="text-faint">&lt;</span>
                  <span className={tagCls}>{n.tag}</span>
                  {attrs}
                  <span className="text-faint">{l.kind === "empty" ? "/>" : ">"}</span>
                  {l.kind === "folded" && (
                    <span className="cursor-pointer text-faint">
                      …&lt;/{n.tag}&gt; <span className="text-[10px]">(click to expand)</span>
                    </span>
                  )}
                  {l.kind === "leaf" && (
                    <>
                      <span className={clsx(n.mark === "bad" ? "text-bad" : n.mark === "good" ? "text-ok" : "text-ink")}>{n.text}</span>
                      <span className="text-faint">
                        &lt;/{n.tag}&gt;
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 min-h-[3.2rem] rounded-lg border border-line bg-panel-2/60 px-3 py-2 text-[13px] leading-relaxed text-muted">
        {hover ? (
          <>
            <span className="font-mono text-[11px] text-faint">{hover.split("/").slice(-3).join("/")}</span>
            <div>{info ?? <span className="text-faint">Structural element.</span>}</div>
          </>
        ) : (
          <span className="text-faint">Hover or tap an element to see what it means.</span>
        )}
      </div>
    </div>
  );
}

/** Plain monospace block for HTTP exchanges, CSV files etc. */
export function Mono({ children, className, maxHeight = 360 }: { children: ReactNode; className?: string; maxHeight?: number }) {
  return (
    <pre
      className={clsx("overflow-auto rounded-lg border border-line bg-bg/60 px-3 py-2 font-mono text-[11.5px] leading-[1.55] whitespace-pre text-ink/90", className)}
      style={{ maxHeight }}
    >
      {children}
    </pre>
  );
}
