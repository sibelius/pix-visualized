"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Stat } from "@/components/ui";
import { analyzeKey, CLAIMABLE, cnpjWithDv, cpfWithDv, KEY_REGEX_SRC, type DigitTrace, type KeyType } from "./keys";

const AMBIG = cpfWithDv("119876543");
const SAMPLES: { label: string; value: string }[] = [
  { label: "CPF", value: "123.456.789-09" },
  { label: "bad CPF", value: "123.456.789-10" },
  { label: "alnum CNPJ", value: "12.ABC.345/01DE-35" },
  { label: "CNPJ", value: "11.222.333/0001-81" },
  { label: "phone", value: "+55 (11) 98765-4321" },
  { label: "CPF or phone?", value: AMBIG },
  { label: "e-mail", value: "Maria.Silva@Example.com.br" },
  { label: "e-mail with %", value: "joao%pix@banco.com" },
  { label: "EVP", value: "123e4567-e89b-42d3-a456-426655440000" },
];

const TYPE_COLOR: Record<KeyType, string> = {
  CPF: "#22d3ee",
  CNPJ: "#818cf8",
  PHONE: "#34d399",
  EMAIL: "#fbbf24",
  EVP: "#f472b6",
};

function Trace({ t }: { t: DigitTrace }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] tracking-wide text-faint uppercase">verifier digit {t.dv}</div>
      <div className="overflow-x-auto">
        <table className="font-mono text-[11px] tabular-nums">
          <tbody>
            <tr className="text-ink">
              <td className="pr-2 text-faint">char</td>
              {t.rows.map((r, i) => (
                <td key={i} className="px-1 text-center">
                  {r.ch}
                </td>
              ))}
            </tr>
            <tr className="text-muted">
              <td className="pr-2 text-faint">value</td>
              {t.rows.map((r, i) => (
                <td key={i} className={clsx("px-1 text-center", r.value > 9 && "text-warn")}>
                  {r.value}
                </td>
              ))}
            </tr>
            <tr className="text-muted">
              <td className="pr-2 text-faint">×w</td>
              {t.rows.map((r, i) => (
                <td key={i} className="px-1 text-center">
                  {r.weight}
                </td>
              ))}
            </tr>
            <tr className="text-ink">
              <td className="pr-2 text-faint">=</td>
              {t.rows.map((r, i) => (
                <td key={i} className="px-1 text-center">
                  {r.product}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-1 font-mono text-[11px] text-muted">
        Σ = {t.sum} · {t.sum} mod 11 = {t.rem} · digit = {t.rem < 2 ? "0 (rem < 2)" : `11 − ${t.rem} = ${t.digit}`}
      </div>
    </div>
  );
}

export function KeyInspector() {
  const [input, setInput] = useState(SAMPLES[0].value);
  const a = useMemo(() => analyzeKey(input), [input]);

  return (
    <div className="space-y-4">
      <Controls>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 basis-64 rounded-lg border border-line bg-bg px-3 py-1.5 font-mono text-sm text-ink outline-none focus:border-faint"
          placeholder="type a CPF, CNPJ, phone, e-mail or EVP"
        />
        <div className="flex flex-wrap gap-1.5">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setInput(s.value)}
              className="rounded-md border border-line bg-panel-2 px-2 py-0.5 text-xs text-muted hover:border-faint hover:text-ink"
            >
              {s.label}
            </button>
          ))}
        </div>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel
          title="Detected key"
          right={
            a.type && (
              <span className="rounded-md px-2 py-0.5 font-mono text-xs text-black" style={{ background: TYPE_COLOR[a.type] }}>
                {a.type}
              </span>
            )
          }
        >
          <div className="mb-3">
            <div className="text-[11px] tracking-wide text-faint uppercase">normalized (what goes in &lt;Key&gt;)</div>
            <div className={clsx("mt-0.5 font-mono text-lg break-all", a.valid ? "text-ok" : "text-bad")}>{a.normalized || "—"}</div>
            {a.type && <div className="mt-1 font-mono text-[11px] break-all text-faint">regex {KEY_REGEX_SRC[a.type]}</div>}
          </div>
          <ul className="space-y-1.5 text-sm">
            {a.checks.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className={clsx("mt-0.5 font-mono text-xs", c.ok ? "text-ok" : "text-bad")}>{c.ok ? "✓" : "✗"}</span>
                <span className="min-w-0">
                  <span className="text-ink">{c.label}</span>
                  {c.detail && <span className="block font-mono text-xs break-all text-muted">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          {a.ambiguity && <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-warn">{a.ambiguity}</div>}
          {a.traces && (
            <div className="mt-4 grid gap-4 border-t border-line pt-3">
              {a.traces.map((t) => (
                <Trace key={t.dv} t={t} />
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-faint">
            Try: the alphanumeric CNPJ (Receita&apos;s 2026 format): letters count as ASCII − 48, so &apos;A&apos; = 17. Then the 11-digit &quot;CPF or phone?&quot;
            sample, which passes the CPF check and also has a valid DDD + 9 mobile shape.
          </p>
        </Panel>
        <div className="space-y-3 self-start">
          <Panel title="Claims allowed for this type" bodyClassName="p-3">
            <table className="w-full text-xs">
              <thead className="text-faint">
                <tr>
                  <th className="text-left font-normal">type</th>
                  <th className="font-normal">portability</th>
                  <th className="font-normal">ownership</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {(Object.keys(CLAIMABLE) as KeyType[]).map((k) => (
                  <tr key={k} className={clsx(a.type === k ? "text-ink" : "text-faint")}>
                    <td className="py-0.5">{k}</td>
                    <td className="text-center">{CLAIMABLE[k].portability ? "✓" : "·"}</td>
                    <td className="text-center">{CLAIMABLE[k].ownership ? "✓" : "·"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              Per DICT API v2.12 createClaim. v1 also allowed ownership claims on EMAIL; v2 restricts it to PHONE (a phone number gets recycled by
              the carrier, an e-mail rarely does).
            </p>
          </Panel>
          <KeySlots />
        </div>
      </div>
    </div>
  );
}

type Slot = { type: KeyType; key: string };

function KeySlots() {
  const [owner, setOwner] = useState<"PF" | "PJ">("PF");
  const [keys, setKeys] = useState<Slot[]>([]);
  const [n, setN] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const limit = owner === "PF" ? 5 : 20;
  const taxId = owner === "PF" ? cpfWithDv("529982247") : cnpjWithDv("A1B2C3D40001");

  const add = (type: KeyType) => {
    if (keys.length >= limit) {
      setMsg({ ok: false, text: `400 EntryLimitExceeded: ${limit} keys per account for ${owner === "PF" ? "CPF" : "CNPJ"} holders` });
      return;
    }
    const taxType: KeyType = owner === "PF" ? "CPF" : "CNPJ";
    if (type === taxType && keys.some((k) => k.type === type)) {
      setMsg({ ok: false, text: "400 EntryAlreadyExists: this account already has its owner's tax-id key" });
      return;
    }
    const i = n + 1;
    setN(i);
    const key =
      type === "PHONE"
        ? `+55119${String(87650000 + i * 37).slice(-8)}`
        : type === "EMAIL"
          ? `user${i}@example.com`
          : type === "EVP"
            ? `${(0x5f3a9c10 + i * 7919).toString(16).padStart(8, "0")}-1c2d-4e5f-9a${String(i).padStart(2, "0")}-${(0x7b6a5c4d3e2f + i).toString(16).slice(-12)}`
            : taxId;
    setKeys([...keys, { type, key }]);
    setMsg({ ok: true, text: `201 Created (${type})` });
  };

  return (
    <Panel
      title="Keys per account"
      bodyClassName="p-3"
      right={
        <Segmented
          value={owner}
          onChange={(v) => {
            setOwner(v);
            setKeys([]);
            setMsg(null);
          }}
          options={[
            { value: "PF", label: "PF" },
            { value: "PJ", label: "PJ" },
          ]}
        />
      }
    >
      <div className="mb-2 grid grid-cols-2 gap-2">
        <Stat label="used / limit" value={`${keys.length} / ${limit}`} tone={keys.length >= limit ? "bad" : "neutral"} />
        <Stat label="owner" value={<span className="text-sm">{owner === "PF" ? "CPF" : "CNPJ"}</span>} hint={<span className="font-mono">{taxId}</span>} />
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {(["PHONE", "EMAIL", "EVP", owner === "PF" ? "CPF" : "CNPJ"] as KeyType[]).map((t) => (
          <Button key={t} onClick={() => add(t)} className="px-2 py-0.5 text-xs">
            + {t}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: limit }, (_, i) => (
          <span
            key={i}
            title={keys[i]?.key}
            className="h-3 w-3 rounded-sm border border-line"
            style={{ background: keys[i] ? TYPE_COLOR[keys[i].type] : "transparent" }}
          />
        ))}
      </div>
      {msg && <div className={clsx("mt-2 font-mono text-[11px]", msg.ok ? "text-ok" : "text-bad")}>{msg.text}</div>}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        The limit is per account, not per person or per holder: a joint account still gets 5. A CPF/CNPJ key must equal the owner&apos;s own
        number (else EntryTaxIdNumberByDifferentOwner).
      </p>
    </Panel>
  );
}
