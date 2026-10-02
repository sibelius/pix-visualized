"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Stat } from "@/components/ui";
import { ADF_FIELDS, asciiFold, buildBrCode, hex4, PIX_MAI_FIELDS, ROOT_FIELDS, validateKey, validateUrl, type Span } from "./brcode";
import { colorFor, TlvString } from "./Tlv";
import { QrSvg, useQr } from "./QrSvg";

type Kind = "static" | "dynamic";

function Field({
  label,
  value,
  onChange,
  hint,
  err,
  mono = true,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  err?: string | null;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="flex items-baseline justify-between gap-2 text-[11px] tracking-wide text-faint uppercase">
        <span>{label}</span>
        {hint && <span className="normal-case tracking-normal">{hint}</span>}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          "mt-1 w-full min-w-0 rounded-lg border bg-panel-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-faint",
          mono && "font-mono",
          err ? "border-bad/60" : "border-line",
        )}
      />
      {err && <span className="mt-0.5 block text-[11px] text-bad">{err}</span>}
    </label>
  );
}

function infoFor(path: string) {
  const parts = path.split(".");
  if (parts.length === 1) return ROOT_FIELDS[parts[0]];
  if (parts[0] === "62") return ADF_FIELDS[parts[1]];
  return PIX_MAI_FIELDS[parts[1]];
}

function flat(spans: Span[]): Span[] {
  return spans.flatMap((s) => [s, ...(s.children ? flat(s.children) : [])]);
}

export function BrCodeBuilder() {
  const [kind, setKind] = useState<Kind>("static");
  const [key, setKey] = useState("+5561912345678");
  const [amount, setAmount] = useState("42.90");
  const [name, setName] = useState("Padaria São João");
  const [city, setCity] = useState("Brasília");
  const [txid, setTxid] = useState("PEDIDO1234");
  const [desc, setDesc] = useState("Pao de queijo x6");
  const [url, setUrl] = useState("pix.example.com/qr/v2/9d36b84fc70b478fb95c12729b90ca25");
  const [unique, setUnique] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const nameF = asciiFold(name).toUpperCase().slice(0, 25);
  const cityF = asciiFold(city).toUpperCase().slice(0, 15);
  const amountOk = amount === "" || /^\d{1,10}\.\d{2}$/.test(amount);
  const txidOk = txid === "" || /^[A-Za-z0-9]{1,25}$/.test(txid);
  const keyErr = kind === "static" ? validateKey(key) : null;
  const urlErr = kind === "dynamic" ? validateUrl(url) : null;
  const maiLen = kind === "static" ? 4 + 14 + 4 + key.length + (desc ? 4 + desc.length : 0) : 4 + 14 + 4 + url.length;
  const maiErr = maiLen > 99 ? `Template 26 would be ${maiLen} chars (max 99): key + infoAdicional compete for the same space.` : null;

  const built = useMemo(
    () =>
      buildBrCode({
        kind,
        key,
        infoAdicional: kind === "static" ? desc : "",
        fss: "",
        url,
        recUrl: "",
        amount: amountOk ? amount : "",
        name: nameF,
        city: cityF,
        cep: "",
        txid: kind === "static" && txidOk ? txid : "",
        unique: kind === "dynamic" ? true : unique,
      }),
    [kind, key, desc, url, amount, amountOk, nameF, cityF, txid, txidOk, unique],
  );
  const qr = useQr(built.code);
  const rows = flat(built.spans);
  const hov = hover ? rows.find((r) => r.path === hover) : null;
  const hovInfo = hov ? infoFor(hov.path) : null;

  const copy = () => {
    navigator.clipboard?.writeText(built.code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  };

  return (
    <div className="space-y-4">
      <Controls>
        <span className="inline-flex items-center gap-2 text-muted">
          type
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "static", label: "static (key inside)" },
              { value: "dynamic", label: "dynamic (URL inside)" },
            ]}
          />
        </span>
        {kind === "static" && (
          <span className="inline-flex items-center gap-2 text-muted">
            01 point of initiation
            <Segmented
              value={unique ? "12" : "none"}
              onChange={(v) => setUnique(v === "12")}
              options={[
                { value: "none", label: "omitted" },
                { value: "12", label: "12 (single use)" },
              ]}
            />
          </span>
        )}
        <span className="text-xs text-faint">name/city are ASCII-folded and upper-cased (common practice; the payer app shows the DICT name anyway)</span>
      </Controls>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Panel title="Inputs">
          <div className="grid gap-3 sm:grid-cols-2">
            {kind === "static" ? (
              <Field label="26-01 chave (Pix key)" value={key} onChange={setKey} err={keyErr} hint={`${key.length}/77`} />
            ) : (
              <Field label="26-25 location URL" value={url} onChange={setUrl} err={urlErr} hint={`${url.length}/77`} />
            )}
            <Field
              label="54 amount"
              value={kind === "dynamic" ? "" : amount}
              onChange={setAmount}
              placeholder={kind === "dynamic" ? "comes from the JSON payload" : "empty = payer types it"}
              err={kind === "static" && !amountOk ? "Use 123.45 (dot, two decimals)" : null}
            />
            <Field label="59 merchant name" value={name} onChange={setName} mono={false} hint={`${nameF.length}/25`} />
            <Field label="60 merchant city" value={city} onChange={setCity} mono={false} hint={`${cityF.length}/15`} />
            {kind === "static" && (
              <>
                <Field label="62-05 txid" value={txid} onChange={setTxid} err={txidOk ? null : "Only A–Z a–z 0–9, max 25"} hint={txid ? `${txid.length}/25` : "empty → ***"} />
                <Field label="26-02 infoAdicional" value={desc} onChange={setDesc} mono={false} err={maiErr} hint={`${desc.length}`} />
              </>
            )}
          </div>
          {kind === "dynamic" && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              A dynamic QR carries no key, amount or txid you can trust: the payer app follows the URL (always HTTPS, never written with the scheme) and the signed JSON
              payload supplies <span className="font-mono">chave</span>, <span className="font-mono">valor</span> and <span className="font-mono">txid</span>. 54 and 62-05 are
              ignored even if present, so the builder emits 62-05 = <span className="font-mono">***</span> like the Manual&apos;s example.
            </p>
          )}
        </Panel>

        <Panel
          title="Pix Copia e Cola (hover a field)"
          right={
            <Button variant="ghost" onClick={copy} className="!px-2 !py-0.5 text-xs">
              {copied ? "copied" : "copy"}
            </Button>
          }
        >
          <TlvString nodes={built.spans} hover={hover} setHover={setHover} />
          <div className="mt-3 min-h-[3.5rem] rounded-lg border border-line bg-panel-2/60 px-3 py-2 text-xs leading-relaxed">
            {hov && hovInfo ? (
              <>
                <span className="font-mono font-semibold" style={{ color: colorFor(hov.path) }}>
                  {hov.path}
                </span>{" "}
                <span className="text-ink">{hovInfo.name}</span> <span className="font-mono text-faint">len {hov.len}</span>
                <div className="mt-0.5 text-muted">{hovInfo.desc}</div>
              </>
            ) : (
              <span className="text-faint">Every field is ID (2 digits) + length (2 digits) + value. Templates (26, 62, 80) nest the same TLV format inside their value.</span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            <QrSvg qr={qr} className="w-full" />
            <div className="grid grid-cols-2 gap-2">
              <Stat label="characters" value={built.code.length} />
              <Stat label="CRC16" value={hex4(built.crc)} hint="over …6304" />
              <Stat label="QR version" value={qr ? qr.version : "—"} hint={qr ? `${qr.size}×${qr.size} modules, ECC M` : ""} />
              <Stat label="template 26" value={`${maiLen}/99`} tone={maiLen > 99 ? "bad" : maiLen > 85 ? "warn" : "good"} />
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Field table" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="text-faint">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-2 py-2 font-medium">name</th>
                <th className="px-2 py-2 font-medium">len</th>
                <th className="px-4 py-2 font-medium">value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.path}
                  onMouseEnter={() => setHover(r.path)}
                  onMouseLeave={() => setHover(null)}
                  className={clsx("border-b border-line/60 last:border-0", hover === r.path && "bg-white/5")}
                >
                  <td className="px-4 py-1.5 font-mono font-semibold" style={{ color: colorFor(r.path), paddingLeft: 16 + r.depth * 16 }}>
                    {r.path}
                  </td>
                  <td className="px-2 py-1.5 text-muted">{infoFor(r.path)?.name}</td>
                  <td className="px-2 py-1.5 font-mono text-faint">{r.len}</td>
                  <td className="max-w-0 truncate px-4 py-1.5 font-mono text-ink">{r.children ? <span className="text-faint">template ({r.children.length} fields)</span> : r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-faint">
        Try: type a long description and watch template 26 approach its 99-character ceiling (the key and infoAdicional share it), then switch to dynamic and see how
        little is left in the QR.
      </p>
    </div>
  );
}
