"use client";

import { useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented, Stat } from "@/components/ui";

type CertKey = "all" | "pic" | "pia" | "bc" | "qrc" | "jws" | "api";
type NodeId = "pspA" | "pspB" | "psti" | "op1" | "op2" | "dc1" | "dc2" | "erp" | "payer" | "sta" | "qrsite" | "edgeA";
type Node = { id: NodeId; x: number; y: number; w: number; label: string; sub: string; zone: "rsfn" | "net" | "bcb" };
type Link = {
  id: string;
  a: NodeId;
  b: NodeId;
  certs: CertKey[];
  title: string;
  proto: string;
  detail: string;
  via?: "op1" | "op2";
  dashed?: boolean;
};

const NODES: Node[] = [
  { id: "pspA", x: 20, y: 40, w: 150, label: "PSP A (direct)", sub: "ISPB 99999010", zone: "rsfn" },
  { id: "pspB", x: 20, y: 140, w: 150, label: "PSP B (direct)", sub: "ISPB 99999020", zone: "rsfn" },
  { id: "psti", x: 20, y: 240, w: 150, label: "PSTI", sub: "hosts PSP C's link", zone: "rsfn" },
  { id: "op1", x: 300, y: 70, w: 150, label: "RSFN carrier 1", sub: "private network", zone: "rsfn" },
  { id: "op2", x: 300, y: 210, w: 150, label: "RSFN carrier 2", sub: "private network", zone: "rsfn" },
  { id: "dc1", x: 580, y: 70, w: 160, label: "BCB data center 1", sub: "icom · dict · arq", zone: "bcb" },
  { id: "dc2", x: 580, y: 210, w: 160, label: "BCB data center 2", sub: "icom · dict · arq", zone: "bcb" },
  { id: "edgeA", x: 20, y: 302, w: 150, label: "PSP A internet edge", sub: "API Pix · STA uploads", zone: "net" },
  { id: "erp", x: 20, y: 370, w: 150, label: "Merchant ERP", sub: "API Pix client", zone: "net" },
  { id: "payer", x: 300, y: 370, w: 150, label: "Payer's app", sub: "reads a dynamic QR", zone: "net" },
  { id: "qrsite", x: 580, y: 302, w: 160, label: "PSP B QR site", sub: "pix.psp-b.com.br", zone: "net" },
  { id: "sta", x: 580, y: 370, w: 160, label: "STA (sta.bcb.gov.br)", sub: "file transfer, internet", zone: "net" },
];

const RSFN_DETAIL =
  "A private network operated for the BCB by authorized telecom carriers, not the internet. Participants contract circuits from both carriers so a carrier failure does not take them offline. Over it runs HTTP/1.1 on TLS 1.2+ with mandatory mutual authentication to *.pi.rsfn.net.br.";

const LINKS: Link[] = [
  ...(["pspA", "pspB", "psti"] as const).flatMap((p) =>
    (["op1", "op2"] as const).map(
      (o): Link => ({
        id: `${p}-${o}`,
        a: p,
        b: o,
        via: o,
        certs: ["pic", "bc", "pia"],
        title: `${p === "psti" ? "PSTI" : p === "pspA" ? "PSP A" : "PSP B"} ↔ ${o === "op1" ? "carrier 1" : "carrier 2"}`,
        proto: "RSFN access circuit",
        detail: RSFN_DETAIL + (p === "psti" ? " A PSTI (provedor de serviços de TI) connects smaller participants that do not run their own RSFN link; each participant still uses its own certificates." : ""),
      }),
    ),
  ),
  ...(["op1", "op2"] as const).flatMap((o) =>
    (["dc1", "dc2"] as const).map(
      (d): Link => ({
        id: `${o}-${d}`,
        a: o,
        b: d,
        via: o,
        certs: ["pic", "bc", "pia"],
        title: `${o === "op1" ? "carrier 1" : "carrier 2"} ↔ ${d === "dc1" ? "DC 1" : "DC 2"}`,
        proto: "carrier backbone to BCB",
        detail:
          "Inside this tunnel: the participant's client certificate (CERTPIC) authenticates it to the BCB; the BCB presents an ICP-Brasil v10-chain SSL certificate whose CN covers *.pi.rsfn.net.br. Each SPI message is additionally signed end-to-end with CERTPIA. DNS may resolve to either data center; clients must respect the TTL.",
      }),
    ),
  ),
  {
    id: "erp-pspA",
    a: "erp",
    b: "edgeA",
    certs: ["api"],
    title: "Merchant ↔ PSP A's API Pix",
    proto: "HTTPS, mTLS + OAuth 2.0 client credentials",
    detail:
      "Internet. The PSP runs its own Authorization and Resource Server. The client certificate can be issued by the PSP itself or an external CA (self-signed not accepted). Access tokens are bound to the client certificate (RFC 8705), and webhooks back to the merchant also use mTLS. Nothing here touches the RSFN.",
  },
  {
    id: "payer-qr",
    a: "payer",
    b: "qrsite",
    certs: ["qrc", "jws"],
    title: "Payer's app ↔ PSP B's QR site",
    proto: "HTTPS (TLS 1.2+), JWS payload",
    detail:
      "Internet. The site's TLS certificate is CERTQRC: EV, from a public CA (CA/Browser Forum), no wildcard, registered with the BC. The payload is a JWS signed with a separate certificate whose chain is published in the JWK Set (x5c) on the same site. The payer's PSP validates both before showing the payment.",
  },
  {
    id: "pspA-sta",
    a: "edgeA",
    b: "sta",
    certs: ["pic", "pia", "qrc"],
    title: "PSP A ↔ STA",
    proto: "HTTPS, Sisbacen login",
    detail:
      "How certificates are registered: PEM file (no chain, no private key) uploaded through the BCB's file-transfer system with code CPIC, CPIA or CQRC. Separate STA for homologation (sta-h) and production. The BC has up to 7 days to activate.",
    dashed: true,
  },
];

const CERT_OPTS: { value: CertKey; label: string }[] = [
  { value: "all", label: "all" },
  { value: "pic", label: "CERTPIC" },
  { value: "pia", label: "CERTPIA" },
  { value: "bc", label: "BC v10 SSL" },
  { value: "qrc", label: "CERTQRC" },
  { value: "jws", label: "JWS cert" },
  { value: "api", label: "API Pix client" },
];

const CERT_INFO: Record<Exclude<CertKey, "all">, string> = {
  pic: "CERTPIC authenticates the participant's TLS connection to ICOM/DICT/ARQ. ICP-Brasil, SPB standard, RSA-2048, exclusive to Pix, connection only.",
  pia: "CERTPIA signs every SPI message and DICT write. It does not appear in TLS at all: its signature rides inside the XML, end to end, through whichever path the TLS connection took.",
  bc: "The BCB's server certificate on *.pi.rsfn.net.br, from the ICP-Brasil v10 (SSL) chain. Participants must accept more than one active BC certificate and check chain, CN and expiry.",
  qrc: "CERTQRC is the EV TLS certificate of the receiving PSP's dynamic-QR site. Public CA, not SPB standard, registered with the BC so payer PSPs can pin it.",
  jws: "The certificate whose key signs the JWS payload of a dynamic QR. Public CA, Key Usage digitalSignature, published with its full chain (x5c) in the JWK Set. Not registered with the BC.",
  api: "Client certificates for the PSP's API Pix customers. Chosen by the PSP (own CA or external). Bound to OAuth access tokens.",
};

const center = (n: Node) => ({ x: n.x + n.w / 2, y: n.y + 22 });

export function Topology() {
  const [cert, setCert] = useState<CertKey>("all");
  const [down, setDown] = useState<"none" | "op1" | "op2" | "dc1">("none");
  const [sel, setSel] = useState("pspA-op1");
  const [single, setSingle] = useState(false);
  const links = LINKS.filter((l) => !(single && l.id === "pspB-op2"));
  const link = links.find((l) => l.id === sel) ?? links[0];
  const nodeOf = (id: NodeId) => NODES.find((n) => n.id === id)!;
  const isDown = (l: Link) => (down === "op1" || down === "op2" ? l.via === down : down === "dc1" ? l.b === "dc1" : false);
  const active = (l: Link) => cert === "all" || l.certs.includes(cert);
  const rsfn = links.filter((l) => l.via);
  const rsfnUp = rsfn.filter((l) => !isDown(l)).length;
  const online = (["pspA", "pspB", "psti"] as const).filter((p) =>
    rsfn.some((acc) => acc.a === p && !isDown(acc) && rsfn.some((bb) => bb.a === acc.b && !isDown(bb))),
  ).length;

  return (
    <div className="space-y-4">
      <Controls>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">highlight</span>
          <Segmented value={cert} onChange={setCert} options={CERT_OPTS} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">fail</span>
          <Segmented
            value={down}
            onChange={setDown}
            options={[
              { value: "none", label: "nothing" },
              { value: "op1", label: "carrier 1" },
              { value: "op2", label: "carrier 2" },
              { value: "dc1", label: "BCB DC 1" },
            ]}
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={single} onChange={(e) => setSingle(e.target.checked)} className="accent-orange-400" />
          PSP B contracted only carrier 1
        </label>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Who talks to whom, over what" bodyClassName="p-2">
          <svg viewBox="0 0 760 430" className="w-full" role="img" aria-label="RSFN topology">
            <rect x={6} y={8} width={748} height={282} rx={10} fill="none" stroke="#32bcad" strokeOpacity={0.35} strokeDasharray="6 4" />
            <text x={16} y={24} fontSize={10} fill="#32bcad" opacity={0.8}>
              RSFN — private network, no internet access
            </text>
            <rect x={6} y={294} width={748} height={130} rx={10} fill="none" stroke="#8a93a8" strokeOpacity={0.35} strokeDasharray="6 4" />
            <text x={16} y={418} fontSize={10} fill="#8a93a8">
              internet
            </text>
            {links.map((l) => {
              const A = center(nodeOf(l.a));
              const B = center(nodeOf(l.b));
              const dn = isDown(l);
              const on = active(l);
              const path = `M${A.x},${A.y} L${B.x},${B.y}`;
              const color = dn ? "#f87171" : l.id === sel ? "#fb923c" : on ? (l.via ? "#32bcad" : "#a3e635") : "#242a38";
              return (
                <g key={l.id} onClick={() => setSel(l.id)} className="cursor-pointer">
                  <path d={path} stroke="transparent" strokeWidth={14} fill="none" />
                  <path d={path} stroke={color} strokeWidth={l.id === sel ? 3 : 1.6} fill="none" strokeDasharray={dn || l.dashed ? "5 4" : undefined} opacity={on || dn ? 1 : 0.5} />
                  {!dn && on && l.via && (
                    <circle r={3} fill={color}>
                      <animateMotion dur={`${2 + (l.id.length % 3) * 0.4}s`} repeatCount="indefinite" path={path} />
                    </circle>
                  )}
                </g>
              );
            })}
            {(cert === "pia" || cert === "all") && (
              <path d="M170,60 C 420,10 470,10 580,90" stroke="#f5a524" strokeWidth={1.5} strokeDasharray="2 4" fill="none" />
            )}
            {(cert === "pia" || cert === "all") && (
              <text x={330} y={34} fontSize={9.5} fill="#f5a524">
                CERTPIA signature, end-to-end inside the XML
              </text>
            )}
            {NODES.map((n) => {
              const off = (down === "op1" && n.id === "op1") || (down === "op2" && n.id === "op2") || (down === "dc1" && n.id === "dc1");
              return (
                <g key={n.id}>
                  <rect x={n.x} y={n.y} width={n.w} height={44} rx={8} fill={off ? "#2a1416" : "#171b24"} stroke={off ? "#f87171" : n.zone === "bcb" ? "#32bcad" : "#242a38"} />
                  <text x={n.x + 10} y={n.y + 19} fontSize={12} fill={off ? "#f87171" : "#e7e9f0"}>
                    {n.label}
                  </text>
                  <text x={n.x + 10} y={n.y + 34} fontSize={10} fill="#8a93a8" fontFamily="ui-monospace, monospace">
                    {off ? "down" : n.sub}
                  </text>
                </g>
              );
            })}
          </svg>
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel title={link.title}>
            <div className="font-mono text-[11px] text-accent">{link.proto}</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{link.detail}</p>
            {link.certs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {link.certs.map((c) => (
                  <span key={c} className="rounded border border-line bg-panel-2 px-1.5 py-px font-mono text-[10.5px] text-muted">
                    {CERT_OPTS.find((o) => o.value === c)?.label}
                  </span>
                ))}
              </div>
            )}
          </Panel>
          {cert !== "all" && (
            <Panel title={CERT_OPTS.find((o) => o.value === cert)?.label}>
              <p className="text-sm leading-relaxed text-muted">{CERT_INFO[cert]}</p>
            </Panel>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Stat label="RSFN paths up" value={`${rsfnUp} / ${rsfn.length}`} tone={rsfnUp < rsfn.length ? "warn" : "good"} hint="access + backbone links" />
            <Stat label="participants online" value={`${online} / 3`} tone={online < 3 ? "bad" : "good"} hint={online < 3 ? "PSP B had a single carrier" : down === "none" ? "all dual-homed" : "rerouted via the other side"} />
          </div>
        </div>
      </div>
      <p className={clsx("text-xs text-faint")}>
        Try: highlight CERTPIC and then CERTQRC: the first lives only inside the RSFN, the second only on the internet. Fail carrier 1: every
        participant stays online because each one is dual-homed. Now let PSP B save money on a single carrier and fail carrier 1 again. Click any link for what crosses it.
      </p>
    </div>
  );
}
