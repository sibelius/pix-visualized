import type { Chapter } from "@/content/types";
import { CHAPTER_COLOR } from "@/components/shell/nav";

/** Every key concept of a chapter, as anchored cards (#lsm-tree…). Rendered at the end of each chapter page. */
export function ConceptList({ chapter }: { chapter: Chapter }) {
  const color = CHAPTER_COLOR[chapter.key];
  return (
    <section className="mt-16">
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <h2 className="text-xl font-semibold tracking-tight">Key concepts · {chapter.concepts.length}</h2>
        <span className="font-mono text-xs text-faint">chapter {String(chapter.bookChapter).padStart(2, "0")}</span>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {chapter.concepts.map((c) => (
          <li
            key={c.id}
            id={c.id}
            className="scroll-mt-24 rounded-xl border border-line bg-panel p-4 target:ring-2"
            style={{ ["--tw-ring-color" as string]: color }}
          >
            <div className="flex items-start gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: color }} />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{c.name}</div>
                <p className="mt-1 text-sm text-ink/90">{c.what}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{c.why}</p>
                {c.examples && c.examples.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.examples.map((e) => (
                      <span key={e} className="rounded border border-line bg-panel-2 px-1.5 py-px font-mono text-[10.5px] text-faint">
                        {e}
                      </span>
                    ))}
                  </div>
                )}
                {c.viz && (
                  <a href={`#${c.viz}`} className="mt-2 inline-block text-xs text-faint hover:text-ink">
                    ↑ see it in the visualization
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
