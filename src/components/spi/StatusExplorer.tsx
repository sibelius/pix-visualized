"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Panel, Segmented } from "@/components/ui";
import { REASONS, TX_STATUS, type Topic } from "./codes";
import { pacs002 } from "./messages";
import { XmlView } from "./XmlView";
import { e2eId, PAYEE_PSP, PAYER_PSP, SPI_ISPB } from "./xml";

const TOPICS: { value: Topic | "all"; label: string }[] = [
  { value: "all", label: "all" },
  { value: "timeout", label: "timeouts" },
  { value: "account", label: "account" },
  { value: "identity", label: "identity" },
  { value: "amount", label: "amount" },
  { value: "routing", label: "routing" },
  { value: "format", label: "format" },
  { value: "returns", label: "returns" },
  { value: "saque", label: "saque/troco" },
  { value: "business", label: "business" },
  { value: "automatico", label: "automático" },
];

const E2E = e2eId(PAYER_PSP.ispb, "2026-10-02T14:03:27.780Z", 42);

export function StatusExplorer() {
  const [q, setQ] = useState("");
  const [who, setWho] = useState<"all" | "SPI" | "receiver">("all");
  const [topic, setTopic] = useState<Topic | "all">("all");
  const [sel, setSel] = useState("AC03");
  const [view, setView] = useState<"rjct" | "acsp" | "acsc">("rjct");

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return REASONS.filter(
      (r) =>
        (who === "all" || (who === "SPI" ? r.raisedBy.startsWith("SPI") : r.raisedBy.includes("receiver"))) &&
        (topic === "all" || r.topic === topic) &&
        (!s || r.code.toLowerCase().includes(s) || r.iso.toLowerCase().includes(s) || r.meaning.toLowerCase().includes(s)),
    );
  }, [q, who, topic]);
  const r = REASONS.find((c) => c.code === sel)!;
  const byReceiver = r.raisedBy === "receiver PSP";

  const xml = useMemo(() => {
    if (view === "acsp") return pacs002({ from: PAYEE_PSP.ispb, to: SPI_ISPB, orgnlInstrId: E2E, orgnlE2E: E2E, sts: "ACSP", creDtTm: "2026-10-02T14:03:29.612Z", seed: 5 });
    if (view === "acsc")
      return pacs002({ from: SPI_ISPB, to: PAYER_PSP.ispb, orgnlInstrId: E2E, orgnlE2E: E2E, sts: "ACSC", creDtTm: "2026-10-02T14:03:30.044Z", settledAt: "2026-10-02T14:03:29.951Z", seed: 6 });
    return pacs002({
      from: byReceiver ? PAYEE_PSP.ispb : SPI_ISPB,
      to: byReceiver ? SPI_ISPB : PAYER_PSP.ispb,
      orgnlInstrId: r.topic === "returns" ? "D" + E2E.slice(1) : E2E,
      orgnlE2E: E2E,
      sts: "RJCT",
      code: r.code,
      addtl: r.meaning.slice(0, 105),
      creDtTm: "2026-10-02T14:03:29.612Z",
      seed: 7,
    });
  }, [view, r, byReceiver]);

  const nSpi = REASONS.filter((c) => c.raisedBy.startsWith("SPI")).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TX_STATUS.map((s) => (
          <div key={s.code} className={clsx("rounded-xl border bg-panel p-3", s.code === "RJCT" ? "border-bad/40" : "border-line")}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={clsx("font-mono text-lg", s.code === "RJCT" ? "text-bad" : s.code === "ACSP" ? "text-info" : "text-ok")}>{s.code}</span>
              <span className="text-[10.5px] text-faint">{s.who}</span>
            </div>
            <div className="font-mono text-[10.5px] text-faint">{s.iso}</div>
            <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{s.meaning}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          title={`StsRsnInf/Rsn/Cd · ${REASONS.length} codes`}
          right={<span className="text-[11px] text-faint">{nSpi} raised by the SPI · {REASONS.length - nSpi} by the receiver PSP</span>}
          bodyClassName="space-y-3"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search code, ISO name or meaning (e.g. timeout, CPF, saque)"
            className="w-full rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={who}
              onChange={setWho}
              options={[
                { value: "all", label: "anyone" },
                { value: "SPI", label: "SPI" },
                { value: "receiver", label: "receiver PSP" },
              ]}
            />
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value as Topic | "all")}
              className="rounded-md border border-line bg-panel-2 px-2 py-1 text-xs text-ink"
            >
              {TOPICS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-faint">{list.length} shown</span>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-[12.5px]">
              <tbody>
                {list.map((c) => (
                  <tr
                    key={c.code}
                    onClick={() => {
                      setSel(c.code);
                      setView("rjct");
                    }}
                    className={clsx("cursor-pointer border-b border-line/60 align-top last:border-0", sel === c.code ? "bg-accent/10" : "hover:bg-panel-2")}
                  >
                    <td className="px-2 py-1.5 font-mono text-ink">
                      {c.code}
                      {c.newIn && <div className="text-[9.5px] text-accent">new in {c.newIn}</div>}
                    </td>
                    <td className="px-2 py-1.5 text-muted">
                      <div className="font-mono text-[10.5px] text-faint">{c.iso}</div>
                      {c.meaning}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span
                        className={clsx(
                          "rounded px-1.5 py-px font-mono text-[10.5px]",
                          c.raisedBy === "SPI" ? "bg-info/15 text-info" : c.raisedBy === "receiver PSP" ? "bg-warn/15 text-warn" : "bg-line text-muted",
                        )}
                      >
                        {c.raisedBy === "SPI or receiver PSP" ? "either" : c.raisedBy === "SPI" ? "SPI" : "receiver"}
                      </span>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td className="p-3 text-faint">No code matches.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="min-w-0 space-y-3">
          <Panel
            title="pacs.002 on the wire"
            right={
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "rjct", label: `RJCT ${sel}` },
                  { value: "acsp", label: "ACSP" },
                  { value: "acsc", label: "ACSC" },
                ]}
              />
            }
          >
            <p className="mb-3 text-[13px] leading-relaxed text-muted">
              {view === "rjct" ? (
                byReceiver ? (
                  <>
                    <b className="text-warn">{sel}</b> is decided by the <b>receiver PSP</b> after it fetches the pacs.008. It answers the SPI with this RJCT instead of
                    ACSP; the SPI releases the reserve in the payer&apos;s Conta PI and sends its own pacs.002 RJCT with the same code to the payer PSP. Nothing settles.
                  </>
                ) : r.raisedBy === "SPI" ? (
                  <>
                    <b className="text-info">{sel}</b> is raised by the <b>SPI</b> itself, so the MsgId starts with M00038166. If the order had not yet been forwarded the
                    receiver PSP never hears about it; for AB03 both sides get the RJCT, because the receiver may already hold a provisional credit.
                  </>
                ) : (
                  <>
                    <b>{sel}</b> is a catch-all that both the SPI and the receiver PSP may use.
                  </>
                )
              ) : view === "acsp" ? (
                <>The receiver PSP&apos;s positive answer: no reason block, no settlement time. Settlement has not happened yet.</>
              ) : (
                <>Sent by the SPI to the payer PSP after the Conta PI balances changed; carries the settlement time and accounting date.</>
              )}
            </p>
            <XmlView root={xml} compact maxHeight={380} defaultPath="TxSts" />
          </Panel>
        </div>
      </div>
      <p className="text-xs text-faint">
        Try: filter by &quot;receiver PSP&quot; to see everything a PSP can refuse on its own account checks (AC03, AC06, AC07, BE01…), then by &quot;SPI&quot; to see what the
        central system catches before anyone else is involved (AM04, AB11, AG12, RC10). Search &quot;return&quot; for the codes that only make sense on a pacs.004.
      </p>
    </div>
  );
}
