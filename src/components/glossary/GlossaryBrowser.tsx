"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CHAPTER_COLOR, type ChapterKey } from "@/components/shell/nav";
import { CHAPTERS } from "@/content";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const f = fold(text);
  const out: ReactNode[] = [];
  let i = 0;
  for (let j = f.indexOf(q); j >= 0; j = f.indexOf(q, i)) {
    if (j > i) out.push(text.slice(i, j));
    out.push(
      <mark key={j} className="rounded-sm bg-accent/25 px-0.5 text-ink">
        {text.slice(j, j + q.length)}
      </mark>,
    );
    i = j + q.length;
  }
  out.push(text.slice(i));
  return <>{out}</>;
}

const ENTRIES = CHAPTERS.flatMap((ch) => ch.concepts.map((c) => ({ ...c, ch }))).sort((a, b) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
);

export function GlossaryBrowser() {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<ChapterKey | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = fold(query.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(
    () =>
      ENTRIES.filter(
        (e) =>
          (!only || e.ch.key === only) &&
          (!q || fold(e.name).includes(q) || fold(e.what).includes(q) || fold(e.why).includes(q) || (e.examples ?? []).some((x) => fold(x).includes(q))),
      ),
    [q, only],
  );

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 space-y-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${ENTRIES.length} concepts…  (press /)`}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-faint"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setOnly(null)}
            className={clsx("rounded-full border px-2.5 py-0.5 text-xs", !only ? "border-faint bg-panel-2 text-ink" : "border-line text-muted")}
          >
            all chapters
          </button>
          {CHAPTERS.map((ch) => (
            <button
              key={ch.key}
              type="button"
              onClick={() => setOnly(only === ch.key ? null : ch.key)}
              className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs", only === ch.key ? "bg-panel-2 text-ink" : "border-line text-muted hover:text-ink")}
              style={only === ch.key ? { borderColor: CHAPTER_COLOR[ch.key] } : undefined}
            >
              <span className="size-1.5 rounded-full" style={{ background: CHAPTER_COLOR[ch.key] }} />
              {ch.bookChapter}. {ch.title}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 mb-4 text-xs text-faint">{shown.length} shown</div>
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((e) => (
          <li key={`${e.ch.key}-${e.id}`} className="rounded-xl border border-line bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold">
                <Hl text={e.name} q={q} />
              </div>
              <Link
                href={`${e.ch.href}#${e.viz ?? e.id}`}
                className="shrink-0 font-mono text-[11px] hover:underline"
                style={{ color: CHAPTER_COLOR[e.ch.key] }}
              >
                ch.{e.ch.bookChapter} →
              </Link>
            </div>
            <p className="mt-1 text-sm text-ink/90">
              <Hl text={e.what} q={q} />
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              <Hl text={e.why} q={q} />
            </p>
            {e.examples && e.examples.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {e.examples.map((x) => (
                  <span key={x} className="rounded border border-line bg-panel-2 px-1.5 py-px font-mono text-[10.5px] text-faint">
                    {x}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
