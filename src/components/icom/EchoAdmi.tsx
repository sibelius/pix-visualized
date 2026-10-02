"use client";

import { useState } from "react";
import { Button, Controls, Panel, Segmented } from "@/components/ui";
import { Mono, XmlView, envelope, x, type Glossary } from "@/components/contapi/xml";
import { ISPB, resourceId } from "./model";
import { rng } from "@/lib/random";

const GLOSS: Glossary = {
  EchoReq: "pibr.001: proprietary SPI echo request (not ISO 20022).",
  EchoRpt: "pibr.002: the SPI's echo reply, signed by the BCB.",
  "EchoTxInf/Data": "Free text, 1–35 characters. Must come back unchanged in OrgnlData.",
  "EchoTxInf/OrgnlData": "Copy of the Data you sent. Compare it, and verify the BCB signature on this message.",
  "admi.002.001.01": "admi.002 MessageReject. The root element really is named admi.002.001.01.",
  "RltdRef/Ref": "What is being rejected (33 chars max): R + the PI-ResourceId when the SPI could not even read a MsgId (not ISO 20022, broken XML), or the M… MsgId when it could.",
  RjctgPtyRsn: "Short reason (35 chars): an ICOM text such as “XML inválido” / “Assinatura XML inválida”, or “Erro no processamento do SPI”.",
  RjctnDtTm: "When the error was raised (UTC).",
  ErrLctn: "Where: the XML element (e.g. SignatureValue) or a position in the text.",
  RsnDesc: "Longer description (350 chars).",
  AddtlData: "Up to 1,000 chars. EndToEndId=… (or ReturnId=…) when the error concerns one operation inside a multi-operation message.",
  SysEvtNtfctn: "admi.004 SystemEventNotification: operational notices from the SPI to participants.",
  EvtCd: "Always SPI.",
  EvtDesc: "Free text up to 1,000 chars, e.g. a planned maintenance or an accounting-date change.",
};

type Err = "xml" | "xsd" | "sig" | "op" | "spi";
const ERRS: { value: Err; label: string }[] = [
  { value: "xml", label: "unreadable XML" },
  { value: "xsd", label: "XSD violation" },
  { value: "sig", label: "bad signature" },
  { value: "op", label: "one op of many" },
  { value: "spi", label: "SPI processing" },
];

const MSGID = `M${ISPB}x7Qp2Lm9Rt4Vw1Zs8Kd3Nb6`;

export function EchoAdmi() {
  const [data, setData] = useState("ping 2026-10-02 15:04");
  const [ch, setCh] = useState<"CPM" | "CSM">("CPM");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<Err>("xml");
  const rid = resourceId(rng(9));
  const tooLong = data.length > 35 || data.length < 1;

  const pibr001 = envelope(
    "pibr.001",
    "1.3",
    ISPB,
    "00038166",
    MSGID,
    "2026-10-02T18:04:11.274Z",
    x("EchoReq", x("GrpHdr", x("MsgId", MSGID), x("CreDtTm", "2026-10-02T18:04:11.274Z")), x("EchoTxInf", { tag: "Data", text: data, mark: tooLong ? "bad" : "good" })),
  );
  const pibr002 = envelope(
    "pibr.002",
    "1.3",
    "00038166",
    ISPB,
    "M00038166eca1e252ad694dc69df3159",
    "2026-10-02T18:04:11.391Z",
    x("EchoRpt", x("GrpHdr", x("MsgId", "M00038166eca1e252ad694dc69df3159"), x("CreDtTm", "2026-10-02T18:04:11.391Z")), x("EchoTxInf", { tag: "OrgnlData", text: data, mark: "good" })),
  );

  const admiFor = (err: Err, echo = false) => {
    const ref = err === "xml" ? `R${rid}` : MSGID;
    const rsn = err === "xml" ? "XML inválido" : err === "xsd" ? "XML não aderente ao XSD" : err === "sig" ? "Assinatura XML inválida" : err === "op" ? "Erro no processamento do SPI" : "Erro no processamento do SPI";
    const loc = err === "xml" ? "linha 1, coluna 212" : err === "xsd" ? (echo ? "EchoTxInf/Data" : "CdtTrfTxInf/IntrBkSttlmAmt") : err === "sig" ? "SignatureValue" : undefined;
    const desc =
      err === "xml"
        ? "Não foi possível interpretar o XML"
        : err === "xsd"
          ? echo ? "Tamanho máximo de 35 caracteres excedido" : "Valor '12,50' não corresponde ao padrão do tipo"
          : err === "sig"
            ? "Assinatura não confere com digests ou certificado"
            : err === "op"
              ? "Operação com dados inconsistentes"
              : "Mensagem não pôde ser processada";
    return envelope(
      "admi.002",
      "1.5",
      "00038166",
      ISPB,
      "M00038166Ad2Rj7Kx4Lp9Qw1Er6Ty3Ua",
      "2026-10-02T18:05:02.118Z",
      x(
        "admi.002.001.01",
        x("RltdRef", { tag: "Ref", text: ref, mark: "warn" }),
        x("Rsn", x("RjctgPtyRsn", rsn), x("RjctnDtTm", "2026-10-02T18:05:02.117Z"), loc ? x("ErrLctn", loc) : null, x("RsnDesc", desc), err === "op" ? { tag: "AddtlData", text: `EndToEndId=E${ISPB}202610021804Hb7Jk2Lm5Np`, mark: "warn" } : null),
      ),
    );
  };
  const admi = admiFor(err);

  const admi004 = envelope("admi.004", "1.2", "00038166", ISPB, "M00038166Ev4Nt8Mn2Bv6Cx1Za5Sd9Fg", "2026-09-21T23:10:00.000Z", x("SysEvtNtfctn", x("EvtInf", x("EvtCd", "SPI"), x("EvtDesc", "Manutenção programada: consultas camt.060 indisponíveis por cerca de 30 minutos a partir das 22h00 de 21/09/2026. A liquidação não será afetada."))));

  return (
    <div className="space-y-4">
      <Controls>
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted">
          EchoTxInf/Data
          <input value={data} onChange={(e) => (setData(e.target.value), setSent(false))} className="w-56 max-w-full rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-ink" />
          <span className={`font-mono text-xs ${tooLong ? "text-bad" : "text-faint"}`}>{data.length}/35</span>
        </label>
        <span className="inline-flex items-center gap-2 text-muted">
          channel
          <Segmented value={ch} onChange={(v) => (setCh(v), setSent(false))} options={[{ value: "CPM", label: "primary" }, { value: "CSM", label: "secondary" }]} />
        </span>
        <Button variant="primary" onClick={() => setSent(true)}>
          Send echo
        </Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="pibr.001 · you → SPI">
          <XmlView node={pibr001} glossary={GLOSS} maxHeight={260} />
        </Panel>
        <Panel title="pibr.002 · SPI → you">
          {!sent ? (
            <div className="text-sm text-faint">Send the echo.</div>
          ) : tooLong ? (
            <XmlView node={admiFor("xsd", true)} glossary={GLOSS} maxHeight={260} title="Data longer than 35 chars fails the XSD: you get an admi.002 instead (same channel)" />
          ) : (
            <>
              <Mono maxHeight={120}>{`POST https://${ch === "CPM" ? "icom" : "icom-sec"}.pi.rsfn.net.br:${ch === "CPM" ? 16422 : 17422}/api/v1/in/${ISPB}/msgs  → 201 · PI-ResourceId: ${rid}
GET  …/api/v1/out/${ISPB}/stream/…                → 200 · pibr.002 (on the ${ch === "CPM" ? "primary" : "secondary"} channel)`}</Mono>
              <div className="mt-2">
                <XmlView node={pibr002} glossary={GLOSS} maxHeight={220} />
              </div>
              <ul className="mt-2 grid gap-x-4 text-[12.5px] text-ok sm:grid-cols-2">
                <li>✓ authenticated to the ICOM (mTLS)</li>
                <li>✓ sent a message (201)</li>
                <li>✓ signed it acceptably</li>
                <li>✓ received from the out-stream</li>
                <li>✓ verified the BCB signature (your job)</li>
                <li>✓ OrgnlData == Data</li>
              </ul>
            </>
          )}
        </Panel>
      </div>
      <Controls>
        <span className="inline-flex flex-wrap items-center gap-2 text-muted">
          admi.002 for
          <Segmented value={err} onChange={setErr} options={ERRS} />
        </span>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="admi.002 · message-level rejection">
          <XmlView node={admi} glossary={GLOSS} maxHeight={300} />
          <p className="mt-2 text-[12px] leading-relaxed text-faint">
            A 201 never meant “valid”: syntax and signature are checked after storage, and failures come back as admi.002 on your read stream, matched by the
            PI-ResourceId (prefixed with R) or by your MsgId. In the settlement cycle an admi.002 can be non-terminal: a corrected message can still settle. Wording of the
            texts above is illustrative.
          </p>
        </Panel>
        <Panel title="admi.004 · operational notice">
          <XmlView node={admi004} glossary={GLOSS} maxHeight={300} />
          <p className="mt-2 text-[12px] leading-relaxed text-faint">
            Arrives on the same read stream as your payments. Route it to operations, not to the payment pipeline. This example paraphrases a real kind of notice: planned
            camt.060 maintenance with settlement unaffected.
          </p>
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: make Data longer than 35 characters and send it. Then switch between the admi.002 cases and compare RltdRef/Ref: R + ResourceId when the SPI could not
        read your MsgId, the MsgId when it could.
      </p>
    </div>
  );
}
