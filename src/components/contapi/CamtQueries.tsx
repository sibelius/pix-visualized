"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Controls, Panel, Segmented } from "@/components/ui";
import { XmlView, Mono, envelope, x, type XNode, type Glossary } from "./xml";
import { BAL_GLOSSARY } from "./BalanceBlocking";
import { ME, reconRound, relCsv, type RelRow } from "./model";

type Q = "now" | "past" | "detail" | "rel";
const OPTS: { value: Q; label: string }[] = [
  { value: "now", label: "Balance now" },
  { value: "past", label: "Closing balance, past day" },
  { value: "detail", label: "One entry (camt.054)" },
  { value: "rel", label: "List of entries (REL)" },
];

const GLOSS: Glossary = {
  ...BAL_GLOSSARY,
  "RptgPrd/FrToDt/FrDt": "For a past closing balance: the Brasília calendar date. For REL: the start date of the period, in the UTC calendar used by the entries.",
  "RptgPrd/FrToDt/ToDt": "REL only (required even if equal to FrDt). Not used for balance queries.",
  "FrToTm/FrTm": "REL period start time, UTC hh:mm:ss.sssZ. The whole period may span at most 24 hours.",
  "FrToTm/ToTm": "REL period end time, UTC.",
  "RptgPrd/Tp": "QueryType3Code: always ALLL (all matching items).",
  BkToCstmrAcctRpt: "camt.052 in the SPI does not carry entries. It tells you how many entries there are and the name of the file that holds them.",
  "Rpt/Id": "MsgId of the camt.060 you sent.",
  "TxsSummry/TtlNtries/NbOfNtries": "quantidadeLancamentos: number of records in the file (0 if the period is empty).",
  AddtlRptInf: "hashArquivoGerado: the generated file's NAME, which is the hash of its contents. Download it from the ARQ service under /extrato and recompute the hash to check it.",
  BkToCstmrDbtCdtNtfctn: "camt.054: details of one entry (payment, devolução, aporte/retirada, redesconto or remuneration), answering a camt.060.",
  "Ntry/Sts/Cd": "BOOK = settled and booked; INFO = rejected by a business rule, reported for information only.",
  "BookgDt/Dt": "dataContabil, only present for settled entries.",
  "ValDt/DtTm": "dataHoraSituacao: UTC time of settlement or rejection.",
  "Fmly/Cd": "IRCT = issued real-time credit transfer (you paid), RRCT = received real-time credit transfer.",
  "Fmly/SubFmlyCd": "DMCT for a payment, RRTN for a devolução.",
  "AddtlInfInd/MsgNmId": "Origin message (PACS.008, PACS.004, LPI0001, …).",
  "Refs/EndToEndId": "The idFimAFim of the payment. For a devolução, the original payment's EndToEndId; the return's RtrId goes in InstrId.",
  "Refs/InstrId": "The RtrId (idOperacao, starts with D) of a devolução.",
  "Refs/Prtry/Ref": "Service level of the original pacs.008: PAGPRI, PAGFRD or PAGAGD.",
  "DbtrAgt/FinInstnId/ClrSysMmbId/MmbId": "ISPB of the payer's PSP.",
  "CdtrAgt/FinInstnId/ClrSysMmbId/MmbId": "ISPB of the payee's PSP.",
};

const REQ_ID = `M${ME}q060X7Lm2Pz9Wk4Rb8Tn1Vc`;
const RESP_ID = "M00038166a05Hy6Gt3Fr0Ed7Ws4Qa1Zx";

function req(q: Q, e2e: string): XNode {
  const period =
    q === "past"
      ? x("RptgPrd", x("FrToDt", x("FrDt", "2026-10-01")), x("Tp", "ALLL"))
      : q === "rel"
        ? x("RptgPrd", x("FrToDt", x("FrDt", "2026-10-02"), x("ToDt", "2026-10-02")), x("FrToTm", x("FrTm", "15:00:00.000Z"), x("ToTm", "16:59:59.999Z")), x("Tp", "ALLL"))
        : null;
  return envelope(
    "camt.060",
    "1.9",
    ME,
    "00038166",
    REQ_ID,
    "2026-10-02T17:20:31.004Z",
    x(
      "AcctRptgReq",
      x("GrpHdr", x("MsgId", REQ_ID), x("CreDtTm", "2026-10-02T17:20:31.004Z")),
      x(
        "RptgReq",
        q === "detail" ? { tag: "Id", text: e2e, mark: "good" } : null,
        { tag: "ReqdMsgNmId", text: q === "rel" ? "camt.052" : q === "detail" ? "camt.054" : "camt.053", mark: "good" },
        x("AcctOwnr", x("Agt", x("FinInstnId", x("ClrSysMmbId", x("MmbId", ME))))),
        period,
        q === "detail" ? null : x("ReqdBalTp", x("CdOrPrtry", { tag: "Prtry", text: q === "rel" ? "REL" : "CSA", mark: "good" })),
      ),
    ),
  );
}

function resp(q: Q, rel: RelRow[], hash: string, row: RelRow): XNode {
  const head = (msg: string, ver: string, body: XNode) => envelope(msg, ver, "00038166", ME, RESP_ID, "2026-10-02T17:20:31.377Z", body);
  const gh = x("GrpHdr", x("MsgId", RESP_ID), x("CreDtTm", "2026-10-02T17:20:31.377Z"));
  const acct = x("Acct", x("Id", x("Othr", x("Id", ME))));
  if (q === "now" || q === "past") {
    const dt = q === "now" ? "2026-10-02T17:20:30.981Z" : "2026-10-02T02:59:58.604Z";
    const bal = (tp: string, v: string) => x("Bal", x("Tp", x("CdOrPrtry", x("Prtry", tp))), { tag: "Amt", attrs: { Ccy: "BRL" }, text: v }, x("CdtDbtInd", "CRDT"), x("Dt", x("DtTm", dt)));
    return head(
      "camt.053",
      "1.4",
      x("BkToCstmrStmt", gh, x("Stmt", x("Id", REQ_ID), acct, bal("SADP", q === "now" ? "61842377.19" : "48211930.55"), bal("SABK", q === "now" ? "1293.40" : "0.00"))),
    );
  }
  if (q === "rel")
    return head(
      "camt.052",
      "1.3",
      x("BkToCstmrAcctRpt", gh, x("Rpt", x("Id", REQ_ID), acct, x("TxsSummry", x("TtlNtries", x("NbOfNtries", String(rel.length)))), { tag: "AddtlRptInf", text: hash || "…computing SHA-256…", mark: "good" })),
    );
  const dbit = row.creditoOuDebito === "DBIT";
  const ret = row.nomeMensagemOrigem === "PACS004";
  return head(
    "camt.054",
    "1.16",
    x(
      "BkToCstmrDbtCdtNtfctn",
      gh,
      x(
        "Ntfctn",
        x("Id", REQ_ID),
        acct,
        x(
          "Ntry",
          { tag: "Amt", attrs: { Ccy: "BRL" }, text: row.valor.toFixed(2) },
          x("CdtDbtInd", row.creditoOuDebito),
          x("Sts", x("Cd", row.situacao)),
          row.situacao === "BOOK" ? x("BookgDt", x("Dt", "2026-10-02")) : null,
          x("ValDt", x("DtTm", row.dataHoraSituacao)),
          x("BkTxCd", x("Domn", x("Cd", "PMNT"), x("Fmly", x("Cd", dbit ? "IRCT" : "RRCT"), x("SubFmlyCd", ret ? "RRTN" : "DMCT")))),
          x("AddtlInfInd", x("MsgNmId", ret ? "PACS.004" : "PACS.008")),
          x(
            "NtryDtls",
            x(
              "TxDtls",
              x("Refs", row.idInstrucao ? x("InstrId", row.idInstrucao) : null, { tag: "EndToEndId", text: row.idFimAFim, mark: "good" }, ret ? null : x("Prtry", x("Tp", "ServiceLevel"), x("Ref", "PAGPRI"))),
              x(
                "RltdAgts",
                x("DbtrAgt", x("FinInstnId", x("ClrSysMmbId", x("MmbId", row.participanteDoUsuarioPagador ?? ME)))),
                x("CdtrAgt", x("FinInstnId", x("ClrSysMmbId", x("MmbId", row.participanteDoUsuarioRecebedor ?? ME)))),
              ),
              ret ? null : x("LclInstrm", x("Prtry", "QRDN")),
              x("Purp", x("Cd", ret ? "IPAY" : "IPAY")),
            ),
          ),
        ),
      ),
    ),
  );
}

async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function CamtQueries() {
  const [q, setQ] = useState<Q>("now");
  const [tamper, setTamper] = useState(false);
  const [hash, setHash] = useState("");
  const [check, setCheck] = useState<string | null>(null);
  const rel = useMemo(() => reconRound(11).flatMap((r) => (r.rel ? [r.rel] : [])), []);
  const csv = useMemo(() => relCsv(rel), [rel]);
  const downloaded = tamper ? csv.replace(/,(\d+)\.(\d)(\d),DBIT/, (_m, a, b, c) => `,${a}.${b}${(Number(c) + 1) % 10},DBIT`) : csv;
  const row = rel.find((r) => r.nomeMensagemOrigem === "PACS008" && r.situacao === "BOOK") ?? rel[0];

  useEffect(() => {
    let live = true;
    sha256hex(csv).then((h) => live && setHash(h));
    return () => {
      live = false;
    };
  }, [csv]);
  useEffect(() => setCheck(null), [tamper]);

  const verify = async () => {
    const h = await sha256hex(downloaded);
    setCheck(h);
  };

  return (
    <div className="space-y-4">
      <Controls>
        <span className="inline-flex items-center gap-2 text-muted">
          camt.060 asks for
          <Segmented value={q} onChange={setQ} options={OPTS} />
        </span>
      </Controls>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="camt.060 · PSP → SPI">
          <XmlView node={req(q, row.idFimAFim)} glossary={GLOSS} maxHeight={400} />
        </Panel>
        <Panel title={`${q === "rel" ? "camt.052" : q === "detail" ? "camt.054" : "camt.053"} · SPI → PSP (via the ICOM stream)`}>
          <XmlView node={resp(q, rel, hash, row)} glossary={GLOSS} maxHeight={400} />
        </Panel>
      </div>
      {q === "rel" && (
        <Panel
          title="Step 2 · GET the file from ARQ (https://arq.pi.rsfn.net.br:1130, path /extrato)"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-xs text-muted">
                corrupt one byte in transit
                <Segmented value={tamper ? "yes" : "no"} onChange={(v) => setTamper(v === "yes")} options={[{ value: "no", label: "no" }, { value: "yes", label: "yes" }]} />
              </span>
              <Button onClick={verify}>Verify SHA-256</Button>
            </div>
          }
        >
          <Mono maxHeight={260}>{downloaded}</Mono>
          <div className="mt-2 font-mono text-[11.5px] break-all">
            <div className="text-muted">file name (from camt.052): {hash}</div>
            {check && (
              <div className={check === hash ? "text-ok" : "text-bad"}>
                sha256(downloaded) = {check} {check === hash ? "✓ matches" : "✗ does not match: discard and download again"}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-faint">
            CSV per RFC 4180 with the field names on the first line. Column names here follow the Catálogo’s “Nome no Brasil” (check the exact header in the current
            catalogue). Files stay on ARQ for 24 hours; ARQ supports Range (resume), ETag and If-None-Match. The SPI charges for these queries by result size (R$ 3.00
            per MB per the 2025 SPI annual report), so pull the window you need, not the whole day every minute.
          </p>
        </Panel>
      )}
      <p className="text-xs text-faint">
        Try: switch between the four requests and hover the fields. The REL answer has no entries in it, only a count and a hash; download the file, corrupt it, and
        verify.
      </p>
    </div>
  );
}
