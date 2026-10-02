"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { flatten, type XLine, type XNode } from "./xml";

/**
 * Renders an XNode tree as syntax-colored XML. Hovering (or tapping) a line shows the
 * field's path and meaning in the side box.
 */
export function XmlView({
  root,
  title,
  maxHeight = 560,
  defaultPath,
  compact,
  collapse = ["AppHdr"],
}: {
  root: XNode;
  title?: string;
  maxHeight?: number;
  defaultPath?: string;
  compact?: boolean;
  /** tags rendered folded at first (click the tag line to unfold) */
  collapse?: string[];
}) {
  const all = useMemo(() => flatten(root), [root]);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const collapseKey = collapse.join(",");
  const isFolded = (l: XLine) => l.kind === "open" && (folded[l.id] ?? collapseKey.split(",").includes(l.node.tag));
  const lines = useMemo(() => {
    const fold = (l: XLine) => l.kind === "open" && (folded[l.id] ?? collapseKey.split(",").includes(l.node.tag));
    const out: (XLine & { folded?: boolean })[] = [];
    let skipUntil: string | null = null;
    for (const l of all) {
      if (skipUntil) {
        if (l.id === skipUntil) skipUntil = null;
        continue;
      }
      if (fold(l)) {
        out.push({ ...l, folded: true });
        skipUntil = l.id + "/close";
      } else out.push(l);
    }
    return out;
  }, [all, folded, collapseKey]);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const activeId = hover ?? pinned;
  const active: XLine | undefined =
    all.find((l) => l.id === activeId) ?? (defaultPath ? all.find((l) => l.path.endsWith(defaultPath)) : undefined);
  const errors = lines.filter((l) => l.kind !== "close" && l.node.flag === "error").length;

  return (
    <div className={clsx("grid min-w-0 gap-3", !compact && "lg:grid-cols-[minmax(0,1fr)_280px]")}>
      <div className="min-w-0 overflow-hidden rounded-lg border border-line bg-bg">
        {title && (
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5 font-mono text-[11px] text-faint">
            <span className="truncate">{title}</span>
            <span>{errors ? <span className="text-bad">{errors} rule violation{errors > 1 ? "s" : ""}</span> : `${lines.length} lines`}</span>
          </div>
        )}
        <div className="overflow-auto py-2 font-mono text-[11.5px] leading-[1.55]" style={{ maxHeight }} onMouseLeave={() => setHover(null)}>
          {lines.map((l) => (
            <Line
              key={l.id}
              l={l}
              active={active?.id === l.id || active?.id + "/close" === l.id}
              onEnter={() => setHover(l.kind === "close" ? l.id.replace(/\/close$/, "") : l.id)}
              folded={"folded" in l && !!l.folded}
              onClick={() => {
                setPinned(l.kind === "close" ? l.id.replace(/\/close$/, "") : l.id);
                if (l.kind === "open") setFolded((f) => ({ ...f, [l.id]: !isFolded(l) }));
              }}
            />
          ))}
        </div>
      </div>
      <div className={clsx("min-w-0 self-start rounded-lg border border-line bg-panel-2/60 p-3 text-[13px] leading-relaxed", !compact && "lg:sticky lg:top-6")}>
        {active ? (
          <>
            <div className="font-mono text-[11px] break-all text-accent">{active.path.replace(/^Envelope\//, "")}</div>
            {active.node.text !== undefined && (
              <div className="mt-1 font-mono text-[12px] break-all text-ink">= {active.node.text || "∅"}</div>
            )}
            {active.node.attrs && (
              <div className="mt-1 font-mono text-[11px] text-muted">
                {Object.entries(active.node.attrs)
                  .map(([k, v]) => `@${k}=${v}`)
                  .join(" ")}
              </div>
            )}
            <p className={clsx("mt-2", active.node.flag === "error" ? "text-bad" : "text-muted")}>
              {active.node.doc ?? "Container element."}
            </p>
          </>
        ) : (
          <p className="text-faint">Hover a line (tap on mobile) to see what the field means and the rule the catalog attaches to it. Click a container tag to fold or unfold it.</p>
        )}
      </div>
    </div>
  );
}

function Line({ l, active, onEnter, onClick, folded }: { l: XLine; active: boolean; onEnter: () => void; onClick: () => void; folded?: boolean }) {
  const n = l.node;
  const attrs = n.attrs
    ? Object.entries(n.attrs).map(([k, v]) => (
        <span key={k}>
          {" "}
          <span className="text-warn/90">{k}</span>
          <span className="text-faint">=</span>
          <span className="text-ok">&quot;{v}&quot;</span>
        </span>
      ))
    : null;
  const tagCls = clsx(n.flag === "error" ? "text-bad" : n.flag === "hot" ? "text-accent" : "text-info");
  return (
    <div
      onMouseEnter={onEnter}
      onClick={onClick}
      className={clsx(
        "cursor-default pr-3 whitespace-pre",
        active ? "bg-accent/10" : "hover:bg-panel-2",
        n.flag === "error" && l.kind !== "close" && "bg-bad/10",
      )}
      style={{ paddingLeft: 12 + l.depth * 14 }}
    >
      {folded ? (
        <span className={tagCls}>
          <span className="text-faint">▸ &lt;</span>
          {n.tag}
          {attrs}
          <span className="text-faint">&gt;</span>
          <span className="mx-1 rounded bg-panel-2 px-1 text-faint">…</span>
          <span className="text-faint">&lt;/</span>
          {n.tag}
          <span className="text-faint">&gt;</span>
        </span>
      ) : l.kind === "close" ? (
        <span className={tagCls}>
          <span className="text-faint">&lt;/</span>
          {n.tag}
          <span className="text-faint">&gt;</span>
        </span>
      ) : l.kind === "open" ? (
        <span className={tagCls}>
          <span className="text-faint">&lt;</span>
          {n.tag}
          {attrs}
          <span className="text-faint">&gt;</span>
        </span>
      ) : n.text === undefined ? (
        <span className={tagCls}>
          <span className="text-faint">&lt;</span>
          {n.tag}
          {attrs}
          <span className="text-faint">/&gt;</span>
        </span>
      ) : (
        <>
          <span className={tagCls}>
            <span className="text-faint">&lt;</span>
            {n.tag}
            {attrs}
            <span className="text-faint">&gt;</span>
          </span>
          <span className={n.flag === "error" ? "text-bad" : "text-ink"}>{n.text}</span>
          <span className={tagCls}>
            <span className="text-faint">&lt;/</span>
            {n.tag}
            <span className="text-faint">&gt;</span>
          </span>
        </>
      )}
    </div>
  );
}
