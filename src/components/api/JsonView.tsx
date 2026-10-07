"use client";

import { Fragment, type ReactNode } from "react";
import clsx from "clsx";

/** Pretty-prints JSON with light syntax colouring. Wraps long strings instead of scrolling the page. */
export function JsonView({ value, className, maxHeight = 420 }: { value: unknown; className?: string; maxHeight?: number }) {
  const text = value === undefined ? "" : JSON.stringify(value, null, 2);
  const parts: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1] && m[2]) parts.push(<span key={k++} className="text-[#7dd3fc]">{m[1]}</span>, <Fragment key={k++}>{m[2]}</Fragment>);
    else if (m[1]) parts.push(<span key={k++} className="text-[#a3e635]">{m[1]}</span>);
    else if (m[3]) parts.push(<span key={k++} className="text-[#c084fc]">{m[3]}</span>);
    else parts.push(<span key={k++} className="text-[#fbbf24]">{m[4]}</span>);
    last = re.lastIndex;
  }
  parts.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return (
    <pre
      data-export-language="json"
      className={clsx("overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed break-all whitespace-pre-wrap text-muted", className)}
      style={{ maxHeight }}
    >
      {parts}
    </pre>
  );
}
