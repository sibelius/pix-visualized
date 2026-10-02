import { rng, type Rng } from "@/lib/random";

export const ISPB = "12345678"; // our (fictional) ISPB
export const HOSTS = {
  primary: { host: "icom.pi.rsfn.net.br", port: 16422, hom: "icom-h.pi.rsfn.net.br", homPort: 16522 },
  secondary: { host: "icom-sec.pi.rsfn.net.br", port: 17422, hom: "icom-sec-h.pi.rsfn.net.br", homPort: 17522 },
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Request linter: the rules of the Manual das Interfaces de Comunicação v1.12 §2.1–2.2
 * ──────────────────────────────────────────────────────────────────────────── */

export type Finding = { level: "error" | "warn" | "ok"; text: string; status?: number };
export type Parsed = { method: string; path: string; version: string; headers: [string, string][]; body: string };

export function parseRequest(raw: string): Parsed {
  const norm = raw.replace(/\r\n/g, "\n");
  const sep = norm.indexOf("\n\n");
  const head = sep >= 0 ? norm.slice(0, sep) : norm;
  const body = sep >= 0 ? norm.slice(sep + 2) : "";
  const [first = "", ...hs] = head.split("\n");
  const [method = "", path = "", version = ""] = first.trim().split(/\s+/);
  const headers: [string, string][] = hs
    .filter((l) => l.trim())
    .map((l) => {
      const i = l.indexOf(":");
      return i < 0 ? [l.trim(), ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    });
  return { method, path, version, headers, body };
}

const ALLOWED = ["accept", "accept-encoding", "connection", "content-encoding", "content-length", "content-type", "cookie", "host", "max-forwards", "transfer-encoding", "user-agent", "via"];

export function lint(p: Parsed, certIspb: string): { findings: Finding[]; status: number; kind: "send" | "start" | "next" | "delete" | "catalog" | "none" } {
  const f: Finding[] = [];
  const h = (name: string) => p.headers.find(([k]) => k.toLowerCase() === name)?.[1];
  let kind: "send" | "start" | "next" | "delete" | "catalog" | "none" = "none";
  let status = 0;
  const fail = (s: number, text: string) => {
    f.push({ level: "error", text, status: s });
    if (!status) status = s;
  };

  if (p.version !== "HTTP/1.1") fail(400, `The ICOM speaks HTTP/1.1 only (over TLS 1.2). Got "${p.version || "nothing"}".`);
  else f.push({ level: "ok", text: "HTTP/1.1." });

  const host = h("host");
  if (!host) fail(400, "Host header is mandatory (RFC 7230 §5.4).");
  else if (/:\d+$/.test(host)) fail(400, `Host must be sent without the port ("${host}"). Sending the port may break the connection.`);
  else if (!([HOSTS.primary.host, HOSTS.secondary.host, HOSTS.primary.hom, HOSTS.secondary.hom] as string[]).includes(host)) f.push({ level: "warn", text: `Unknown host "${host}". ICOM hosts: icom.pi.rsfn.net.br (primary), icom-sec.pi.rsfn.net.br (secondary), -h for homologação.` });
  else f.push({ level: "ok", text: `Host ${host} (${host.includes("sec") ? "secondary" : "primary"} channel${host.includes("-h") ? ", homologação" : ""}).` });
  const secondary = !!host && host.includes("icom-sec");

  for (const [k] of p.headers)
    if (!ALLOWED.includes(k.toLowerCase())) f.push({ level: "warn", text: `Header "${k}" is not in the manual's list; the API may refuse the request.` });

  const accept = h("accept");
  if (accept && !["application/xml", "multipart/mixed", "*/*"].includes(accept)) fail(406, `Accept must be application/xml, multipart/mixed or */* (got "${accept}").`);
  const ae = h("accept-encoding");
  if (ae && ae !== "gzip") fail(400, `Accept-Encoding, if present, must be "gzip" (got "${ae}").`);

  const m = p.path.match(/^\/api\/v1\/(in|out)\/([0-9A-Z]{8})\/(msgs|stream\/start|stream\/[^/]+)$/);
  const cat = p.path.match(/^\/api\/v1\/(in|out)\/catalog$/);
  if (cat) {
    kind = "catalog";
    if (p.method !== "GET") fail(405, "Catalog endpoints only accept GET.");
  } else if (!m) fail(404, `Unknown path ${p.path || "(empty)"}. Endpoints: POST /api/v1/in/{ispb}/msgs, GET /api/v1/out/{ispb}/stream/start, GET|DELETE /api/v1/out/{ispb}/stream/{pull-next}.`);
  else {
    const [, dir, ispb, rest] = m;
    if (ispb !== certIspb) fail(403, `Path ISPB ${ispb} is not the ISPB of your client certificate (${certIspb}).`);
    if (dir === "in" && rest === "msgs") {
      kind = "send";
      if (p.method !== "POST") fail(405, "/in/{ispb}/msgs only accepts POST.");
    } else if (dir === "out" && rest === "stream/start") {
      kind = "start";
      if (p.method !== "GET") fail(405, "stream/start only accepts GET.");
    } else if (dir === "out" && rest.startsWith("stream/")) {
      kind = p.method === "DELETE" ? "delete" : "next";
      if (p.method !== "GET" && p.method !== "DELETE") fail(405, "A stream path accepts GET (next read) or DELETE (finish reading).");
    } else fail(404, "That combination of in/out and resource does not exist.");
  }

  const ct = h("content-type");
  const cl = h("content-length");
  const te = h("transfer-encoding");
  const ce = h("content-encoding");
  const hasBody = p.body.trim().length > 0;
  if (hasBody) {
    if (!cl && !te) fail(411, "A body needs Content-Length or Transfer-Encoding: chunked (else 411 Length Required).");
    if (te && te.toLowerCase().replace(/\s/g, "") === "gzip,chunked") f.push({ level: "warn", text: "Transfer-Encoding: gzip, chunked is no longer recommended and may be disabled. Use Content-Encoding: gzip." });
    if (!ct) fail(415, "Content-Type is required when there is content.");
    else if (/^application\/xml/i.test(ct)) {
      const cs = ct.match(/charset\s*=\s*"?([\w-]+)"?/i)?.[1];
      if (!cs || cs.toLowerCase() !== "utf-8") fail(cs ? 400 : 415, `Content-Type must be "application/xml; charset=utf-8"${cs ? ` (charset ${cs} → the manual's example answers 400 "Charset XML inválido")` : ""}.`);
      else f.push({ level: "ok", text: "application/xml; charset=utf-8." });
    } else if (/^multipart\/mixed/i.test(ct)) {
      const b = ct.match(/boundary\s*=\s*"?([^";]+)"?/i)?.[1];
      if (!b) fail(400, "multipart/mixed needs a boundary parameter.");
      else {
        const parts = p.body.split(`--${b}`).slice(1).filter((x) => !x.startsWith("--"));
        if (parts.length > 10) fail(413, `${parts.length} parts: the limit is 10 messages per request.`);
        else f.push({ level: "ok", text: `multipart/mixed with ${parts.length} part(s) (max 10).` });
        parts.forEach((pt, i) => {
          if (!/content-type:\s*application\/xml;\s*charset=utf-8/i.test(pt)) fail(415, `Part ${i + 1} lacks "Content-Type: application/xml; charset=utf-8".`);
        });
      }
    } else fail(415, `Unsupported Content-Type "${ct}".`);
    if (ce && ce.toLowerCase() !== "gzip") fail(415, `Content-Encoding "${ce}": only gzip is supported (400 or 415).`);
    if (secondary && kind === "send" && ce?.toLowerCase() !== "gzip") fail(400, "gzip is mandatory on the secondary channel (Content-Encoding: gzip).");
    if (!secondary && kind === "send" && !ce) f.push({ level: "warn", text: "No gzip: allowed on the primary channel, but highly recommended." });
    if (kind !== "send") f.push({ level: "warn", text: "This endpoint does not expect a body." });
  } else if (kind === "send") fail(400, "POST /msgs without a message.");

  if (kind === "start" || kind === "next") {
    if (!accept || accept === "application/xml") f.push({ level: "ok", text: "Single-message read (no Accept or application/xml)." });
    if (accept === "multipart/mixed") f.push({ level: "ok", text: "multipart read: up to 10 messages per response." });
    if (!ae) f.push({ level: "warn", text: "Add Accept-Encoding: gzip to have responses compressed (strongly recommended under load)." });
  }
  if (!status) status = kind === "send" ? 201 : kind === "delete" ? 200 : kind === "catalog" ? 200 : 200;
  return { findings: f, status, kind };
}

/** PI-ResourceId: up to 32 Base64 chars = 24 random bytes */
export function resourceId(r: Rng | null = null) {
  const bytes = new Uint8Array(24);
  if (r) for (let i = 0; i < 24; i++) bytes[i] = Math.floor(r.next() * 256);
  else crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Token bucket (§2.2.1.5)
 * ──────────────────────────────────────────────────────────────────────────── */

export const BUCKETS = [
  { id: "primary", label: "Primary", max: 3750, refill: 750 },
  { id: "sec-day", label: "Secondary 08:00–23:59", max: 350, refill: 35 },
  { id: "sec-night", label: "Secondary 00:00–07:59", max: 5000, refill: 350 },
  { id: "sec-trck", label: "Secondary trck.002", max: 1500, refill: 500 },
  { id: "manual", label: "Manual's example", max: 2500, refill: 500 },
] as const;
export type BucketId = (typeof BUCKETS)[number]["id"];

export type MsgType = "pacs.008" | "pacs.002" | "other";
export const tokenCost = (t: MsgType, ops: number, msgs: number) => (t === "pacs.008" ? ops * msgs : t === "pacs.002" ? 0.2 * ops * msgs : msgs);

export type BucketRow = { s: number; offered: number; accepted: number; debit: number; credit: number; bal: number; rejected: boolean; retryAfter: number };

/** Per-second replay: a second's traffic is rejected when the previous second ended with balance ≤ 0. */
export function replayBucket(max: number, refill: number, offeredPerSecond: number[]): BucketRow[] {
  let bal = max;
  const out: BucketRow[] = [];
  offeredPerSecond.forEach((offered, i) => {
    const rejected = bal <= 0;
    const debit = rejected ? 0 : offered;
    const credit = refill;
    const nb = Math.min(max, bal - debit + credit);
    const retryAfter = rejected ? Math.max(1, Math.ceil((1 - bal) / refill)) : 0;
    out.push({ s: i + 1, offered, accepted: debit, debit, credit, bal: nb, rejected: rejected && offered > 0, retryAfter });
    bal = nb;
  });
  return out;
}

/** The scenario from the manual's table (bucket 2500, +500/s). */
export const MANUAL_TABLE = [500, 1000, 3500, 1000, 1000, 1000, 1000, 1000, 1000, 500, 100, 50];
export const MANUAL_EXPECTED = [2500, 2000, -1000, -500, 0, 500, -500, 0, 500, 500, 900, 1350];

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Pull streams: long polling with N concurrent streams.
 * ──────────────────────────────────────────────────────────────────────────── */

export type Phase = "req" | "held" | "resp" | "proc" | "backoff" | "stopped";
export type StreamS = { id: number; phase: Phase; until: number; since: number; batch: QMsg[]; last: "200" | "204" | "429" | "" };
export type QMsg = { t0: number };
export type StreamParams = {
  n: number;
  rate: number; // msgs per second arriving for us
  rttMs: number;
  holdS: number; // long-poll hold before 204
  procMs: number; // per-message work done before the next GET (sync) or per batch store (async)
  async: boolean;
  multipart: boolean;
  deadlineS: number;
  polling: boolean;
};
export const MAX_STREAMS = 6;

export type StreamSim = {
  t: number;
  streams: StreamS[];
  queue: QMsg[];
  r: Rng;
  consumed: number;
  lat: number[]; // recent consumption latencies (ms)
  within200: number;
  ab03: number;
  late: number;
  c204: number;
  c429: number;
  c200: number;
  hist: { t: number; q: number; thr: number }[];
  winConsumed: number;
  winStart: number;
  arrived: number;
};

export function newStreamSim(seed = 1): StreamSim {
  return { t: 0, streams: [], queue: [], r: rng(seed), consumed: 0, lat: [], within200: 0, ab03: 0, late: 0, c204: 0, c429: 0, c200: 0, hist: [], winConsumed: 0, winStart: 0, arrived: 0 };
}

const DT = 5; // ms

export function stepStreams(s: StreamSim, p: StreamParams, ms: number) {
  // keep stream objects in sync with the requested count
  while (s.streams.length < p.n) s.streams.push({ id: s.streams.length, phase: "req", until: s.t + p.rttMs / 2 + s.streams.length * 7, since: s.t, batch: [], last: "" });
  while (s.streams.length > p.n) s.streams.pop();
  const steps = Math.round(ms / DT);
  for (let k = 0; k < steps; k++) {
    s.t += DT;
    const t = s.t;
    // arrivals (Poisson)
    let lambda = (p.rate * DT) / 1000;
    while (lambda > 0) {
      const l = Math.min(lambda, 1);
      if (s.r.next() < l) {
        s.queue.push({ t0: t });
        s.arrived++;
      }
      lambda -= 1;
    }
    // expiry at the SPI: not consumed in time → AB03
    while (s.queue.length && t - s.queue[0].t0 > p.deadlineS * 1000) {
      s.queue.shift();
      s.ab03++;
    }
    for (const st of s.streams) {
      if (st.phase === "stopped") {
        if (p.polling) {
          st.phase = "req";
          st.until = t + p.rttMs / 2;
        }
        continue;
      }
      if (st.phase === "req" && t >= st.until) {
        if (st.id >= MAX_STREAMS) {
          s.c429++;
          st.last = "429";
          st.phase = "resp";
          st.batch = [];
          st.until = t + p.rttMs / 2;
        } else {
          st.phase = "held";
          st.since = t;
        }
      }
      if (st.phase === "held") {
        if (s.queue.length) {
          st.batch = s.queue.splice(0, p.multipart ? 10 : 1);
          st.last = "200";
          s.c200++;
          st.phase = "resp";
          st.until = t + p.rttMs / 2;
        } else if (t - st.since >= p.holdS * 1000) {
          st.last = "204";
          s.c204++;
          st.phase = "resp";
          st.batch = [];
          st.until = t + p.rttMs / 2;
        }
      }
      if (st.phase === "resp" && t >= st.until) {
        for (const m of st.batch) {
          const l = t - m.t0;
          s.lat.push(l);
          if (l <= 200) s.within200++;
          s.consumed++;
          s.winConsumed++;
        }
        if (st.last === "429") {
          st.phase = "backoff";
          st.until = t + 1000;
        } else if (st.batch.length) {
          st.phase = "proc";
          st.until = t + (p.async ? Math.max(1, p.procMs * 0.1) : p.procMs * st.batch.length);
        } else {
          st.phase = p.polling ? "req" : "stopped";
          st.until = t + p.rttMs / 2;
        }
      }
      if (st.phase === "proc" && t >= st.until) {
        // the pacs.002 answer for each message (sync mode answers here; async answers from a worker, modelled as on time)
        if (!p.async) for (const m of st.batch) if (t + p.rttMs / 2 - m.t0 > p.deadlineS * 1000) s.late++;
        st.batch = [];
        st.phase = p.polling ? "req" : "stopped";
        st.until = t + p.rttMs / 2;
      }
      if (st.phase === "backoff" && t >= st.until) {
        st.phase = p.polling ? "req" : "stopped";
        st.until = t + p.rttMs / 2;
      }
    }
    if (s.lat.length > 4000) s.lat.splice(0, s.lat.length - 4000);
    if (t - s.winStart >= 500) {
      const thr = (s.winConsumed * 1000) / (t - s.winStart);
      s.hist.push({ t, q: s.queue.length, thr });
      if (s.hist.length > 120) s.hist.shift();
      s.winConsumed = 0;
      s.winStart = t;
    }
  }
}

export const pct = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
};

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Sample SPI messages for the multipart encoder
 * ──────────────────────────────────────────────────────────────────────────── */

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const rs = (r: Rng, n: number) => Array.from({ length: n }, () => ALNUM[Math.floor(r.next() * ALNUM.length)]).join("");
const b64 = (r: Rng, n: number) => {
  const c = ALNUM + "+/";
  return Array.from({ length: n }, () => c[Math.floor(r.next() * c.length)]).join("");
};

export function samplePacs008(i: number, seed = 1) {
  const r = rng(seed * 1000 + i);
  const msgId = `M${ISPB}${rs(r, 23)}`;
  const ts = `2026-10-02T15:${String(10 + (i % 50)).padStart(2, "0")}:${String(r.int(10, 59))}.${String(r.int(100, 999))}Z`;
  const e2e = `E${ISPB}202610021${String(5 + (i % 4))}${String(10 + (i % 50)).padStart(2, "0")}${rs(r, 11)}`.slice(0, 32);
  const amt = (r.int(500, 99999) / 100).toFixed(2);
  const cpf = String(r.int(10000000000, 99999999999));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="https://www.bcb.gov.br/pi/pacs.008/1.16">
  <AppHdr>
    <Fr><FIId><FinInstnId><Othr><Id>${ISPB}</Id></Othr></FinInstnId></FIId></Fr>
    <To><FIId><FinInstnId><Othr><Id>00038166</Id></Othr></FinInstnId></FIId></To>
    <BizMsgIdr>${msgId}</BizMsgIdr>
    <MsgDefIdr>pacs.008.spi.1.16</MsgDefIdr>
    <CreDt>${ts}</CreDt>
    <Sgntr><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference URI="#key-info-id"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${b64(r, 43)}=</ds:DigestValue></ds:Reference><ds:Reference URI=""><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${b64(r, 43)}=</ds:DigestValue></ds:Reference><ds:Reference><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${b64(r, 43)}=</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>${b64(r, 342)}==</ds:SignatureValue><ds:KeyInfo Id="key-info-id"><ds:X509Data><ds:X509IssuerSerial><ds:X509IssuerName>CN=AC Exemplo, OU=CSPB-0, O=ICP-Brasil, C=BR</ds:X509IssuerName><ds:X509SerialNumber>${r.int(100000000, 999999999)}${r.int(100000000, 999999999)}</ds:X509SerialNumber></ds:X509IssuerSerial></ds:X509Data></ds:KeyInfo></ds:Signature></Sgntr>
  </AppHdr>
  <Document>
    <FIToFICstmrCdtTrf>
      <GrpHdr>
        <MsgId>${msgId}</MsgId>
        <CreDtTm>${ts}</CreDtTm>
        <NbOfTxs>1</NbOfTxs>
        <SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf>
        <PmtTpInf><InstrPrty>HIGH</InstrPrty><SvcLvl><Prtry>PAGPRI</Prtry></SvcLvl></PmtTpInf>
      </GrpHdr>
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${e2e}</EndToEndId></PmtId>
        <IntrBkSttlmAmt Ccy="BRL">${amt}</IntrBkSttlmAmt>
        <AccptncDtTm>${ts}</AccptncDtTm>
        <ChrgBr>SLEV</ChrgBr>
        <Dbtr><Nm>Fulana de Tal ${i + 1}</Nm><Id><PrvtId><Othr><Id>${cpf}</Id></Othr></PrvtId></Id></Dbtr>
        <DbtrAcct><Id><Othr><Id>${r.int(100000, 9999999)}</Id><Issr>0001</Issr></Othr></Id><Tp><Cd>CACC</Cd></Tp></DbtrAcct>
        <DbtrAgt><FinInstnId><ClrSysMmbId><MmbId>${ISPB}</MmbId></ClrSysMmbId></FinInstnId></DbtrAgt>
        <CdtrAgt><FinInstnId><ClrSysMmbId><MmbId>87654321</MmbId></ClrSysMmbId></FinInstnId></CdtrAgt>
        <Cdtr><Id><PrvtId><Othr><Id>${String(r.int(10000000000, 99999999999))}</Id></Othr></PrvtId></Id></Cdtr>
        <CdtrAcct><Id><Othr><Id>${r.int(100000, 9999999)}</Id><Issr>0001</Issr></Othr></Id><Tp><Cd>TRAN</Cd></Tp><Prxy><Id>+5511987654321</Id></Prxy></CdtrAcct>
        <Purp><Cd>IPAY</Cd></Purp>
      </CdtTrfTxInf>
    </FIToFICstmrCdtTrf>
  </Document>
</Envelope>`;
}

export function buildMultipart(parts: string[], boundary: string, preamble = "") {
  const CRLF = "\r\n";
  let body = preamble ? preamble + CRLF : "";
  for (const p of parts) body += `--${boundary}${CRLF}Content-Type: application/xml; charset=utf-8${CRLF}${CRLF}${p}${CRLF}`;
  body += `--${boundary}--${CRLF}`;
  return body;
}

export async function gzipSize(s: string): Promise<number> {
  const cs = new CompressionStream("gzip");
  const stream = new Blob([new TextEncoder().encode(s)]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return buf.byteLength;
}

export const utf8Len = (s: string) => new TextEncoder().encode(s).length;
