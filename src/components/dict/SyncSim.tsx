"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Stat } from "@/components/ui";
import { entryAttributes, hmacSha256Hex, uuidBytes, vsyncOf, xorHex, type CidEntry } from "./crypto";

type Row = CidEntry & { id: number; requestId: string };

const SPEC_CID = "28c06eb41c4dc9c3ae114831efcac7446c8747777fca8b145ecd31ff8480ae88";

const SEED: Row[] = [
  {
    id: 0,
    requestId: "01020304-0506-0708-090a-0b0c0d0e0f10",
    keyType: "PHONE",
    key: "+5511987654321",
    taxId: "11122233300",
    name: "João Silva",
    tradeName: "",
    participant: "12345678",
    branch: "00001",
    account: "0007654321",
    accountType: "CACC",
  },
  { id: 1, requestId: "a946d533-7f22-42a5-9a9b-e87cd55c0f4d", keyType: "PHONE", key: "+5561988880000", taxId: "12345678909", name: "Ana Beatriz Lima", tradeName: "", participant: "12345678", branch: "0001", account: "0000112233", accountType: "SVGS" },
  { id: 2, requestId: "3f1c9e2a-6b4d-4a8e-9c7f-1d2e3f4a5b6c", keyType: "PHONE", key: "+5521999990001", taxId: "98765432100", name: "Rafael Costa", tradeName: "", participant: "12345678", branch: "0001", account: "0009988776", accountType: "CACC" },
  { id: 3, requestId: "7c2b1a09-8e7d-4f6c-a5b4-c3d2e1f0a9b8", keyType: "PHONE", key: "+5531988776655", taxId: "11222333000181", name: "Padaria Tres Irmaos Ltda", tradeName: "Padaria 3 Irmãos", participant: "12345678", branch: "0042", account: "1029384756", accountType: "CACC" },
  { id: 4, requestId: "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70", keyType: "PHONE", key: "+5541977665544", taxId: "52998224725", name: "Carla Mendes", tradeName: "", participant: "12345678", branch: "0001", account: "0004433221", accountType: "TRAN" },
];

const cidOf = (r: Row) => hmacSha256Hex(uuidBytes(r.requestId), entryAttributes(r));

type CidEvent = { type: "ADDED" | "REMOVED"; cid: string; why: string };

const short = (h?: string) => (h ? `${h.slice(0, 10)}…${h.slice(-4)}` : "…");

function HexDiff({ a, b }: { a: string; b: string }) {
  return (
    <div className="font-mono text-[11px] leading-relaxed break-all">
      {a.split("").map((ch, i) => (
        <span key={i} className={ch !== b[i] ? "text-bad" : "text-muted"}>
          {ch}
        </span>
      ))}
    </div>
  );
}

export function SyncSim() {
  const [dict, setDict] = useState<Row[]>(SEED);
  const [psp, setPsp] = useState<Row[]>(SEED);
  const [cids, setCids] = useState<{ dict: Record<number, string>; psp: Record<number, string> } | null>(null);
  const [events, setEvents] = useState<CidEvent[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [sel, setSel] = useState(1);
  const [specOk, setSpecOk] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([Promise.all(dict.map(cidOf)), Promise.all(psp.map(cidOf))]).then(([d, p]) => {
      if (!live) return;
      setCids({
        dict: Object.fromEntries(dict.map((r, i) => [r.id, d[i]])),
        psp: Object.fromEntries(psp.map((r, i) => [r.id, p[i]])),
      });
    });
    return () => {
      live = false;
    };
  }, [dict, psp]);

  useEffect(() => {
    cidOf(SEED[0]).then((c) => setSpecOk(c === SPEC_CID));
  }, []);

  const vDict = cids ? vsyncOf(dict.map((r) => cids.dict[r.id]).filter(Boolean)) : "";
  const vPsp = cids ? vsyncOf(psp.map((r) => cids.psp[r.id]).filter(Boolean)) : "";
  const inSync = !!cids && vDict === vPsp;

  const editPsp = (field: "name" | "account", value: string) => {
    setPsp((rows) => rows.map((r) => (r.id === sel ? { ...r, [field]: value } : r)));
    setResult(null);
  };

  const propagate = async () => {
    // updateEntry: the DICT removes the old CID and adds the new one
    const p = psp.find((r) => r.id === sel);
    const d = dict.find((r) => r.id === sel);
    if (!p || !d) return;
    const [oldC, newC] = await Promise.all([cidOf(d), cidOf(p)]);
    if (oldC === newC) return;
    setDict((rows) => rows.map((r) => (r.id === sel ? { ...p } : r)));
    setEvents((e) => [{ type: "ADDED", cid: newC, why: "updateEntry" }, { type: "REMOVED", cid: oldC, why: "updateEntry" }, ...e]);
  };

  const dictDelete = async () => {
    // e.g. an ownership claim confirmed elsewhere: the DICT removes the entry, the PSP misses the event
    const victim = dict.find((r) => r.id === 2);
    if (!victim) return;
    const c = await cidOf(victim);
    setDict((rows) => rows.filter((r) => r.id !== 2));
    setEvents((e) => [{ type: "REMOVED", cid: c, why: "confirmClaim (missed by PSP)" }, ...e]);
    setResult(null);
  };

  const verify = () => setResult(inSync ? "OK" : "NOK");

  const reconcile = () => {
    // download the CID set (createCidSetFile), diff, fix local rows with getEntryByCid; Reason=RECONCILIATION
    setPsp(dict.map((r) => ({ ...r })));
    if (!dict.some((r) => r.id === sel)) setSel(dict[0]?.id ?? 0);
    setResult(null);
  };

  const reset = () => {
    setDict(SEED);
    setPsp(SEED);
    setEvents([]);
    setResult(null);
  };

  const selected = psp.find((r) => r.id === sel) ?? psp[0];
  const xorDelta = cids && vDict && vPsp ? xorHex(vDict, vPsp) : "";

  return (
    <div className="space-y-4">
      <Controls>
        <label className="flex items-center gap-2 text-sm text-muted">
          row
          <select value={sel} onChange={(e) => setSel(Number(e.target.value))} className="rounded-lg border border-line bg-bg px-2 py-1 font-mono text-xs text-ink">
            {psp.map((r) => (
              <option key={r.id} value={r.id}>
                {r.key}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <>
            <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
              Name
              <input value={selected.name} onChange={(e) => editPsp("name", e.target.value)} className="w-44 min-w-0 rounded-lg border border-line bg-bg px-2 py-1 font-mono text-xs text-ink" />
            </label>
            <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
              AccountNumber
              <input value={selected.account} onChange={(e) => editPsp("account", e.target.value)} className="w-32 min-w-0 rounded-lg border border-line bg-bg px-2 py-1 font-mono text-xs text-ink" />
            </label>
          </>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={propagate}>send updateEntry</Button>
          <Button onClick={dictDelete}>DICT deletes a key</Button>
          <Button variant="primary" onClick={verify}>
            createSyncVerification
          </Button>
          <Button onClick={reconcile}>reconcile</Button>
          <Button variant="ghost" onClick={reset}>
            Reset
          </Button>
        </div>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Panel title="PHONE keys of ISPB 12345678: PSP database vs DICT">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="text-left text-faint">
                <tr>
                  <th className="py-1 font-normal">key</th>
                  <th className="font-normal">name (PSP)</th>
                  <th className="font-normal">account (PSP)</th>
                  <th className="font-normal">CID in PSP</th>
                  <th className="font-normal">CID in DICT</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {SEED.map((s) => {
                  const p = psp.find((r) => r.id === s.id);
                  const d = dict.find((r) => r.id === s.id);
                  const cp = p && cids?.psp[s.id];
                  const cd = d && cids?.dict[s.id];
                  const bad = !!cids && cp !== cd;
                  return (
                    <tr key={s.id} className={clsx("border-t border-line", sel === s.id && "bg-panel-2/60")} onClick={() => p && setSel(s.id)}>
                      <td className="py-1.5 pr-2 text-ink">{s.key}</td>
                      <td className={clsx("pr-2", p && d && p.name !== d.name ? "text-warn" : "text-muted")}>{p?.name ?? "—"}</td>
                      <td className={clsx("pr-2", p && d && p.account !== d.account ? "text-warn" : "text-muted")}>{p?.account ?? "—"}</td>
                      <td className={clsx("pr-2", bad ? "text-bad" : "text-muted")}>{p ? short(cp) : "—"}</td>
                      <td className={clsx(bad ? "text-bad" : "text-muted")}>{d ? short(cd) : <span className="text-bad">deleted</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-1 text-[11px] tracking-wide text-faint uppercase">ParticipantSyncVerifier (PSP)</div>
              {cids ? <HexDiff a={vPsp} b={vDict} /> : <span className="text-xs text-faint">computing…</span>}
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-[11px] tracking-wide text-faint uppercase">VSync held by the DICT</div>
              {cids ? <HexDiff a={vDict} b={vPsp} /> : <span className="text-xs text-faint">computing…</span>}
            </div>
          </div>
          {xorDelta && !inSync && (
            <div className="mt-2 font-mono text-[11px] break-all text-faint">
              PSP ⊕ DICT = {xorDelta} <span className="text-muted">(the XOR of exactly the CIDs that differ)</span>
            </div>
          )}
          <p className="mt-3 text-xs text-faint">
            Try: change a name in the PSP copy only (a bug or a missed update): one CID changes and both 256-bit verifiers diverge. Press send
            updateEntry and the DICT emits REMOVED + ADDED for that entry and they agree again. Then let the DICT delete a key behind the PSP&apos;s
            back, run the sync verification (NOK), and reconcile.
          </p>
        </Panel>
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="sync verification" value={result ?? "—"} tone={result === "OK" ? "good" : result === "NOK" ? "bad" : "neutral"} hint="Result OK | NOK" />
            <Stat label="entries" value={`${psp.length} / ${dict.length}`} hint="PSP / DICT" />
          </div>
          <Panel title="spec self-test" bodyClassName="p-3">
            <div className="font-mono text-[11px] leading-relaxed break-all text-muted">
              HMAC-SHA256(key = bytes 1..16,
              <br />
              &quot;PHONE&amp;+5511987654321&amp;11122233300&amp;João Silva&amp;&amp;12345678&amp;00001&amp;0007654321&amp;CACC&quot;)
            </div>
            <div className={clsx("mt-1 font-mono text-[11px] break-all", specOk ? "text-ok" : "text-faint")}>
              {specOk === null ? "computing…" : specOk ? `= ${SPEC_CID.slice(0, 24)}… ✓ matches the DICT API example` : "mismatch"}
            </div>
          </Panel>
          <Panel title="CID event log (listCidSetEvents)" bodyClassName="p-0">
            <ol className="max-h-48 divide-y divide-line overflow-auto font-mono text-[11px]">
              {events.length === 0 && <li className="px-3 py-2 text-faint">no events yet</li>}
              {events.map((e, i) => (
                <li key={i} className="px-3 py-1.5">
                  <span className={e.type === "ADDED" ? "text-ok" : "text-bad"}>{e.type}</span> <span className="text-muted">{short(e.cid)}</span>
                  <span className="block text-faint">{e.why}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}
