"use client";

import { useState } from "react";
import clsx from "clsx";
import { Controls, Panel, Segmented } from "@/components/ui";
import { XSD_TYPES, type Facet } from "./xsdTypes";

const verdict = (fs: Facet[]) => (fs.some((x) => !x.ok && x.level !== "warn") ? "bad" : fs.some((x) => !x.ok) ? "warn" : "ok");

export function TypeValidator() {
  const [typeId, setTypeId] = useState(XSD_TYPES[0].id);
  const t = XSD_TYPES.find((x) => x.id === typeId) ?? XSD_TYPES[0];
  const [value, setValue] = useState(t.samples[0]);
  const [ccy, setCcy] = useState("BRL");
  const facets = t.check(value, ccy);
  const v = verdict(facets);

  const pick = (id: string) => {
    const nt = XSD_TYPES.find((x) => x.id === id) ?? XSD_TYPES[0];
    setTypeId(id);
    setValue(nt.samples[0]);
  };

  return (
    <div className="space-y-4">
      <Controls>
        <label className="flex items-center gap-2">
          <span className="text-muted">type</span>
          <select
            value={typeId}
            onChange={(e) => pick(e.target.value)}
            className="rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs"
          >
            {XSD_TYPES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.id}
              </option>
            ))}
          </select>
        </label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-sm"
        />
        {t.id === "ActiveCurrencyAndAmount" && (
          <Segmented value={ccy} onChange={setCcy} options={["BRL", "USD"].map((c) => ({ value: c, label: `Ccy=${c}` }))} />
        )}
      </Controls>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={t.id}
          right={
            <span className={clsx("rounded px-2 py-0.5 font-mono text-xs", v === "ok" ? "bg-ok/15 text-ok" : v === "warn" ? "bg-warn/15 text-warn" : "bg-bad/15 text-bad")}>
              {v === "ok" ? "valid" : v === "warn" ? "valid, but…" : "rejected"}
            </span>
          }
        >
          <div className="mb-3 space-y-1 text-xs">
            <div>
              <span className="text-faint">base </span>
              <span className="font-mono text-ink">{t.base}</span>
            </div>
            <div className="break-all">
              <span className="text-faint">facets </span>
              <span className="font-mono text-ink/90">{t.decl}</span>
            </div>
            <div>
              <span className="text-faint">used in </span>
              <span className="font-mono text-muted">{t.where}</span>
            </div>
          </div>
          <div className="mb-3 rounded-md bg-panel-2 px-2 py-1.5 font-mono text-xs break-all">
            <span className="text-faint">&lt;El{t.id === "ActiveCurrencyAndAmount" ? <span className="text-muted"> Ccy=&quot;{ccy}&quot;</span> : null}&gt;</span>
            <span className={v === "bad" ? "text-bad" : "text-ink"}>{value}</span>
            <span className="text-faint">&lt;/El&gt;</span>
          </div>
          <ul className="space-y-1.5 text-xs">
            {facets.map((x, i) => (
              <li key={i} className="flex gap-2">
                <span className={x.ok ? "text-ok" : x.level === "warn" ? "text-warn" : "text-bad"}>{x.ok ? "✓" : x.level === "warn" ? "!" : "✗"}</span>
                <span className="min-w-0">
                  <span className="font-mono text-ink">{x.name}</span> <span className="text-muted">— {x.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Test vectors (click to load)">
          <ul className="space-y-1">
            {t.samples.map((s, i) => {
              const r = verdict(t.check(s, ccy));
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setValue(s)}
                    className={clsx(
                      "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left font-mono text-xs hover:bg-panel-2",
                      s === value && "bg-panel-2",
                    )}
                  >
                    <span className="min-w-0 truncate text-ink">{s === "" ? "(empty)" : s}</span>
                    <span className={clsx("shrink-0", r === "ok" ? "text-ok" : r === "warn" ? "text-warn" : "text-bad")}>
                      {r === "ok" ? "valid" : r === "warn" ? "warn" : "reject"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            An XSD failure never reaches business logic: the ICOM/SPI answers with an <span className="font-mono">admi.002</span> and the
            payment does not exist. Business-rule failures (wrong CPF owner, closed account) come back later as a{" "}
            <span className="font-mono">pacs.002 RJCT</span> with a reason code.
          </p>
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: in ActiveCurrencyAndAmount, compare <span className="font-mono">150</span> (legal xs:decimal, but not how the catalog writes
        amounts) with <span className="font-mono">1500,00</span> (a Brazilian comma — rejected). In ISONormalisedDateTime, load the -03:00
        sample: a perfectly good xs:dateTime that the SPI&apos;s pattern refuses.
      </p>
    </div>
  );
}
