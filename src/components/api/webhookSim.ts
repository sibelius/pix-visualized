/**
 * Webhook delivery simulator. The API Pix fixes the target ({webhookUrl}/pix), the channel (mTLS),
 * the trigger (Pix with txid credited; devolução reaching DEVOLVIDO/NAO_REALIZADO) and allows batching.
 * Retry/backoff/SLA are PSP-defined — the policy below is an illustrative one.
 */
import { rng, type Rng } from "@/lib/random";

export type WhParams = {
  failRate: number; // receiver 5xx / timeout probability
  ackLoss: number; // receiver processed it but the 200 never reached the PSP
  misconfigured: boolean; // receiver only serves the base URL → POST {url}/pix answers 404
  maxAttempts: number;
  backoff: number; // seconds, doubles each retry
  batch: boolean; // group items of the same key within a 2 s window
  dedup: "e2e" | "e2e+dev";
};

export type Item = { e2e: string; txid?: string; valor: string; t: number; dev?: "DEVOLVIDO" | "NAO_REALIZADO" };
export type Attempt = { t: number; code: number | "timeout"; processed: boolean };
export type Job = { id: number; items: Item[]; created: number; attempts: Attempt[]; nextAt: number; state: "pending" | "delivered" | "gaveup" };

export type WhSim = {
  t: number;
  r: Rng;
  jobs: Job[];
  open: Job | null;
  nextPix: number;
  seq: number;
  pixNoTxid: number;
  pixTotal: number;
  receiverSeen: Set<string>;
  fullSeen: Set<string>;
  applied: number;
  dupSuppressed: number;
  refundDropped: number;
  pendingDev: { at: number; item: Item }[];
};

const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";
export const DT = 0.25;

export function initWh(seed = 11): WhSim {
  return { t: 0, r: rng(seed), jobs: [], open: null, nextPix: 1, seq: 1, pixNoTxid: 0, pixTotal: 0, receiverSeen: new Set(), fullSeen: new Set(), applied: 0, dupSuppressed: 0, refundDropped: 0, pendingDev: [] };
}

function enqueue(s: WhSim, p: WhParams, it: Item) {
  if (p.batch && s.open && s.t - s.open.created < 2) {
    s.open.items.push(it);
    return;
  }
  const j: Job = { id: s.seq++, items: [it], created: s.t, attempts: [], nextAt: s.t + (p.batch ? 2 : 0.25), state: "pending" };
  s.jobs.push(j);
  s.open = p.batch ? j : null;
}

const keyOf = (it: Item, mode: WhParams["dedup"]) => (mode === "e2e" ? it.e2e : `${it.e2e}|${it.dev ?? "-"}`);

export function stepWh(s: WhSim, p: WhParams) {
  s.t = Math.round((s.t + DT) * 100) / 100;
  // incoming Pix
  if (s.t >= s.nextPix) {
    s.pixTotal++;
    const hasTxid = s.r.next() > 0.2;
    const e2e = `E87654321202610021300${Array.from({ length: 11 }, () => ALNUM[Math.floor(s.r.next() * 36)]).join("")}`;
    const it: Item = { e2e, txid: hasTxid ? `pedido${4400 + s.pixTotal}x${e2e.slice(-11)}${e2e.slice(-20, -11)}` : undefined, valor: (10 + Math.floor(s.r.next() * 300)).toFixed(2), t: s.t };
    if (!hasTxid) s.pixNoTxid++;
    else {
      enqueue(s, p, it);
      if (s.r.next() < 0.18) s.pendingDev.push({ at: s.t + 6 + s.r.next() * 6, item: it });
    }
    s.nextPix = s.t + 1.5 + s.r.exp(2);
  }
  // devoluções reaching a final status also fire the callback
  for (const d of s.pendingDev.filter((x) => x.at <= s.t)) enqueue(s, p, { ...d.item, t: s.t, dev: s.r.next() < 0.85 ? "DEVOLVIDO" : "NAO_REALIZADO" });
  s.pendingDev = s.pendingDev.filter((x) => x.at > s.t);
  // deliveries
  for (const j of s.jobs) {
    if (j.state !== "pending" || j.nextAt > s.t) continue;
    if (s.open === j) s.open = null;
    let code: Attempt["code"];
    let processed = false;
    if (p.misconfigured) code = 404;
    else if (s.r.next() < p.failRate) code = s.r.next() < 0.5 ? 503 : "timeout";
    else {
      processed = true;
      code = s.r.next() < p.ackLoss ? "timeout" : 200;
    }
    j.attempts.push({ t: s.t, code, processed });
    if (processed)
      for (const it of j.items) {
        const k = keyOf(it, p.dedup);
        const full = keyOf(it, "e2e+dev");
        if (s.receiverSeen.has(k)) {
          if (!s.fullSeen.has(full)) {
            s.fullSeen.add(full);
            s.refundDropped++; // a new fact (refund final status) thrown away by a too-coarse dedup key
          } else s.dupSuppressed++;
        } else {
          s.receiverSeen.add(k);
          s.fullSeen.add(full);
          s.applied++;
        }
      }
    if (code === 200) j.state = "delivered";
    else if (j.attempts.length >= p.maxAttempts) j.state = "gaveup";
    else j.nextAt = s.t + p.backoff * 2 ** (j.attempts.length - 1);
  }
  if (s.jobs.length > 60) s.jobs = s.jobs.filter((j) => j.state === "pending" || s.t - j.created < 90);
}

export function payloadOf(j: Job) {
  return {
    pix: j.items.map((it) => {
      const o: Record<string, unknown> = { endToEndId: it.e2e, txid: it.txid, valor: it.valor, horario: `2026-10-02T13:${String(Math.floor(it.t / 60)).padStart(2, "0")}:${String(Math.floor(it.t % 60)).padStart(2, "0")}.000Z`, infoPagador: "pedido" };
      if (it.dev) o.devolucoes = [{ id: "D001", rtrId: `D12345678202610021301${"r".repeat(11)}`, valor: it.valor, horario: { solicitacao: "2026-10-02T13:01:00.000Z" }, status: it.dev }];
      return o;
    }),
  };
}
