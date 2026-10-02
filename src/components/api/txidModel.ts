import { rng } from "@/lib/random";

export type TxidRule = { ctx: string; re: RegExp; desc: string };
export const TXID_RULES: TxidRule[] = [
  { ctx: "cob / cobv / cobr txid (API Pix)", re: /^[a-zA-Z0-9]{26,35}$/, desc: "[a-zA-Z0-9]{26,35}" },
  { ctx: "Pix.txid in GET /pix and webhooks", re: /^[a-zA-Z0-9]{1,35}$/, desc: "[a-zA-Z0-9]{1,35} — static QRs may carry short ones" },
  { ctx: "BR Code 62-05 in a static QR", re: /^(\*\*\*|[a-zA-Z0-9]{1,25})$/, desc: "≤ 25 chars, or *** for none" },
  { ctx: "pacs.008 <TxId>", re: /^[a-zA-Z0-9]{1,35}$/, desc: "same value travels intact to the SPI" },
  { ctx: "devolução {id}", re: /^[a-zA-Z0-9]{1,35}$/, desc: "[a-zA-Z0-9]{1,35}, unique per e2eid" },
  { ctx: "endToEndId / rtrId", re: /^[a-zA-Z0-9]{32}$/, desc: "exactly 32 (E|D + ISPB + yyyyMMddHHmm + 11)" },
];

export type Attempt = "lost-req" | "lost-resp" | "ok";
export type Order = { attempts: Attempt[]; serverCobs: number; clientKnows: boolean };

/** Each order: client tries up to `maxTries` times until it gets a response. */
export function simulateIdempotency(o: { mode: "PUT" | "POST"; orders: number; pReq: number; pResp: number; maxTries: number; seed: number }): Order[] {
  const r = rng(o.seed);
  const out: Order[] = [];
  for (let i = 0; i < o.orders; i++) {
    const attempts: Attempt[] = [];
    let serverCobs = 0;
    let clientKnows = false;
    for (let a = 0; a < o.maxTries && !clientKnows; a++) {
      if (r.bernoulli(o.pReq)) {
        attempts.push("lost-req");
        continue;
      }
      // the server processed the request
      if (o.mode === "POST") serverCobs++;
      else serverCobs = 1; // PUT /cob/{txid}: same txid → same charge, replay is a no-op
      if (r.bernoulli(o.pResp)) attempts.push("lost-resp");
      else {
        attempts.push("ok");
        clientKnows = true;
      }
    }
    out.push({ attempts, serverCobs, clientKnows });
  }
  return out;
}

/** A txid the way many integrators make one: order id + random suffix, alphanumeric only. */
export function makeTxid(orderId: string, seed: number): string {
  const r = rng(seed);
  const base = orderId.replace(/[^a-zA-Z0-9]/g, "");
  let s = base;
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  while (s.length < 32) s += abc[Math.floor(r.next() * abc.length)];
  return s.slice(0, 35);
}
