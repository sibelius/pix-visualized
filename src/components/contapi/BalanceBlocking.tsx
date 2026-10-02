"use client";

import { useState } from "react";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { fmt } from "@/lib/random";
import { XmlView, envelope, x, type Glossary } from "./xml";
import { ME } from "./model";

type Order = { id: number; e2e: string; amount: number };
type Log = { t: string; s: string; tone: "ok" | "bad" | "warn" | "info" };

const BCB = "00038166";
const T0 = Date.UTC(2026, 9, 2, 15, 4, 5, 123);
const iso = (ms: number) => new Date(ms).toISOString();
const brl = (v: number) => `R$ ${fmt(v, 2)}`;
const compact = (v: number) => (Math.abs(v) >= 1e6 ? `R$ ${fmt(v / 1e6, 3)}M` : `R$ ${fmt(v / 1e3, 1)}k`);

export const BAL_GLOSSARY: Glossary = {
  BkToCstmrStmt: "camt.053 BankToCustomerStatement. In the SPI it is not an end-of-day statement with entries: it answers a balance (CSA) or remuneration (CRE) request, or announces the remuneration credit.",
  "Stmt/Id": "idMensagemOriginal: the MsgId of the camt.060 that asked for this. For the automatic remuneration notice it is 32 zeros.",
  "Acct/Id/Othr/Id": "ISPB of the direct participant that owns the Conta PI.",
  "Bal/Tp/CdOrPrtry/Prtry": "SPI-proprietary balance type: SADP = saldo disponível (available), SABK = saldo bloqueado (blocked for payments in settlement). For remuneration: PSSR, REMN, VSME, VVSR. The ISO codes OPBD/CLBD/ITBD are not used.",
  "Bal/Amt": "Always ≥ 0 with Ccy=\"BRL\" (a Conta PI can never be negative, art. 22 §1), 2 decimals.",
  "Bal/CdtDbtInd": "Always CRDT: the catalogue fixes it because a negative balance cannot exist.",
  "Bal/Dt/DtTm": "UTC instant of the last balance update the SPI processed (for a past date: after the last operation of that Brasília calendar day).",
  AcctRptgReq: "camt.060 AccountReportingRequest: the one query message for everything about your Conta PI.",
  ReqdMsgNmId: "Which answer you want: camt.053 (balance or remuneration), camt.052 (list of entries / RCO files), camt.054 (one entry in detail).",
  "ReqdBalTp/CdOrPrtry/Prtry": "CSA = consulta saldo, CRE = remuneration statement, REL = list of entries file, TRD/TRT = Pix Saque/Troco RCO files.",
  "AcctOwnr/Agt/FinInstnId/ClrSysMmbId/MmbId": "The ISPB of the direct participant that owns the Conta PI (you can only query your own).",
  RptgPrd: "Omitted for 'balance right now'. Present for a past closing balance, remuneration, REL, TRD, TRT.",
  "GrpHdr/MsgId": "M + 8-char ISPB of the sender + 23 alphanumerics, 32 chars, case sensitive, never reused.",
  "GrpHdr/CreDtTm": "Creation time, always UTC with milliseconds: YYYY-MM-DDThh:mm:ss.sssZ.",
  BizMsgIdr: "AppHdr copy of the message id.",
  MsgDefIdr: "Message + SPI catalogue version, e.g. camt.053.spi.1.4.",
  AppHdr: "Business Application Header (head.001): sender and receiver ISPB, BizMsgIdr, MsgDefIdr, CreDt and the XMLDSig signature. Click the tag to expand or fold it.",
  Envelope: "Every SPI message is AppHdr (head.001) + Document inside an Envelope whose namespace names the message and its version.",
  Sgntr: "XMLDSig signature of the sender (see the XMLDSig chapter). Omitted here.",
};

export function BalanceBlocking() {
  const [total, setTotal] = useState(2_000_000);
  const [orders, setOrders] = useState<Order[]>([]);
  const [amount, setAmount] = useState(250_000);
  const [minOp, setMinOp] = useState(500_000);
  const [alertAt, setAlertAt] = useState(1_000_000);
  const [autoBlock, setAutoBlock] = useState<"on" | "off">("on");
  const [blocked, setBlocked] = useState(false);
  const [clock, setClock] = useState(T0);
  const [seq, setSeq] = useState(1);
  const [log, setLog] = useState<Log[]>([]);
  const [stmt, setStmt] = useState<{ at: number; sadp: number; sabk: number; n: number } | null>(null);
  const [alerted, setAlerted] = useState(false);

  const sabk = orders.reduce((a, o) => a + o.amount, 0);
  const sadp = total - sabk;

  const tick = () => {
    const now = clock + 1311;
    setClock(now);
    return now;
  };
  const push = (t: number, s: string, tone: Log["tone"]) => setLog((l) => [{ t: iso(t).slice(11, 23), s, tone }, ...l].slice(0, 40));
  const checkAlert = (t: number, newSadp: number) => {
    if (newSadp < alertAt && !alerted) {
      setAlerted(true);
      push(t, `BCB → treasury: comunicação de atingimento de saldo mínimo (SADP ${brl(newSadp)} < ${brl(alertAt)})`, "warn");
    } else if (newSadp >= alertAt && alerted) setAlerted(false);
  };

  const send = () => {
    const t = tick();
    const id = seq;
    setSeq(id + 1);
    const e2e = `E${ME}20261002${iso(t).slice(11, 13)}${iso(t).slice(14, 16)}${String(id).padStart(3, "0")}Xq7Lm2Pz`;
    if (blocked) return push(t, `pacs.008 #${id} ${brl(amount)} → rejected: Conta PI is blocked (manual/automatic block)`, "bad");
    if (sadp - amount < minOp) {
      const code = sadp < amount ? "AM04" : "DS02";
      push(
        t,
        code === "AM04"
          ? `pacs.008 #${id} ${brl(amount)} → pacs.002 RJCT AM04 (SADP ${brl(sadp)} is not enough)`
          : `pacs.008 #${id} ${brl(amount)} → pacs.002 RJCT DS02 (SADP ${brl(sadp)} − ${brl(amount)} would cross the operational limit ${brl(minOp)}; DS02 is new in catálogo 5.13, mandatory from 25/10/2026)`,
        "bad",
      );
      if (autoBlock === "on" && minOp > 0) {
        setBlocked(true);
        push(t, "Conta PI automatically blocked (art. 26-A). Pending outgoing orders will be rejected; receipts, LPI aportes and queries still work.", "bad");
        if (orders.length) {
          push(t, `${orders.length} in-flight order(s) rejected by the block, SABK released`, "bad");
          setOrders([]);
        }
      }
      return;
    }
    setOrders((o) => [...o, { id, e2e, amount }]);
    push(t, `pacs.008 #${id} ${brl(amount)} accepted by SPI: amount moved to SABK, forwarded to the receiving PSP`, "info");
    checkAlert(t, sadp - amount);
  };
  const settle = (ok: boolean) => {
    if (!orders.length) return;
    const t = tick();
    const [o, ...rest] = orders;
    setOrders(rest);
    if (ok) {
      setTotal((v) => v - o.amount);
      push(t, `receiver pacs.002 ACSP → settled #${o.id}: total −${brl(o.amount)}, SABK −${brl(o.amount)}. Irrevocable.`, "ok");
    } else {
      push(t, `#${o.id} not settled (receiver RJCT or SPI timeout AB03) → SABK released, SADP +${brl(o.amount)}`, "warn");
      checkAlert(t, sadp + o.amount);
    }
  };
  const incoming = () => {
    const t = tick();
    setTotal((v) => v + 180_000);
    push(t, `incoming pacs.008 settled to us: total +${brl(180_000)} (credits are not blocked; they land at settlement)`, "ok");
    checkAlert(t, sadp + 180_000);
  };
  const aporte = () => {
    const t = tick();
    setTotal((v) => v + 1_000_000);
    push(t, `LPI0001 Reservas → Conta PI ${brl(1_000_000)} (STR hours only; allowed even while blocked)`, "ok");
    checkAlert(t, sadp + 1_000_000);
  };
  const query = () => {
    const t = tick();
    setStmt({ at: t, sadp, sabk, n: seq });
    push(t, "camt.060 (ReqdMsgNmId=camt.053, Prtry=CSA) → camt.053 with SADP + SABK", "info");
  };
  const unblock = () => {
    const t = tick();
    setBlocked(false);
    push(t, "treasury operator: desbloqueio manual in SPB-Web (módulo SPI)", "ok");
  };
  const reset = () => {
    setTotal(2_000_000);
    setOrders([]);
    setBlocked(false);
    setLog([]);
    setStmt(null);
    setClock(T0);
    setSeq(1);
    setAlerted(false);
  };

  const scale = Math.max(3_000_000, total) * 1.05;
  const pct = (v: number) => `${Math.max(0, (v / scale) * 100)}%`;
  const reqId = (n: number) => `M${ME}cBal${String(n).padStart(4, "0")}q9ZkR2mT7wX4yA1`;
  const respId = (n: number) => `M${BCB}sBal${String(n).padStart(4, "0")}h3JdK8pL6nV0cE5`;

  const camt053 =
    stmt &&
    envelope(
      "camt.053",
      "1.4",
      BCB,
      ME,
      respId(stmt.n),
      iso(stmt.at + 41),
      x(
        "BkToCstmrStmt",
        x("GrpHdr", x("MsgId", respId(stmt.n)), x("CreDtTm", iso(stmt.at + 41))),
        x(
          "Stmt",
          x("Id", reqId(stmt.n)),
          x("Acct", x("Id", x("Othr", x("Id", ME)))),
          ...[
            ["SADP", stmt.sadp],
            ["SABK", stmt.sabk],
          ].map(([tp, v]) =>
            x(
              "Bal",
              x("Tp", x("CdOrPrtry", x("Prtry", String(tp)))),
              { tag: "Amt", attrs: { Ccy: "BRL" }, text: (v as number).toFixed(2) },
              x("CdtDbtInd", "CRDT"),
              x("Dt", x("DtTm", iso(stmt.at - 230))),
            ),
          ),
        ),
      ),
    );

  return (
    <div className="space-y-4">
      <Controls>
        <Button variant="primary" onClick={send}>
          Send pacs.008
        </Button>
        <Button onClick={() => settle(true)} disabled={!orders.length}>
          Receiver accepts (ACSP)
        </Button>
        <Button onClick={() => settle(false)} disabled={!orders.length}>
          Receiver rejects / AB03
        </Button>
        <Button onClick={incoming}>Incoming Pix</Button>
        <Button onClick={aporte}>LPI0001 aporte</Button>
        <Button onClick={query}>camt.060 CSA</Button>
        {blocked && (
          <Button variant="primary" onClick={unblock}>
            Unblock in SPB-Web
          </Button>
        )}
        <Button variant="ghost" onClick={reset}>
          Reset
        </Button>
      </Controls>
      <Controls>
        <Slider label="payment amount" value={amount} min={10_000} max={1_500_000} step={10_000} onChange={setAmount} format={(v) => `R$${fmt(v / 1000)}k`} className="min-w-56 flex-1" />
        <Slider label="limite mínimo de saldo operacional" value={minOp} min={0} max={1_500_000} step={50_000} onChange={setMinOp} format={(v) => `R$${fmt(v / 1000)}k`} className="min-w-72 flex-1" />
        <Slider label="saldo mínimo alert" value={alertAt} min={0} max={2_000_000} step={50_000} onChange={setAlertAt} format={(v) => `R$${fmt(v / 1000)}k`} className="min-w-56 flex-1" />
        <span className="inline-flex items-center gap-2 text-muted">
          bloqueio automático
          <Segmented value={autoBlock} onChange={setAutoBlock} options={[{ value: "off", label: "off" }, { value: "on", label: "on" }]} />
        </span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <Panel title="Conta PI as the SPI sees it" right={blocked ? <span className="font-mono text-xs text-bad">BLOCKED</span> : <span className="font-mono text-xs text-ok">active</span>}>
            <div className="relative h-10 overflow-hidden rounded-md border border-line bg-bg">
              <div className="absolute inset-y-0 left-0 bg-accent/70" style={{ width: pct(sadp) }} />
              <div className="absolute inset-y-0 bg-warn/70" style={{ left: pct(sadp), width: pct(sabk) }} />
              <div className="absolute inset-y-0 w-px bg-bad" style={{ left: pct(minOp) }} title="operational limit" />
              <div className="absolute inset-y-0 w-px border-l border-dashed border-info" style={{ left: pct(alertAt) }} title="saldo mínimo alert" />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                <span className="mr-1 inline-block size-2 rounded-sm bg-accent/70" />
                SADP disponível
              </span>
              <span>
                <span className="mr-1 inline-block size-2 rounded-sm bg-warn/70" />
                SABK bloqueado (in settlement)
              </span>
              <span className="text-bad">| operational limit</span>
              <span className="text-info">┆ saldo mínimo alert</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="total" value={compact(total)} />
              <Stat label="SADP" value={compact(sadp)} tone={sadp < minOp + amount ? "warn" : "good"} />
              <Stat label="SABK" value={compact(sabk)} hint={`${orders.length} in flight`} />
            </div>
          </Panel>
          <Panel title="Log" bodyClassName="max-h-56 overflow-auto font-mono text-[11.5px] leading-relaxed">
            {!log.length && <div className="text-faint">Send a few payments without settling them, then query the balance.</div>}
            {log.map((l, i) => (
              <div key={i} className={l.tone === "ok" ? "text-ok" : l.tone === "bad" ? "text-bad" : l.tone === "warn" ? "text-warn" : "text-muted"}>
                <span className="text-faint">{l.t}Z</span> {l.s}
              </div>
            ))}
          </Panel>
        </div>
        <Panel title="camt.053 balance answer">
          {camt053 ? <XmlView node={camt053} glossary={BAL_GLOSSARY} maxHeight={380} /> : <div className="text-sm text-faint">Press “camt.060 CSA” to ask the SPI for the balance.</div>}
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: send three payments without settling them and query: SABK holds their sum and SADP is what is left. Then raise the operational limit above SADP and send
        one more: DS02, and with automatic blocking on, the whole account stops sending until you unblock it.
      </p>
    </div>
  );
}
