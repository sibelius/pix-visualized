"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented } from "@/components/ui";
import { Mono } from "@/components/contapi/xml";
import { ISPB, lint, parseRequest, resourceId } from "./model";
import { rng } from "@/lib/random";

const PING = `<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="https://www.bcb.gov.br/pi/pibr.001/1.3">…signed pibr.001…</Envelope>`;

const PRESETS: Record<string, { label: string; raw: string }> = {
  single: {
    label: "POST one message",
    raw: `POST /api/v1/in/${ISPB}/msgs HTTP/1.1
Host: icom.pi.rsfn.net.br
Content-Type: application/xml; charset=utf-8
Content-Length: 4587
User-Agent: spi-gateway/2.3 instancia-1

${PING}`,
  },
  multipart: {
    label: "POST multipart",
    raw: `POST /api/v1/in/${ISPB}/msgs HTTP/1.1
Host: icom.pi.rsfn.net.br
Content-Type: multipart/mixed; boundary="b1d2e3"
Transfer-Encoding: chunked
Content-Encoding: gzip

--b1d2e3
Content-Type: application/xml; charset=utf-8

<Envelope>…pacs.008 #1…</Envelope>
--b1d2e3
Content-Type: application/xml; charset=utf-8

<Envelope>…pacs.008 #2…</Envelope>
--b1d2e3--`,
  },
  start: {
    label: "GET stream/start",
    raw: `GET /api/v1/out/${ISPB}/stream/start HTTP/1.1
Host: icom.pi.rsfn.net.br
Accept: multipart/mixed
Accept-Encoding: gzip
Connection: keep-alive
`,
  },
  next: {
    label: "GET pull-next",
    raw: `GET /api/v1/out/${ISPB}/stream/f0d744d792d6 HTTP/1.1
Host: icom.pi.rsfn.net.br
Accept: multipart/mixed
Accept-Encoding: gzip
`,
  },
  del: {
    label: "DELETE stream",
    raw: `DELETE /api/v1/out/${ISPB}/stream/8e20a682c86f HTTP/1.1
Host: icom.pi.rsfn.net.br
`,
  },
  broken: {
    label: "Broken (try to fix it)",
    raw: `POST /api/v1/in/87654321/msgs HTTP/1.1
Host: icom-sec.pi.rsfn.net.br:17422
Content-Type: application/xml; charset=utf-16
Authorization: Bearer abc
X-Request-Id: 42

${PING}`,
  },
};

const TITLE: Record<number, string> = {
  200: "OK",
  201: "Created",
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  411: "Length Required",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
};

export function RequestLinter() {
  const [preset, setPreset] = useState("broken");
  const [raw, setRaw] = useState(PRESETS.broken.raw);
  const [cert, setCert] = useState<"mine" | "other">("mine");
  const certIspb = cert === "mine" ? ISPB : "99999999";
  const parsed = useMemo(() => parseRequest(raw), [raw]);
  const res = useMemo(() => lint(parsed, certIspb), [parsed, certIspb]);

  const r = rng(raw.length);
  const parts = (parsed.body.match(/--[^\n]+\nContent-Type/gi) ?? []).length;
  const ok = res.status < 300;
  const response = ok
    ? res.kind === "send"
      ? `HTTP/1.1 201 Created\nPI-ResourceId: ${Array.from({ length: Math.max(1, parts) }, () => resourceId(r)).join(",")}\nContent-Length: 0`
      : res.kind === "delete"
        ? "HTTP/1.1 200 OK\nContent-Length: 0"
        : res.kind === "catalog"
          ? `HTTP/1.1 200 OK\nContent-Type: application/xml; charset=utf-8\n\n<Catalog>\n    <Message>pacs.008.spi.1.15</Message>\n    <Message>pacs.002.spi.1.16</Message>\n    <Message>pibr.001.spi.1.3</Message>\n    …\n</Catalog>`
          : `HTTP/1.1 200 OK            (or 204 No Content after the long-poll wait)\nPI-Pull-Next: /api/v1/out/${ISPB}/stream/c7e3d74bca8e\nPI-ResourceId: ${resourceId(r)}\nContent-Type: application/xml; charset=utf-8\nContent-Encoding: gzip\n\n[pacs.008 for you, gzip]`
    : `HTTP/1.1 ${res.status} ${TITLE[res.status] ?? ""}\nContent-Type: application/problem+xml\n\n<?xml version="1.0" encoding="UTF-8"?>\n<problem xmlns="urn:ietf:rfc:7807">\n  <type>https://icom.pi.rsfn.net.br/api/v1/error/${res.status === 403 ? "forbidden" : res.status === 400 && /charset/i.test(res.findings.find((f) => f.level === "error")?.text ?? "") ? "charset" : "…"}</type>\n  <title>${res.findings.find((f) => f.level === "error")?.text.slice(0, 70) ?? ""}</title>\n</problem>`;

  return (
    <div className="space-y-4">
      <Controls>
        <span className="inline-flex flex-wrap items-center gap-2 text-muted">
          start from
          <Segmented
            value={preset}
            onChange={(v) => {
              setPreset(v);
              setRaw(PRESETS[v].raw);
            }}
            options={Object.entries(PRESETS).map(([k, v]) => ({ value: k, label: v.label }))}
          />
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          client certificate ISPB
          <Segmented value={cert} onChange={setCert} options={[{ value: "mine", label: ISPB }, { value: "other", label: "99999999" }]} />
        </span>
        <Button variant="ghost" onClick={() => setRaw(PRESETS[preset].raw)}>
          Reset text
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Your request (editable · bodies shown before gzip)">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
            className="h-72 w-full resize-y rounded-lg border border-line bg-bg/60 p-3 font-mono text-[11.5px] leading-[1.55] text-ink outline-none focus:border-faint"
          />
          <ul className="mt-3 space-y-1 text-[12.5px]">
            {res.findings.map((f, i) => (
              <li key={i} className={clsx("flex gap-2", f.level === "error" ? "text-bad" : f.level === "warn" ? "text-warn" : "text-ok")}>
                <span className="w-9 shrink-0 font-mono">{f.level === "error" ? `✗${f.status ? ` ${f.status}` : ""}` : f.level === "warn" ? "!" : "✓"}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="What the ICOM answers" right={<span className={clsx("font-mono text-xs", ok ? "text-ok" : "text-bad")}>{res.status}</span>}>
          <Mono maxHeight={300}>{response}</Mono>
          <div className="mt-3 text-[12.5px] leading-relaxed text-muted">
            {ok && res.kind === "send" && (
              <>
                201 only means <b>stored</b>: no XSD or signature check has run yet. A validation failure comes back later as an <span className="font-mono">admi.002</span> on your read stream,
                quoting this PI-ResourceId (or your MsgId).
              </>
            )}
            {!ok && res.status < 500 && <>A 4xx means nothing was stored. Fix the request; resending the same bytes will fail the same way.</>}
            {ok && (res.kind === "start" || res.kind === "next") && <>The next GET must use exactly the PI-Pull-Next path returned here. Never build it yourself.</>}
          </div>
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: fix the broken request one line at a time: drop the port from Host, set charset=utf-8, remove the extra headers, add Content-Length, then put your own ISPB
        in the path. On the secondary host it still fails until you add Content-Encoding: gzip.
      </p>
    </div>
  );
}
