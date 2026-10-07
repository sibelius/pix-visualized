"use client";

import { useEffect, useId, useRef, useState } from "react";
import { chapterToMarkdown, markdownPath, readMarkdownChapter } from "@/lib/markdown";

export function CopyMarkdown() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const target = useRef<{ root: Element; href: string } | null>(null);
  const titleId = useId();
  const [base, setBase] = useState("");
  const [preview, setPreview] = useState("");
  const [url, setUrl] = useState("");
  const [examplesUrl, setExamplesUrl] = useState("");
  const [includeCurrent, setIncludeCurrent] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => () => request.current?.abort(), []);

  const open = async () => {
    const root = trigger.current?.closest("main");
    if (!root) return;
    const href = window.location.pathname.replace(/\/$/, "");
    target.current = { root, href };
    const path = markdownPath(href);
    setUrl(path);
    setExamplesUrl(markdownPath(href, undefined, true));
    setIncludeCurrent(false);
    setBase("");
    setPreview("");
    setStatus("");
    setLoading(true);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    dialog.current?.showModal();
    try {
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) throw new Error(`Markdown unavailable (${response.status}).`);
      const text = await response.text();
      if (!text.startsWith("# ")) throw new Error("The server did not return Markdown.");
      const markdown = text.replace(/^Source: (\/\S+)$/m, (_, source: string) => `Source: ${window.location.origin}${source}`);
      if (controller.signal.aborted) return;
      setBase(markdown);
      setPreview(markdown);
    } catch (error) {
      if (!controller.signal.aborted) setStatus(`${(error as Error).message} Close this preview and try again.`);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const toggleCurrent = (checked: boolean) => {
    setStatus("");
    if (!checked) {
      setIncludeCurrent(false);
      setPreview(base);
      return;
    }
    try {
      const { root, href } = target.current!;
      const chapter = readMarkdownChapter(root, href);
      setPreview(chapterToMarkdown(chapter, { examples: "current", origin: window.location.origin }));
      setIncludeCurrent(true);
    } catch {
      setStatus("Could not read the current example. The prebuilt Markdown is still available.");
    }
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(preview);
      setStatus("Copied.");
    } catch {
      setStatus("Clipboard unavailable. Select the preview and copy it manually.");
    }
  };

  return (
    <div data-export-ignore="" className="inline-block">
      <button
        ref={trigger}
        type="button"
        onClick={open}
        aria-label="Copy page as Markdown"
        className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted transition hover:border-faint hover:text-ink"
      >
        Copy Markdown
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => { request.current?.abort(); trigger.current?.focus(); }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[min(48rem,calc(100%_-_2rem))] overflow-auto rounded-xl border border-line bg-panel p-5 text-ink backdrop:bg-black/70"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">Copy page as Markdown</h2>
          <button type="button" onClick={() => dialog.current?.close()} className="rounded px-2 py-1 text-sm text-muted hover:text-ink">Close</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={includeCurrent} disabled={!base || loading} onChange={(event) => toggleCurrent(event.target.checked)} />
            Include current example
          </label>
          <a href={url || undefined} target="_blank" rel="noreferrer" className="text-accent hover:underline">Open Markdown</a>
          <a href={examplesUrl || undefined} target="_blank" rel="noreferrer" className="text-accent hover:underline">With initial examples</a>
        </div>
        <p className="mt-2 text-xs text-muted">Explanations by default. Initial examples are prebuilt; current examples reflect this page.</p>
        <textarea
          aria-label="Markdown preview"
          aria-busy={loading}
          readOnly
          value={preview}
          placeholder={loading ? "Loading Markdown…" : "Markdown preview"}
          className="mt-4 block h-[45dvh] w-full rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted">{preview.length.toLocaleString("en")} characters</span>
          <button type="button" disabled={!preview || loading} onClick={copy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50">Copy Markdown</button>
        </div>
        <p role="status" className="mt-2 min-h-5 text-sm text-muted">{status}</p>
      </dialog>
    </div>
  );
}
