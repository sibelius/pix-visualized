"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { Mono } from "@/components/contapi/xml";
import { fmt } from "@/lib/random";
import { ISPB, buildMultipart, gzipSize, resourceId, samplePacs008, utf8Len } from "./model";

export function MultipartGzip() {
  const [count, setCount] = useState(4);
  const [boundary, setBoundary] = useState("spi-batch-7f3a9c");
  const [view, setView] = useState<"head" | "body">("head");
  const [sizes, setSizes] = useState<{ whole: number; each: number; single: number } | null>(null);
  const [ids, setIds] = useState<string[] | null>(null);

  const msgs = useMemo(() => Array.from({ length: count }, (_, i) => samplePacs008(i, 7)), [count]);
  const body = useMemo(() => buildMultipart(msgs, boundary, "preamble, ignored by the API"), [msgs, boundary]);
  const raw = utf8Len(body);
  const collides = msgs.some((m) => m.includes(boundary));
  const tooMany = count > 10;

  useEffect(() => {
    let live = true;
    setSizes(null);
    (async () => {
      const whole = await gzipSize(body);
      let each = 0;
      for (const m of msgs) each += await gzipSize(m);
      const single = await gzipSize(msgs[0]);
      if (live) setSizes({ whole, each, single });
    })();
    return () => {
      live = false;
    };
  }, [body, msgs]);
  useEffect(() => setIds(null), [count, boundary]);

  const send = () => setIds(Array.from({ length: count }, () => resourceId()));

  const head = `POST /api/v1/in/${ISPB}/msgs HTTP/1.1
Host: icom.pi.rsfn.net.br
Content-Type: multipart/mixed; boundary="${boundary}"
Content-Encoding: gzip
Content-Length: ${sizes ? sizes.whole : "…"}
User-Agent: spi-gateway/2.3

[${fmt(raw)} bytes of multipart body, gzip-compressed to ${sizes ? fmt(sizes.whole) : "…"} bytes]`;

  const preview = body.length > 6000 ? body.slice(0, 2600) + `\n\n… ${fmt(body.length - 5200)} more characters …\n\n` + body.slice(-2600) : body;

  return (
    <div className="space-y-4">
      <Controls>
        <Slider label="pacs.008 messages in the batch" value={count} min={1} max={12} step={1} onChange={setCount} format={(v) => `${v}${v > 10 ? " (>10!)" : ""}`} className="min-w-64 flex-1" />
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted">
          boundary
          <input
            value={boundary}
            onChange={(e) => setBoundary(e.target.value.replace(/[\s"]/g, "").slice(0, 70) || "b")}
            className="w-44 rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-ink"
          />
        </label>
        <Button variant="ghost" onClick={() => setBoundary("Envelope")}>
          bad boundary
        </Button>
        <span className="inline-flex items-center gap-2 text-muted">
          show
          <Segmented value={view} onChange={setView} options={[{ value: "head", label: "request head" }, { value: "body", label: "body (before gzip)" }]} />
        </span>
        <Button variant="primary" onClick={send} disabled={tooMany || collides}>
          POST it
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
        <Panel title={view === "head" ? "HTTP request" : "multipart/mixed body (CRLF line endings)"}>
          <Mono maxHeight={360}>{view === "head" ? head : preview}</Mono>
          {ids && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-muted">Response</div>
              <div className="rounded-lg border border-line bg-bg/60 px-3 py-2 font-mono text-[11.5px] leading-[1.55] break-all text-ink/90">
                HTTP/1.1 201 Created
                <br />
                PI-ResourceId: {ids.join(",")}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                One id per part, in order, comma-separated. Each is 24 random bytes in Base64 (32 chars), made with <span className="font-mono">crypto.getRandomValues</span>{" "}
                here. A 4xx means none were stored. A 5xx means some may have been stored and others not, so resend the whole batch: the SPI deduplicates each
                operation by EndToEndId.
              </p>
            </div>
          )}
          {tooMany && <div className="mt-3 text-sm text-bad">More than 10 messages in one request: the API refuses it (limit per request is 10).</div>}
          {collides && <div className="mt-3 text-sm text-bad">The boundary string occurs inside a message. RFC 2046 requires a boundary that appears nowhere in the parts, otherwise the receiver splits in the wrong place. Use a long random token.</div>}
        </Panel>
        <div className="grid content-start gap-2">
          <Stat label="raw body" value={`${fmt(raw / 1024, 1)} KiB`} hint={`${count} × ~${fmt(utf8Len(msgs[0]) / 1024, 1)} KiB signed pacs.008`} />
          <Stat label="gzip whole body" value={sizes ? `${fmt(sizes.whole / 1024, 1)} KiB` : "…"} tone="good" hint={sizes ? `${fmt((1 - sizes.whole / raw) * 100)}% smaller` : "CompressionStream('gzip')"} />
          <Stat label="gzip each message alone" value={sizes ? `${fmt(sizes.each / 1024, 1)} KiB` : "…"} hint={sizes ? `batching saves ${fmt(sizes.each - sizes.whole)} B more` : ""} />
          <Stat label="tokens consumed" value={`${count}`} hint="1 per pacs.008 operation" />
          <Stat label="HTTP round trips" value={`1 instead of ${count}`} tone="good" />
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: go from 1 to 10 messages and watch the gzip ratio improve. Repeated tags, namespaces and the signature boilerplate compress across parts. Signatures and ids
        are random and do not. Then press “bad boundary”.
      </p>
    </div>
  );
}
