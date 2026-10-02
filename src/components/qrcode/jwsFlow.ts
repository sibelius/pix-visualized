// Dynamic-QR retrieval & validation pipeline (Manual de Segurança do SFN Vol. II v6.00 §4; Manual de Padrões §2.5.2, §2.7).
// Uses real WebCrypto signatures (RSASSA-PSS / RSASSA-PKCS1-v1_5, SHA-256). Call only from effects/handlers.
import { bytesToB64url, b64urlDecodeText, b64urlEncodeText, b64urlToBytes } from "./jwsSample";

export type Alg = "PS256" | "RS256" | "HS256" | "none";

export type Scenario = {
  host: "pix.example.com" | "pix-h.example.com" | "pix.examp1e.com";
  tls: "1.3" | "1.1";
  alg: Alg;
  tamper: "none" | "valor" | "resign";
  kidMismatch: boolean;
};

export type KeySet = {
  ps: CryptoKeyPair;
  rs: CryptoKeyPair;
  evil: CryptoKeyPair;
  psJwk: JsonWebKey;
  rsJwk: JsonWebKey;
  evilJwk: JsonWebKey;
  psX5t: string;
  rsX5t: string;
  evilX5t: string;
};

const PSS = { name: "RSA-PSS", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" } as const;
const PKCS = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" } as const;

async function thumb(pub: CryptoKey): Promise<string> {
  // Stand-in for the X.509 certificate: we hash the SubjectPublicKeyInfo DER (a real x5t hashes the full cert DER with SHA-1).
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pub));
  return bytesToB64url(new Uint8Array(await crypto.subtle.digest("SHA-1", spki)));
}

export async function makeKeys(): Promise<KeySet> {
  const ps = (await crypto.subtle.generateKey(PSS, true, ["sign", "verify"])) as CryptoKeyPair;
  const rs = (await crypto.subtle.generateKey(PKCS, true, ["sign", "verify"])) as CryptoKeyPair;
  const evil = (await crypto.subtle.generateKey(PSS, true, ["sign", "verify"])) as CryptoKeyPair;
  const [psJwk, rsJwk, evilJwk] = await Promise.all([ps, rs, evil].map((k) => crypto.subtle.exportKey("jwk", k.publicKey)));
  const [psX5t, rsX5t, evilX5t] = await Promise.all([ps, rs, evil].map((k) => thumb(k.publicKey)));
  return { ps, rs, evil, psJwk, rsJwk, evilJwk, psX5t, rsX5t, evilX5t };
}

export const PAYLOAD = {
  calendario: { criacao: "2026-10-02T14:03:11.402Z", apresentacao: "2026-10-02T14:05:47.118Z", expiracao: 3600 },
  txid: "7978c0c97ea847e78e8849634473c1f1",
  revisao: 0,
  status: "ATIVA",
  valor: { original: "37.00" },
  chave: "7d9f0335-8dcc-4054-9bf9-0dbd61d36906",
  solicitacaoPagador: "Informe o número do pedido",
};

export const TOKEN = "9d36b84fc70b478fb95c12729b90ca25";

export type StepStatus = "ok" | "fail" | "skip" | "warn";
export type Step = { title: string; status: StepStatus; detail: string };

export type FlowResult = {
  url: string;
  jws: string;
  header: Record<string, unknown>;
  payloadText: string;
  jwks: { keys: Record<string, unknown>[] };
  jwksUrl: string;
  steps: Step[];
  accepted: boolean;
};

const algParams = (alg: Alg) => (alg === "PS256" ? { name: "RSA-PSS", saltLength: 32 } : { name: "RSASSA-PKCS1-v1_5" });

export async function runFlow(keys: KeySet, sc: Scenario): Promise<FlowResult> {
  const url = `${sc.host}/qr/v2/${TOKEN}`;
  const attacker = sc.tamper === "resign";
  const jwksHost = attacker ? "jwks.attacker.example.net" : sc.host;
  const jwksUrl = `https://${jwksHost}/.well-known/jwks.json`;
  const signer = attacker ? keys.evil : sc.alg === "RS256" ? keys.rs : keys.ps;
  const pubJwk = attacker ? keys.evilJwk : sc.alg === "RS256" ? keys.rsJwk : keys.psJwk;
  const x5t = attacker ? keys.evilX5t : sc.alg === "RS256" ? keys.rsX5t : keys.psX5t;
  const kid = attacker ? "evil-1" : sc.alg === "RS256" ? "qr-rs-2026" : "qr-ps-2026";

  const header: Record<string, unknown> = { alg: attacker ? "PS256" : sc.alg, typ: "JWS", kid: sc.kidMismatch ? "qr-ps-2025" : kid, jku: jwksUrl, x5t };
  const payloadObj = attacker ? { ...PAYLOAD, chave: "attacker@example.net", valor: { original: "370.00" } } : PAYLOAD;
  const h64 = b64urlEncodeText(JSON.stringify(header));
  const p64 = b64urlEncodeText(JSON.stringify(payloadObj));
  let s64 = "";
  if (header.alg === "PS256" || header.alg === "RS256") {
    const sig = await crypto.subtle.sign(algParams(header.alg as Alg), signer.privateKey, new TextEncoder().encode(`${h64}.${p64}`));
    s64 = bytesToB64url(new Uint8Array(sig));
  } else if (header.alg === "HS256") {
    const hk = await crypto.subtle.importKey("raw", new TextEncoder().encode("guessable-shared-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    s64 = bytesToB64url(new Uint8Array(await crypto.subtle.sign("HMAC", hk, new TextEncoder().encode(`${h64}.${p64}`))));
  }
  // tamper after signing: an intermediary changes the amount but cannot re-sign
  const sentP64 = sc.tamper === "valor" ? b64urlEncodeText(JSON.stringify({ ...PAYLOAD, valor: { original: "3700.00" } })) : p64;
  const jws = `${h64}.${sentP64}.${s64}`;

  const jwkEntry = { kty: "RSA", key_ops: ["verify"], kid, x5t, n: pubJwk.n, e: pubJwk.e, x5c: ["MIIF…(signing cert)", "MIIE…(intermediate CA)", "MIID…(root CA)"] };
  const jwks = { keys: [jwkEntry] };

  let sigOk = false;
  const alg0 = String(header.alg);
  if (alg0 === "PS256" || alg0 === "RS256") {
    try {
      const pub = await crypto.subtle.importKey("jwk", { kty: "RSA", n: pubJwk.n, e: pubJwk.e, ext: true }, alg0 === "PS256" ? { name: "RSA-PSS", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      const pp = jws.split(".");
      sigOk = await crypto.subtle.verify(algParams(alg0 as Alg), pub, b64urlToBytes(pp[2]), new TextEncoder().encode(`${pp[0]}.${pp[1]}`));
    } catch {
      sigOk = false;
    }
  }

  const steps: Step[] = [];
  let stop = false;
  const push = (title: string, ok: boolean | "warn", detail: string) => {
    if (stop) {
      steps.push({ title, status: "skip", detail: "not reached" });
      return;
    }
    steps.push({ title, status: ok === "warn" ? "warn" : ok ? "ok" : "fail", detail });
    if (ok === false) stop = true;
  };

  push("Read 26-25 and check URL form", url.length <= 77 && !/^https?:/.test(url), `"${url}" — ${url.length}/77 chars, no scheme; always fetched as https://${url}`);
  push(
    "Production app: host must not end in -h",
    !sc.host.split(".")[0].endsWith("-h"),
    sc.host.split(".")[0].endsWith("-h") ? `${sc.host} is a homologation host; a production app must refuse it.` : `${sc.host} is a production host.`,
  );
  push("TLS handshake ≥ 1.2", sc.tls === "1.3", sc.tls === "1.3" ? "TLS 1.3 negotiated." : "Server only offered TLS 1.1 → abort.");
  const registered = sc.host !== "pix.examp1e.com";
  push(
    "Site certificate: EV, CN/SAN = host, registered in Pix",
    registered,
    registered
      ? `EV cert for ${sc.host} (no wildcard), chain to a widely trusted CA, thumbprint present in the list of QR certificates registered with the BCB (CERTQRC via STA).`
      : `pix.examp1e.com has a valid TLS cert, but it is not a registered Pix QR-code certificate — look-alike domain rejected.`,
  );
  const parts = jws.split(".");
  push("GET → application/jose, 3 base64url parts", parts.length === 3, `${jws.length} bytes; header ${parts[0].length}, payload ${parts[1].length}, signature ${parts[2].length} chars`);
  const alg = String(header.alg);
  const algOk = alg === "PS256" || alg === "RS256";
  push(
    "Decode header, check alg",
    algOk ? (alg === "PS256" ? true : "warn") : false,
    algOk
      ? alg === "PS256"
        ? "alg PS256 — recommended (RSASSA-PSS + SHA-256)."
        : "alg RS256 — permitted (minimum), but PS256/PS512 are recommended."
      : alg === "none"
        ? 'alg "none" is explicitly forbidden: an unsigned payload would be accepted otherwise.'
        : "HS* (HMAC) is forbidden: a shared secret cannot prove which PSP signed it.",
  );
  const jkuSame = new URL(jwksUrl).host === sc.host;
  push(
    "Fetch jku on the same site; match kid + x5t",
    jkuSame && !sc.kidMismatch,
    !jkuSame
      ? `jku points to ${new URL(jwksUrl).host}, not the site of the registered QR certificate → reject. (The signature does verify against that key: ${sigOk} — which proves nothing about who signed.)`
      : sc.kidMismatch
        ? `header kid "${header.kid}" not found in the JWK Set (has "${kid}") → reject.`
        : `JWK Set at ${jwksUrl} has kid "${kid}", x5t matches the header.`,
  );
  push("Validate x5c chain (RFC 5280), keyUsage digitalSignature", true, "Signing cert → intermediate → root; widely trusted CA; not revoked; used only for Pix QR signing.");
  push(
    "Verify signature over ASCII(header.payload)",
    sigOk,
    sigOk ? "crypto.subtle.verify → true. The bytes are exactly what the receiver's PSP signed." : "crypto.subtle.verify → false. The payload was altered after signing.",
  );
  const payloadText = b64urlDecodeText(parts[1]);
  push("Parse payload JSON, show to payer, keep JWS for non-repudiation", true, "Only now are valor, chave and txid trusted. The JWS, certificate and public key are stored with the transaction.");

  return { url, jws, header, payloadText, jwks, jwksUrl, steps, accepted: steps.every((s) => s.status === "ok" || s.status === "warn") };
}
