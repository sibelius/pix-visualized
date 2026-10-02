import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { CHAPTER_COLOR, NAV, type ChapterKey } from "@/components/shell/nav";

export const OG_SIZE = { width: 1200, height: 630 };

function Glyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#171b24" />
      <path d="M16 5 L27 16 L16 27 L5 16 Z" fill="none" stroke="#32bcad" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M10.5 16h9.5m-3.2-3.4L20.2 16l-3.4 3.4" fill="none" stroke="#e7e9f0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="5" r="2" fill="#a78bfa" />
      <circle cx="16" cy="27" r="2" fill="#f5a524" />
    </svg>
  );
}

/** Social card. With no chapter it's the site card; with a chapter it's that chapter's card. */
const font = (f: string) => readFile(join(process.cwd(), "src/assets", f));

export async function ogImage(chapter?: ChapterKey) {
  const [regular, bold, mono] = await Promise.all([font("inter-400.ttf"), font("inter-700.ttf"), font("jbmono-500.ttf")]);
  const item = chapter ? NAV.find((n) => n.chapter === chapter) : undefined;
  const accent = chapter ? CHAPTER_COLOR[chapter] : "#32bcad";
  const chapters = NAV.filter((n) => n.chapter);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0a0c11",
          color: "#e7e9f0",
          padding: "64px 72px",
          fontFamily: "Inter",
          position: "relative",
        }}
      >
        {/* faint log of records along the right edge */}
        <div style={{ position: "absolute", right: 72, top: 64, display: "flex", gap: 8 }}>
          {Array.from({ length: chapters.length }, (_, i) => (
            <div
              key={i}
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: CHAPTER_COLOR[chapters[i].chapter!],
                opacity: chapter ? (chapters[i].chapter === chapter ? 1 : 0.18) : 0.25 + (i / chapters.length) * 0.75,
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Glyph size={72} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>Pix, visualized</div>
            <div style={{ fontSize: 22, color: "#8a93a8" }}>Brazil’s instant payments, down to the bytes</div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {item ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 30, color: accent, fontFamily: "JB Mono", letterSpacing: 2 }}>{`CHAPTER ${item.n}`}</div>
              <div style={{ fontSize: 78, fontWeight: 700, lineHeight: 1.05, marginTop: 12, letterSpacing: -2 }}>{item.label}</div>
              <div style={{ fontSize: 34, color: "#8a93a8", marginTop: 18 }}>{item.blurb}</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 30, color: accent, fontFamily: "JB Mono", letterSpacing: 2 }}>PIX · SPI · DICT · ISO 20022</div>
              <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.08, marginTop: 16, letterSpacing: -2 }}>
                QR codes, pacs.008, XMLDSig, DICT and Pix Automático as live systems you can push on.
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden" }}>
          {chapters.map((c) => (
            <div key={c.href} style={{ flex: 1, background: CHAPTER_COLOR[c.chapter!], opacity: !chapter || c.chapter === chapter ? 1 : 0.25 }} />
          ))}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: bold, weight: 700, style: "normal" },
        { name: "JB Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
