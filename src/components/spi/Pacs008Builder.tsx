"use client";

import { useMemo, useState } from "react";
import { Button, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { Check, IdAnatomy, RuleList, Select, TextField } from "./Field";
import { XmlView } from "./XmlView";
import { buildPacs008, DIRECTORY, INITIATIONS, PURPOSES, SERVICES, type AcctType, type Initiation, type Purpose, type Service } from "./pacs008";
import { addMs, brl, PAYEE_PSP, PAYER_PSP, serialize } from "./xml";

const T0 = "2026-10-02T14:03:26.880Z";

const TXID_EXAMPLE: Record<Initiation, string> = {
  MANU: "",
  DICT: "",
  QRES: "PEDIDO4471",
  APES: "PEDIDO4471",
  QRDN: "7978c0c97ea847e78e8849634473c1f1",
  APDN: "7978c0c97ea847e78e8849634473c1f1",
  INIC: "ITPorder20261002x9",
  AUTO: "RR1122334420261002aB3dE5fG7hJ9k",
};

export function Pacs008Builder() {
  const [amount, setAmount] = useState(150);
  const [initiation, setInitiation] = useState<Initiation>("DICT");
  const [purpose, setPurpose] = useState<Purpose>("IPAY");
  const [service, setService] = useState<Service>("PAGPRI");
  const [payeeKey, setPayeeKey] = useState(DIRECTORY[0].key);
  const [manual, setManual] = useState({ ispb: PAYEE_PSP.ispb, branch: "0001", account: "48213307", doc: "12345678909", acctType: "TRAN" as AcctType });
  const [txid, setTxid] = useState("");
  const [remittance, setRemittance] = useState("almoço de sexta");
  const [viaItp, setViaItp] = useState(false);
  const [payerDoc, setPayerDoc] = useState("39053344705");
  const [cash, setCash] = useState(50);
  const [validation, setValidation] = useState(0.9);
  const [seed, setSeed] = useState(1);

  const pickInitiation = (v: Initiation) => {
    setInitiation(v);
    setTxid(TXID_EXAMPLE[v]);
    if (v === "INIC") setViaItp(true);
    if (v === "AUTO") setPurpose("IPAY");
    if (v === "AUTO" && service === "PAGPRI") setService("PAGAGD");
  };

  const creDtTm = addMs(T0, Math.round(validation * 1000));
  const built = useMemo(
    () =>
      buildPacs008({
        amount,
        initiation,
        purpose,
        service,
        payerName: "Carla Mendes",
        payerDoc,
        payerAcct: "3301829",
        payerBranch: "0042",
        payerAcctType: "CACC",
        payeeKey,
        manual,
        txid,
        remittance,
        viaItp,
        purchase: purpose === "GSCB" ? Math.max(0, amount - cash) : 0,
        cash: purpose === "IPAY" ? 0 : purpose === "OTHR" ? amount : cash,
        creDtTm,
        accptncDtTm: T0,
        seed,
      }),
    [amount, initiation, purpose, service, payerDoc, payeeKey, manual, txid, remittance, viaItp, cash, creDtTm, seed],
  );
  const failing = built.rules.filter((r) => !r.ok);
  const xmlBytes = useMemo(() => new TextEncoder().encode(serialize(built.root)).length, [built.root]);
  const usesKey = initiation !== "MANU" && initiation !== "AUTO";
  const e = built.e2e;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Panel title="Payment inputs" bodyClassName="space-y-4">
          <div>
            <div className="mb-1 text-xs text-muted">formaDeIniciacao (LclInstrm/Prtry)</div>
            <Segmented value={initiation} onChange={pickInitiation} options={INITIATIONS.map((o) => ({ value: o.value, label: o.label }))} />
            <p className="mt-1 text-[11px] text-faint">{INITIATIONS.find((o) => o.value === initiation)?.doc}</p>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">finalidadeDaTransacao (Purp/Cd)</div>
            <Segmented value={purpose} onChange={setPurpose} options={PURPOSES.map((o) => ({ value: o.value, label: `${o.label}` }))} />
            <p className="mt-1 text-[11px] text-faint">{PURPOSES.find((o) => o.value === purpose)?.doc}</p>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">InstrPrty · SvcLvl/Prtry</div>
            <Segmented value={service} onChange={setService} options={SERVICES.map((o) => ({ value: o.value, label: o.label }))} />
            <p className="mt-1 text-[11px] text-faint">{SERVICES.find((o) => o.value === service)?.doc}</p>
          </div>
          <Slider label="amount" value={amount} min={0} max={2000} step={10} onChange={setAmount} format={(v) => brl(v)} />
          {purpose === "GSCB" && <Slider label="cash part" value={cash} min={0} max={500} step={10} onChange={setCash} format={(v) => brl(v)} />}
          {usesKey ? (
            <Select
              label="Pix key (resolved by DICT → CdtrAgt, CdtrAcct, Cdtr)"
              value={payeeKey}
              onChange={setPayeeKey}
              options={DIRECTORY.map((d) => ({ value: d.key, label: `${d.keyType} ${d.key.length > 24 ? d.key.slice(0, 22) + "…" : d.key}` }))}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <TextField label="receiver ISPB" value={manual.ispb} onChange={(v) => setManual({ ...manual, ispb: v })} />
              <TextField label="branch" value={manual.branch} onChange={(v) => setManual({ ...manual, branch: v })} />
              <TextField label="account" value={manual.account} onChange={(v) => setManual({ ...manual, account: v })} />
              <TextField label="CPF/CNPJ" value={manual.doc} onChange={(v) => setManual({ ...manual, doc: v })} />
            </div>
          )}
          <TextField label="TxId (idConciliacaoRecebedor)" value={txid} onChange={setTxid} bad={failing.some((r) => r.field === "TxId")} hint={`${txid.length} chars`} />
          <TextField label="RmtInf/Ustrd (message to receiver)" value={remittance} onChange={setRemittance} mono={false} hint={`${remittance.length}/140`} bad={remittance.length > 140} />
          <TextField label="payer CPF/CNPJ" value={payerDoc} onChange={setPayerDoc} bad={failing.some((r) => r.field === "Dbtr/Id")} />
          <Check label="initiated by an ITP (InitgPty)" checked={viaItp} onChange={setViaItp} />
          <Slider label="t1 − t0′" value={validation} min={0.1} max={40} step={0.1} onChange={setValidation} format={(v) => `${v.toFixed(1)} s`} />
          <Button onClick={() => setSeed((s) => s + 1)}>New MsgId / EndToEndId</Button>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel title="EndToEndId anatomy" right={<span className="font-mono text-[11px] text-faint">32 chars · idempotency key</span>}>
            <IdAnatomy
              parts={[
                { text: e.slice(0, 1), label: "E", color: "#a78bfa" },
                { text: e.slice(1, 9), label: `ISPB ${PAYER_PSP.name}`, color: "#60a5fa" },
                { text: e.slice(9, 17), label: "yyyyMMdd", color: "#34d399" },
                { text: e.slice(17, 21), label: "HHmm UTC", color: "#34d399" },
                { text: e.slice(21), label: "11 alnum, unique per minute", color: "#fbbf24" },
              ]}
            />
          </Panel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="rules" value={`${built.rules.length - failing.length}/${built.rules.length}`} tone={failing.length ? "bad" : "good"} />
            <Stat label="channel" value={service === "PAGAGD" ? "CSM" : "CPM"} hint={service === "PAGAGD" ? "secondary" : "primary"} />
            <Stat label="timeout" value={service === "PAGAGD" ? "45 min" : "40 s"} hint={service === "PAGPRI" ? "from t0′" : "from t1′"} />
            <Stat
              label="validation"
              value={`${validation.toFixed(1)} s`}
              tone={service === "PAGPRI" && validation > 34 ? "bad" : validation > 1.5 ? "warn" : "good"}
              hint={service === "PAGPRI" ? (validation > 34 ? "> 34 s → AB11" : "p95 target 1.5 s") : "ignored for NORM"}
            />
          </div>
          <Panel title="Catalog filling rules (Regra para o Brasil)">
            <RuleList rules={built.rules} />
          </Panel>
        </div>
      </div>
      <Panel title="Generated message" right={<span className="font-mono text-[11px] text-faint">pacs.008.spi.1.16 · {xmlBytes.toLocaleString("en-US")} bytes unsigned</span>}>
        <XmlView root={built.root} title={`${built.msgId}.xml`} defaultPath="EndToEndId" />
      </Panel>
      <p className="text-xs text-faint">
        Try: switch to QRDN and shorten the TxId below 26 characters; then pick MANU and watch Prxy disappear and the account fields become yours to type. Choose GSCB
        (Pix Troco) and drag the cash part: the Strd block appears with VLCP + VLDN. Push t1 − t0′ past 34 s with HIGH priority and the SPI would refuse it with AB11 before
        anything else happens.
      </p>
    </div>
  );
}
