"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Stat } from "@/components/ui";
import { fmt } from "@/lib/random";
import { VERDICTS, reconRound, reconcile, type Verdict } from "./model";

const short = (s: string) => `${s.slice(0, 9)}…${s.slice(-6)}`;

export function Reconciliation() {
  const [seed, setSeed] = useState(5);
  const rows = useMemo(() => reconRound(seed), [seed]);
  const [guess, setGuess] = useState<Record<string, Verdict>>({});
  const [checked, setChecked] = useState(false);

  const algo = useMemo(
    () =>
      reconcile(
        rows.flatMap((r) => r.ledger),
        rows.flatMap((r) => (r.rel ? [r.rel] : [])),
      ),
    [rows],
  );

  const newRound = () => {
    setSeed((s) => s + 1);
    setGuess({});
    setChecked(false);
  };
  const score = rows.filter((r) => (guess[r.key] ?? "match") === r.truth).length;

  // balance proof: what the SPI booked vs what the ledger believes moved
  const relNet = rows.reduce((a, r) => a + (r.rel && r.rel.situacao === "BOOK" ? (r.rel.creditoOuDebito === "CRDT" ? 1 : -1) * r.rel.valor : 0), 0);
  const ledNet = rows.reduce((a, r) => a + r.ledger.reduce((b, l) => b + (l.state === "settled" ? (l.dir === "CRDT" ? 1 : -1) * l.amount : 0), 0), 0);

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={() => setChecked(true)}>
          Check my answers
        </Button>
        <Button onClick={newRound}>New round</Button>
        <span className="text-xs text-muted">Label each row. Unlabelled rows count as “match”.</span>
      </Controls>
      <div className="grid gap-4 xl:grid-cols-[1fr_220px]">
        <Panel title="Ledger ⟷ SPI relação de lançamentos (REL), joined on EndToEndId + RtrId + direction" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[12px]">
              <thead className="border-b border-line text-[11px] text-faint uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">EndToEndId / RtrId</th>
                  <th className="px-2 py-2 font-medium">your ledger</th>
                  <th className="px-2 py-2 font-medium">SPI (REL)</th>
                  <th className="px-2 py-2 font-medium">your diagnosis</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const g = guess[r.key] ?? "match";
                  const right = g === r.truth;
                  const ref = r.rel ?? null;
                  const l0 = r.ledger[0];
                  const e2e = ref?.idFimAFim ?? l0?.e2e ?? "";
                  const rtr = ref?.idInstrucao ?? l0?.rtrId;
                  return (
                    <tr key={r.key} className={clsx("border-b border-line/60 align-top", checked && (right ? "bg-ok/5" : "bg-bad/10"))}>
                      <td className="px-3 py-2 font-mono text-[11px]">
                        <div className="text-ink">{short(e2e)}</div>
                        {rtr && <div className="text-faint">{short(rtr)}</div>}
                        <div className="text-faint">{ref?.nomeMensagemOrigem ?? (l0 ? l0.kind.toUpperCase().replace(".", "") : "")}</div>
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px]">
                        {r.ledger.length === 0 && <span className="text-faint">—</span>}
                        {r.ledger.map((l) => (
                          <div key={l.id} className={l.state === "pending" ? "text-warn" : "text-muted"}>
                            {l.id} {l.dir === "CRDT" ? "+" : "−"}
                            {fmt(l.amount, 2)} {l.state}
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px]">
                        {ref ? (
                          <span className={ref.situacao === "INFO" ? "text-bad" : "text-muted"}>
                            {ref.creditoOuDebito} {fmt(ref.valor, 2)} {ref.situacao}
                            <div className="text-faint">{ref.dataHoraSituacao.slice(11, 23)}Z</div>
                          </span>
                        ) : (
                          <span className="text-faint">no entry</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={g}
                          onChange={(e) => setGuess((s) => ({ ...s, [r.key]: e.target.value as Verdict }))}
                          className="w-full rounded-md border border-line bg-panel-2 px-1.5 py-1 text-[12px] text-ink"
                        >
                          {VERDICTS.map((v) => (
                            <option key={v.value} value={v.value}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                        {checked && (
                          <div className={clsx("mt-1 text-[11px] leading-snug", right ? "text-ok" : "text-bad")}>
                            {right ? "✓ " : `✗ algorithm says: ${VERDICTS.find((v) => v.value === algo.get(r.key))?.label}. `}
                            {r.truth !== "match" && VERDICTS.find((v) => v.value === r.truth)?.action}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="grid content-start gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <Stat label="score" value={checked ? `${score}/${rows.length}` : "—"} tone={checked ? (score === rows.length ? "good" : "warn") : "neutral"} />
          <Stat label="net booked by SPI" value={`R$ ${fmt(relNet, 2)}`} hint="Σ BOOK credits − debits" />
          <Stat label="net in your ledger" value={`R$ ${fmt(ledNet, 2)}`} hint="Σ settled" />
          <Stat label="unexplained difference" value={`R$ ${fmt(relNet - ledNet, 2)}`} tone={Math.abs(relNet - ledNet) > 0.004 ? "bad" : "good"} hint="must be zero after fixes" />
        </div>
      </div>
      <Panel title="The algorithm (what a reconciliation job actually runs)">
        <pre className="overflow-x-auto font-mono text-[11.5px] leading-relaxed text-muted">{`key(e)  = e.EndToEndId + "|" + (e.RtrId ?? "") + "|" + e.CdtDbtInd
for k in keys(ledger) ∪ keys(REL):
  s = REL[k]; L = ledger[k]                       // L may hold several rows
  if !s                         → never reached SPI   (resend: SPI is idempotent on EndToEndId for 24 h)
  elif L.empty and s.BOOK       → missing in ledger   (book it)
  elif |L| > 1                  → duplicate booking   (reverse extras)
  elif s.INFO                   → L.settled ? rejected, not reversed : ok
  elif L.amount ≠ s.valor       → amount mismatch
  elif L.pending                → pacs.002 missed     (mark settled)
  else                          → match
finally: closing SADP+SABK(D−1) + Σ BOOK(D) must equal SADP+SABK(D)  // camt.053 proves the file is complete`}</pre>
      </Panel>
      <p className="text-xs text-faint">
        Try: find the four planted problems. Hints: a pending row the SPI booked; a debit the SPI marked INFO; two ledger rows for one key; an SPI entry you never
        recorded. Then press New round.
      </p>
    </div>
  );
}
