/** OAuth2 client_credentials + mTLS (RFC 8705) flow model for the API Pix (Manual de Padrões, Anexo II §3). */

export const SCOPES: [string, string][] = [
  ["cob.read", "consultar cobranças imediatas"],
  ["cob.write", "alterar cobranças imediatas"],
  ["cobv.read", "consultar cobranças com vencimento"],
  ["cobv.write", "alterar cobranças com vencimento"],
  ["lotecobv.read", "consultar lotes de cobv"],
  ["lotecobv.write", "alterar lotes de cobv"],
  ["payloadlocation.read", "consultar locations"],
  ["payloadlocation.write", "alterar locations"],
  ["payloadlocationrec.read", "consultar locations de recorrência"],
  ["payloadlocationrec.write", "alterar locations de recorrência"],
  ["pix.read", "consultar Pix recebidos"],
  ["pix.write", "solicitar devoluções"],
  ["webhook.read", "consultar webhook Pix"],
  ["webhook.write", "alterar webhook Pix"],
  ["webhookrec.read", "consultar webhook de recorrências"],
  ["webhookrec.write", "alterar webhook de recorrências"],
  ["webhookcobr.read", "consultar webhook de cobr"],
  ["webhookcobr.write", "alterar webhook de cobr"],
  ["rec.read", "consultar recorrências"],
  ["rec.write", "alterar recorrências"],
  ["solicrec.read", "consultar solicitações de recorrência"],
  ["solicrec.write", "alterar solicitações de recorrência"],
  ["cobr.read", "consultar cobranças recorrentes"],
  ["cobr.write", "alterar cobranças recorrentes"],
];

export const CALLS: { label: string; scope: string }[] = [
  { label: "PUT /cob/{txid}", scope: "cob.write" },
  { label: "GET /cob/{txid}", scope: "cob.read" },
  { label: "PUT /cobv/{txid}", scope: "cobv.write" },
  { label: "GET /pix?inicio&fim", scope: "pix.read" },
  { label: "PUT /pix/{e2eid}/devolucao/{id}", scope: "pix.write" },
  { label: "PUT /webhook/{chave}", scope: "webhook.write" },
  { label: "POST /rec", scope: "rec.write" },
];

export type Faults = { tls11: boolean; selfSigned: boolean; stolen: boolean; expired: boolean };
export type Step = { from: 0 | 1 | 2; to: 0 | 1 | 2; label: string; ok: boolean; detail: string };

/** Build the step list of one run; stops at the first failure. */
export function runFlow(o: { faults: Faults; scopes: string[]; call: { label: string; scope: string }; thumbA: string; thumbB: string }): Step[] {
  const s: Step[] = [];
  const { faults } = o;
  const push = (x: Step) => {
    s.push(x);
    return x.ok;
  };
  if (!push({ from: 0, to: 1, label: faults.tls11 ? "ClientHello TLS 1.1" : "TLS 1.3 handshake + client cert", ok: !faults.tls11 && !faults.selfSigned, detail: faults.tls11 ? "Handshake aborted: the API must accept only TLS ≥ 1.2 with forward-secret cipher suites." : faults.selfSigned ? "Client certificate rejected: self-signed client certificates must not be accepted (cert from the PSP's CA or an external CA)." : "Mutual TLS: the server proves pix.example.com, the client proves its certificate (issued at onboarding)." })) return s;
  if (!push({ from: 0, to: 1, label: "POST /oauth/token  grant_type=client_credentials", ok: true, detail: `Authorization: Basic base64(client_id:client_secret), scope="${o.scopes.join(" ")}". client_id is bound to the recebedor's CPF/CNPJ.` })) return s;
  if (!push({ from: 1, to: 0, label: "200 access_token (cnf.x5t#S256 = thumb(cert A))", ok: true, detail: `Certificate-bound token (RFC 8705 §3): the AS records the SHA-256 thumbprint of the TLS client cert: ${o.thumbA || "…"}` })) return s;
  const presented = faults.stolen ? o.thumbB : o.thumbA;
  if (!push({ from: 0, to: 2, label: `${o.call.label}  Bearer …  (mTLS cert ${faults.stolen ? "B" : "A"})`, ok: true, detail: faults.stolen ? "An attacker who stole the token replays it from another machine with a different client certificate." : "Same client certificate on the resource server connection." })) return s;
  if (faults.expired) {
    push({ from: 2, to: 0, label: "401 invalid_token (expired)", ok: false, detail: "Token past expires_in. Fetch a new one from /oauth/token (cache tokens; don't fetch one per request)." });
    return s;
  }
  if (presented !== o.thumbA) {
    push({ from: 2, to: 0, label: "401 invalid_token (cnf mismatch)", ok: false, detail: `Proof-of-possession failed: token says ${o.thumbA.slice(0, 16)}…, TLS session has ${o.thumbB.slice(0, 16)}…. A stolen bearer token is useless without the private key.` });
    return s;
  }
  if (!o.scopes.includes(o.call.scope)) {
    push({ from: 2, to: 0, label: "403 AcessoNegado", ok: false, detail: `The token lacks scope ${o.call.scope}. Body: {"type":"https://pix.bcb.gov.br/api/v2/error/AcessoNegado","title":"Acesso Negado","status":403,...}` });
    return s;
  }
  push({ from: 2, to: 0, label: "2xx — request served", ok: true, detail: "Thumbprint matches, scope present, resources limited to accounts of the client_id's CPF/CNPJ. Access is logged (audit logs kept ≥ 1 year)." });
  return s;
}

export async function thumbprint(certText: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(certText));
  let bin = "";
  for (const b of new Uint8Array(h)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
