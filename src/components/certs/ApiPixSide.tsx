"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Panel, Segmented, Stat } from "@/components/ui";
import { utf8 } from "@/components/xmldsig/c14n";

const b64url = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlDecode = (s: string) => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "===".slice((p.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
async function thumb(key: CryptoKey) {
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", key));
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", spki)));
}

/* --------------------- (1) certificate-bound access tokens --------------------- */

type TokScenario = "own" | "stolen" | "certfile";

export function BoundToken() {
  const [th, setTh] = useState<{ a: string; b: string } | null>(null);
  const [sc, setSc] = useState<TokScenario>("own");
  useEffect(() => {
    (async () => {
      const gen = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const [a, b] = await Promise.all([gen(), gen()]);
      setTh({ a: await thumb(a.publicKey), b: await thumb(b.publicKey) });
    })();
  }, []);
  const tls = sc === "own" ? th?.a : sc === "stolen" ? th?.b : undefined;
  const token = th
    ? JSON.stringify({ iss: "https://oauth.psp-a.com.br", sub: "client_erp_7f3a", scope: "cob.write cob.read pix.read webhook.write", exp: 1791034212, cnf: { "x5t#S256": th.a } }, null, 1)
    : "…";
  const ok = sc === "own";

  return (
    <Panel title="API Pix: certificate-bound access token (RFC 8705)" exportUnavailable={!th}>
      <Segmented
        value={sc}
        onChange={setSc}
        options={[
          { value: "own", label: "merchant calls with its cert" },
          { value: "stolen", label: "token stolen, used with another cert" },
          { value: "certfile", label: "cert file stolen, no private key" },
        ]}
      />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <div className="text-[11px] tracking-wide text-faint uppercase">1 · POST /oauth/token over mTLS (client credentials)</div>
          <pre className="mt-1 overflow-auto rounded-lg border border-line bg-bg p-2 font-mono text-[10.5px] leading-relaxed break-all whitespace-pre-wrap text-ink/90">{token}</pre>
          <p className="mt-1 text-[11px] text-faint">The Authorization Server copies the SHA-256 thumbprint of the TLS client certificate into cnf.x5t#S256.</p>
        </div>
        <div className="min-w-0 space-y-2">
          <div className="text-[11px] tracking-wide text-faint uppercase">2 · GET /cob/{"{txid}"} with Bearer token</div>
          <div className="rounded-lg border border-line bg-panel-2/40 p-2 font-mono text-[10.5px] break-all">
            <div className="text-faint">TLS client cert thumbprint</div>
            <div className={clsx(sc === "own" ? "text-ok" : "text-bad")}>{sc === "certfile" ? "— handshake failed at CertificateVerify" : (tls ?? "…")}</div>
            <div className="mt-1 text-faint">token cnf.x5t#S256</div>
            <div className="text-ink">{th?.a ?? "…"}</div>
          </div>
          <Stat
            label="resource server"
            value={ok ? "200 OK" : sc === "stolen" ? "401" : "no TLS"}
            tone={ok ? "good" : "bad"}
            hint={ok ? "thumbprints match: proof of possession" : sc === "stolen" ? "token bound to a different certificate" : "a certificate without its key cannot sign CertificateVerify"}
          />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-faint">
        Thumbprints are real SHA-256 hashes, computed here over freshly generated public keys standing in for the certificates. The PSP may
        issue these client certificates from its own CA or accept an external one; self-signed client certificates are not allowed.
      </p>
    </Panel>
  );
}

/* --------------------------- (2) dynamic-QR JWS checks --------------------------- */

type QFault = "none" | "scheme" | "long" | "homolog" | "notListed" | "wildcard" | "revUnknown" | "algNone" | "hs256" | "jkuOther" | "tampered";

const HOST = "pix.psp-b.com.br";
const PAYLOAD = {
  revisao: 0,
  calendario: { criacao: "2026-10-02T13:20:00Z", apresentacao: "2026-10-02T13:30:10Z", expiracao: 3600 },
  txid: "7978c0c97ea847e78e8849634473c1f1",
  status: "ATIVA",
  valor: { original: "123.45" },
  chave: "a1b2c3d4-0000-4000-8000-123456789abc",
};

type QStep = { label: string; detail: string; fail?: string };

export function QrJwsCheck() {
  const [fault, setFault] = useState<QFault>("none");
  const [jws, setJws] = useState<string>("");
  const [sigOk, setSigOk] = useState<boolean | null>(null);
  const [kp, setKp] = useState<CryptoKeyPair | null>(null);

  useEffect(() => {
    crypto.subtle
      .generateKey({ name: "RSA-PSS", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])
      .then(setKp);
  }, []);

  useEffect(() => {
    if (!kp) return;
    let live = true;
    (async () => {
      const x5t = await thumb(kp.publicKey);
      const alg = fault === "algNone" ? "none" : fault === "hs256" ? "HS256" : "PS256";
      const jku = fault === "jkuOther" ? "https://cdn.other-host.example/jwks.json" : `https://${HOST}/jwks.json`;
      const header = { alg, "x5t#S256": x5t, jku, kid: "qr-2026-10" };
      const h = b64url(utf8(JSON.stringify(header)));
      const p = b64url(utf8(JSON.stringify(PAYLOAD)));
      const sig = new Uint8Array(await crypto.subtle.sign({ name: "RSA-PSS", saltLength: 32 }, kp.privateKey, utf8(`${h}.${p}`)));
      // tampering: change valor.original after signing
      const p2 = fault === "tampered" ? b64url(utf8(JSON.stringify({ ...PAYLOAD, valor: { original: "1.23" } }))) : p;
      const compact = `${h}.${p2}.${alg === "none" ? "" : b64url(sig)}`;
      const [hh, pp, ss] = compact.split(".");
      const ok = ss ? await crypto.subtle.verify({ name: "RSA-PSS", saltLength: 32 }, kp.publicKey, b64urlDecode(ss), utf8(`${hh}.${pp}`)) : false;
      if (live) {
        setJws(compact);
        setSigOk(ok);
      }
    })();
    return () => {
      live = false;
    };
  }, [kp, fault]);

  const url = fault === "scheme" ? `https://${HOST}/qr/v3/9d36b84fc70b478fb95c12729b90ca25` : fault === "long" ? `${HOST}/qr/v3/9d36b84fc70b478fb95c12729b90ca25/pagamento/cobranca/imediata/extra` : fault === "homolog" ? `pix-h.psp-b.com.br/qr/v3/9d36b84fc70b478fb95c12729b90ca25` : `${HOST}/qr/v3/9d36b84fc70b478fb95c12729b90ca25`;
  const steps: QStep[] = [
    {
      label: "URL from the BR Code (ID 26, sub-ID 25)",
      detail: `${url.length} chars: ${url}`,
      fail: fault === "scheme" ? "the URL must not carry a scheme prefix: HTTPS is implied" : fault === "long" ? `${url.length} > 77 characters` : undefined,
    },
    { label: "Host does not end in -h (production app)", detail: "homologation sites are named like qrcode-h.bancoxyz.com.br", fail: fault === "homolog" ? "host pix-h.… is a homologation site: a production app must not pay it" : undefined },
    {
      label: "TLS 1.2+, certificate in the BC's CERTQRC list",
      detail: "EV, CN/SAN = host, no wildcard; list from ARQ certqrc.zip (≤ 1 download / 24 h)",
      fail: fault === "notListed" ? "certificate not in certqrc.zip" : fault === "wildcard" ? "wildcard certificate: rejected" : fault === "revUnknown" ? "revocation status cannot be verified: the QR transaction must be rejected" : undefined,
    },
    {
      label: "JOSE header: alg allowed",
      detail: "RS256/ES256 or stronger; PS256/PS512 recommended",
      fail: fault === "algNone" ? 'alg "none" is forbidden' : fault === "hs256" ? 'HMAC algorithms ("HS*") are forbidden' : undefined,
    },
    { label: "jku on the same site as the CERTQRC", detail: `https://${HOST}/jwks.json`, fail: fault === "jkuOther" ? "jku points to another host" : undefined },
    { label: "JWK by kid / x5t#S256; key_ops = verify; x5c chain valid", detail: "x5c carries the full chain up to the root; validate per RFC 5280 and check revocation" },
    { label: "Verify the JWS signature (real RSA-PSS)", detail: sigOk === null ? "…" : sigOk ? "valid" : "invalid", fail: fault === "tampered" && sigOk === false ? "signature does not cover the modified payload (valor.original changed)" : undefined },
    { label: "Only now: show amount and payee, then pay", detail: `valor.original = ${fault === "tampered" ? "1.23" : PAYLOAD.valor.original}, status ATIVA` },
  ];
  const first = steps.findIndex((s) => s.fail);
  const [hdr, pl, sg] = jws.split(".");

  return (
    <Panel title="Payer side: validating a dynamic QR (Manual de Segurança, 4.3)" exportUnavailable={sigOk === null}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">inject</span>
        <select value={fault} onChange={(e) => setFault(e.target.value as QFault)} className="rounded-md border border-line bg-panel-2 px-2 py-1 text-xs text-ink">
          <option value="none">nothing</option>
          <option value="scheme">URL with https:// prefix</option>
          <option value="long">URL longer than 77 chars</option>
          <option value="homolog">host ends in -h</option>
          <option value="notListed">site cert not registered</option>
          <option value="wildcard">wildcard site cert</option>
          <option value="revUnknown">revocation unknown</option>
          <option value="algNone">alg: none</option>
          <option value="hs256">alg: HS256</option>
          <option value="jkuOther">jku on another host</option>
          <option value="tampered">payload tampered</option>
        </select>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="space-y-1.5">
          {steps.map((s, i) => {
            const st = first < 0 || i < first ? "ok" : i === first ? "fail" : "skip";
            return (
              <li key={s.label} className={clsx("rounded-lg border px-2.5 py-1.5", st === "fail" ? "border-bad/50 bg-bad/10" : "border-line bg-panel-2/40", st === "skip" && "opacity-45")}>
                <div className="flex items-center gap-2 text-xs">
                  <span className={clsx("size-2 shrink-0 rounded-full", st === "ok" ? "bg-ok" : st === "fail" ? "bg-bad" : "bg-line")} />
                  <span className="text-ink">{s.label}</span>
                </div>
                <div className={clsx("mt-0.5 pl-4 font-mono text-[10.5px] break-all", st === "fail" ? "text-bad" : "text-faint")}>{st === "fail" ? s.fail : s.detail}</div>
              </li>
            );
          })}
        </ol>
        <div className="min-w-0">
          <div className="text-[11px] tracking-wide text-faint uppercase">JWS compact serialization (signed in your browser)</div>
          <div className="mt-1 max-h-72 overflow-auto rounded-lg border border-line bg-bg p-2 font-mono text-[10px] leading-relaxed break-all">
            <span className="text-orange-300">{hdr}</span>.<span className="text-sky-300">{pl}</span>.<span className="text-emerald-300">{sg}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Stat label="decision" value={first < 0 ? "pay" : "refuse"} tone={first < 0 ? "good" : "bad"} />
            <Stat label="signature" value={sigOk === null ? "…" : sigOk ? "valid" : "invalid"} tone={sigOk ? "good" : sigOk === false ? "bad" : "neutral"} hint="RSA-PSS SHA-256 (PS256)" />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function ApiPixSide() {
  return (
    <div className="space-y-4">
      <BoundToken />
      <QrJwsCheck />
      <p className="text-xs text-faint">
        Try: steal the token and replay it from another client: the thumbprints differ and the resource server answers 401. In the QR
        panel, tamper with the payload: everything about the site and the header is fine, and only the real signature check catches it. Then
        pick &quot;revocation unknown&quot;: for QR certificates that alone is enough to refuse.
      </p>
    </div>
  );
}
