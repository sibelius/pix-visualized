"use client";

import { useState } from "react";
import { Button, Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { fmt } from "@/lib/random";
import { XmlView, envelope, x, type Glossary } from "./xml";
import { BAL_GLOSSARY } from "./BalanceBlocking";
import { ME, hhmm } from "./model";

type Msg = "LPI0001" | "LPI0002" | "LPI0003" | "LPI0004" | "SEL1009";
const MSGS: { value: Msg; label: string; desc: string; from: Acc; to: Acc }[] = [
  { value: "LPI0001", label: "LPI0001", desc: "Reservas Bancárias / Conta de Liquidação → Conta PI (aporte)", from: "rb", to: "pi" },
  { value: "LPI0002", label: "LPI0002", desc: "Conta Correspondente a Moeda Eletrônica (CCME) → Conta PI (aporte)", from: "ccme", to: "pi" },
  { value: "LPI0003", label: "LPI0003", desc: "Conta PI → Reservas Bancárias / Conta de Liquidação (retirada)", from: "pi", to: "rb" },
  { value: "LPI0004", label: "LPI0004", desc: "Conta PI → CCME (retirada)", from: "pi", to: "ccme" },
  { value: "SEL1009", label: "SEL1009", desc: "Redesconto line in the SPI, requested at the Selic against federal bonds (aporte)", from: "selic", to: "pi" },
];
type Acc = "rb" | "ccme" | "pi" | "selic";
const ACC_NAME: Record<Acc, string> = { rb: "Reservas Bancárias", ccme: "CCME", pi: "Conta PI", selic: "Redesconto (Selic)" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Holiday"] as const;
type Day = (typeof DAYS)[number];

const GLOSS: Glossary = {
  ...BAL_GLOSSARY,
  BkToCstmrDbtCdtNtfctn: "camt.054: in the SPI, the detail of ONE entry in your Conta PI, sent in answer to a camt.060 (it is not pushed for every movement).",
  "Ntfctn/Id": "MsgId of the camt.060 that asked for this detail.",
  "Ntry/Amt": "Entry value in BRL, never negative; the sign is in CdtDbtInd.",
  "Ntry/CdtDbtInd": "CRDT = money into the Conta PI, DBIT = money out.",
  "Ntry/Sts/Cd": "BOOK = settled and booked; INFO = not settled (rejected by a business rule), reported for information only.",
  "BookgDt/Dt": "dataContabil: the SPI accounting date of the entry (Brasília calendar; non-business days roll forward).",
  "ValDt/DtTm": "dataHoraSituacao: UTC instant the entry was booked (or rejected).",
  "BkTxCd/Domn/Cd": "CAMT for liquidity movements (aportes/retiradas, redesconto), PMNT for Pix payments and returns.",
  "Fmly/Cd": "MCOP = miscellaneous credit operation (aporte), MDOP = miscellaneous debit operation (retirada); IRCT/RRCT for payments sent/received.",
  "Fmly/SubFmlyCd": "NTAV (not available) is used only with CAMT + MCOP/MDOP. DMCT for payments, RRTN for returns.",
  "AddtlInfInd/MsgNmId": "nomeMensagemOrigem: which message produced the entry, e.g. PACS.008, PACS.004, LPI0001, SEL1009.",
  "Refs/EndToEndId": "Entry id. For Pix it is the payment's EndToEndId (E…); for liquidity entries the SPI generates an id starting with L + the BCB ISPB 00038166.",
  "Refs/ClrSysRef": "numeroControleSTR: the STR control number of an aporte/retirada or redesconto: 3 letters + yyyymmdd + 9 alphanumerics (20 chars).",
  "RltdAgts/Prtry/Tp": "ContraparteSTR for an aporte/retirada through the STR, ContraparteSelic for the redesconto line.",
  "RltdAgts/Prtry/Agt/FinInstnId/ClrSysMmbId/MmbId": "ISPB of the STR counterparty (your own Reservas, or your STR liquidante), or 00038166 (BCB) for redesconto.",
  "RptgReq/Id": "For camt.054: the EndToEndId (payment), the RtrId (devolução) or the NumCtrlSTR (aporte/retirada/redesconto) of the entry you want.",
};

export function StrTransfers() {
  const [day, setDay] = useState<Day>("Fri");
  const [min, setMin] = useState(18 * 60 + 40);
  const [msg, setMsg] = useState<Msg>("LPI0001");
  const [amount, setAmount] = useState(150);
  const [bal, setBal] = useState<Record<Acc, number>>({ rb: 900, ccme: 60, pi: 80, selic: 0 });
  const [result, setResult] = useState<{ ok: boolean; text: string; xml?: ReturnType<typeof envelope>; req?: ReturnType<typeof envelope> } | null>(null);
  const [n, setN] = useState(1);

  const business = day !== "Sat" && day !== "Sun" && day !== "Holiday";
  const regular = business && min >= 390 && min < 1110;
  const aporteWin = business && min >= 1110 && min < 1140;
  const meta = MSGS.find((m) => m.value === msg)!;
  const isAporte = meta.to === "pi";

  const send = () => {
    const ctl = `STR20261002${"a0b1c2d3e".slice(0, 6)}${String(n).padStart(3, "0")}`;
    setN(n + 1);
    if (!business) return setResult({ ok: false, text: `Rejected: the STR only runs on business days. Today is ${day === "Holiday" ? "a holiday" : day}. Pix keeps settling; your Conta PI is on its own until the next business day 06:30.` });
    if (msg === "SEL1009" && !regular)
      return setResult({ ok: false, text: "Rejected: redesconto requests follow the Selic/STR schedules (modeled here as the STR regular hours; check the Selic regulation for the exact grade)." });
    if (!regular && !(aporteWin && isAporte))
      return setResult({
        ok: false,
        text: aporteWin
          ? "Rejected: between STR0016 (closing balance, 18:30) and 19:00 only own-account aportes INTO the Conta PI are accepted (rule RLPI0007). Withdrawals must wait until 06:30 of the next business day."
          : `Rejected: outside STR hours (regular 06:30–18:30 BRT, aporte-only window to 19:00). It is ${hhmm(min)}.`,
      });
    if (meta.from !== "selic" && bal[meta.from] < amount)
      return setResult({
        ok: false,
        text: `Rejected immediately: ${ACC_NAME[meta.from]} has R$ ${fmt(bal[meta.from])} M. Unlike ordinary STR transfers, orders involving a Conta PI are not queued for funds (Res. BCB 105, art. 56 sole paragraph; rule RLPI0003).`,
      });
    const nb = { ...bal };
    if (meta.from !== "selic") nb[meta.from] -= amount;
    nb[meta.to] += amount;
    setBal(nb);
    const t = Date.UTC(2026, 9, 2, Math.floor(min / 60) + 3, min % 60, 7, 412);
    const ts = new Date(t).toISOString();
    const reqMsgId = `M${ME}cStr${String(n).padStart(4, "0")}Lx9Qw2Er5Ty8Uiv`;
    const respMsgId = `M00038166sStr${String(n).padStart(4, "0")}Bn4Mk7Jh1Gf3Dsa`;
    const req = envelope(
      "camt.060",
      "1.9",
      ME,
      "00038166",
      reqMsgId,
      new Date(t + 60000).toISOString(),
      x(
        "AcctRptgReq",
        x("GrpHdr", x("MsgId", reqMsgId), x("CreDtTm", new Date(t + 60000).toISOString())),
        x("RptgReq", { tag: "Id", text: ctl, mark: "good" }, x("ReqdMsgNmId", "camt.054"), x("AcctOwnr", x("Agt", x("FinInstnId", x("ClrSysMmbId", x("MmbId", ME)))))),
      ),
    );
    const xml = envelope(
      "camt.054",
      "1.16",
      "00038166",
      ME,
      respMsgId,
      new Date(t + 60231).toISOString(),
      x(
        "BkToCstmrDbtCdtNtfctn",
        x("GrpHdr", x("MsgId", respMsgId), x("CreDtTm", new Date(t + 60231).toISOString())),
        x(
          "Ntfctn",
          x("Id", reqMsgId),
          x("Acct", x("Id", x("Othr", x("Id", ME)))),
          x(
            "Ntry",
            { tag: "Amt", attrs: { Ccy: "BRL" }, text: (amount * 1e6).toFixed(2) },
            { tag: "CdtDbtInd", text: isAporte ? "CRDT" : "DBIT", mark: "good" },
            x("Sts", x("Cd", "BOOK")),
            x("BookgDt", x("Dt", "2026-10-02")),
            x("ValDt", x("DtTm", ts)),
            x("BkTxCd", x("Domn", x("Cd", "CAMT"), x("Fmly", { tag: "Cd", text: isAporte ? "MCOP" : "MDOP", mark: "good" }, x("SubFmlyCd", "NTAV")))),
            x("AddtlInfInd", { tag: "MsgNmId", text: msg, mark: "good" }),
            x(
              "NtryDtls",
              x(
                "TxDtls",
                x("Refs", x("EndToEndId", `L00038166${"20261002"}${String(Math.floor(min / 60) + 3).padStart(2, "0")}${String(min % 60).padStart(2, "0")}Lq0Tr4Ns8Vb`), { tag: "ClrSysRef", text: ctl, mark: "good" }),
                x(
                  "RltdAgts",
                  x("Prtry", x("Tp", msg === "SEL1009" ? "ContraparteSelic" : "ContraparteSTR"), x("Agt", x("FinInstnId", x("ClrSysMmbId", x("MmbId", msg === "SEL1009" ? "00038166" : ME))))),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    setResult({
      ok: true,
      text: `${msg} settled in the STR at ${hhmm(min)} BRT: ${ACC_NAME[meta.from]} → ${ACC_NAME[meta.to]} R$ ${fmt(amount)} M. NumCtrlSTR ${ctl}. Ask the SPI for the entry with camt.060 → camt.054:`,
      xml,
      req,
    });
  };

  const accs: Acc[] = ["rb", "ccme", "pi"];
  const maxB = Math.max(...accs.map((a) => bal[a]), 1);
  return (
    <div className="space-y-4">
      <Controls>
        <span className="inline-flex items-center gap-2 text-muted">
          day
          <Segmented value={day} onChange={setDay} options={DAYS.map((d) => ({ value: d, label: d }))} />
        </span>
        <Slider label="time (BRT)" value={min} min={0} max={1435} step={5} onChange={setMin} format={(v) => hhmm(v)} className="min-w-64 flex-1" />
      </Controls>
      <Controls>
        <span className="inline-flex items-center gap-2 text-muted">
          message
          <Segmented value={msg} onChange={setMsg} options={MSGS.map((m) => ({ value: m.value, label: m.label }))} />
        </span>
        <Slider label="amount" value={amount} min={10} max={1000} step={10} onChange={setAmount} format={(v) => `R$${v}M`} className="min-w-56 flex-1" />
        <Button variant="primary" onClick={send}>
          Send to STR
        </Button>
        <Button variant="ghost" onClick={() => (setBal({ rb: 900, ccme: 60, pi: 80, selic: 0 }), setResult(null))}>
          Reset balances
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <Panel title="Accounts at the BCB">
            <div className="space-y-2">
              {accs.map((a) => (
                <div key={a}>
                  <div className="flex justify-between text-xs text-muted">
                    <span>{ACC_NAME[a]}</span>
                    <span className="font-mono">R$ {fmt(bal[a])} M</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-bg">
                    <div className={`h-2 rounded ${a === "pi" ? "bg-[#e879f9]" : "bg-faint"}`} style={{ width: `${(bal[a] / maxB) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs leading-relaxed text-muted">{meta.desc}</div>
          </Panel>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="STR regular" value={regular ? "open" : "closed"} tone={regular ? "good" : "bad"} hint="06:30–18:30 BRT" />
            <Stat label="aporte window" value={aporteWin ? "open" : "—"} tone={aporteWin ? "warn" : "neutral"} hint="after STR0016 → 19:00" />
          </div>
          <Panel title="LPI0005: automatic aportes">
            <p className="text-xs leading-relaxed text-muted">
              LPI0005 configures an automatic transfer into the Conta PI that the STR runs after the regular close: a percentage or a fixed value of the Reservas/CL
              balance (PercSldRB_CL / VlrRB_CL) and/or of the CCME. A new LPI0005 replaces the previous configuration; zeros disable it. Each execution is reported by
              LPI0006, or “Rejeitado sem Saldo” if funds are short. This is the usual way to pre-fund nights and weekends without a person pressing a button at 18:31.
            </p>
          </Panel>
        </div>
        <Panel title="Result">
          {!result && <div className="text-sm text-faint">Pick a day, time and message, then send it.</div>}
          {result && (
            <div className="space-y-3">
              <div className={`text-sm ${result.ok ? "text-ok" : "text-bad"}`}>{result.text}</div>
              {result.req && result.xml && (
                <div className="grid gap-3 xl:grid-cols-2">
                  <XmlView node={result.req} glossary={GLOSS} title="camt.060 request (PSP → SPI)" maxHeight={300} />
                  <XmlView node={result.xml} glossary={GLOSS} title="camt.054 answer (SPI → PSP)" maxHeight={300} />
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: Friday 18:40 — an LPI0001 aporte goes through but an LPI0003 retirada is refused. Move to Saturday: nothing goes through at all. Then try to pull R$ 1,000 M
        out of a Conta PI holding 80: immediate rejection, no queue.
      </p>
    </div>
  );
}
