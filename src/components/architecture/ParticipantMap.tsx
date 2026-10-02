"use client";

import { useState } from "react";
import { Controls, Panel, Segmented, Slider, Stat } from "@/components/ui";
import { INST_TYPES, MODALITIES, SNAPSHOT, allowedSpi, ispbFromCnpj, mandatory, type Config, type InstType, type Modality, type SpiMode } from "./participants";

const YOU = "12345678";
const LIQ = "99999999";
const BETA = "87654321";

function Box({ x, y, w, h, title, sub, stroke = "#242a38", fill = "#171b24", dim }: { x: number; y: number; w: number; h: number; title: string; sub?: string; stroke?: string; fill?: string; dim?: boolean }) {
  return (
    <g opacity={dim ? 0.3 : 1}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 2 : h / 2 + 4)} textAnchor="middle" fontSize={12} fill="#e7e9f0">
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fontSize={10} fill="#8a93a8" fontFamily="ui-monospace,monospace">
          {sub}
        </text>
      )}
    </g>
  );
}

function Edge({ d, color = "#32bcad", dashed, label, lx, ly, dim }: { d: string; color?: string; dashed?: boolean; label?: string; lx?: number; ly?: number; dim?: boolean }) {
  return (
    <g opacity={dim ? 0.15 : 1}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray={dashed ? "5 4" : undefined} markerEnd={`url(#pm-${color.slice(1)})`} />
      {label && lx !== undefined && ly !== undefined && (
        <text x={lx} y={ly} fontSize={10} fill={color} textAnchor="middle" fontFamily="ui-monospace,monospace">
          {label}
        </text>
      )}
    </g>
  );
}

export function ParticipantMap() {
  const [c, setC] = useState<Config>({ modality: "pct", inst: "ip", spi: "indirect", dictDirect: false, accounts: 320_000 });
  const allowed = allowedSpi(c);
  const spi: SpiMode = allowed.includes(c.spi) ? c.spi : allowed[0];
  const isDirect = spi === "direct";
  const isInit = c.modality === "iniciador";
  const dictDirect = isInit ? true : c.dictDirect;
  const must = mandatory(c);
  const [cnpj, setCnpj] = useState("54.811.417/0001-63");
  const ispb = ispbFromCnpj(cnpj);

  const set = (p: Partial<Config>) => setC((x) => ({ ...x, ...p }));
  const sender = isDirect ? YOU : LIQ;

  const wire: [string, string, string][] = isInit
    ? [
        ["AppHdr/Fr/…/Id", "the payer's account provider", "the ITP never talks to the SPI"],
        ["PmtId/EndToEndId", `E${YOU}…`, "the ITP may generate it with its CNPJ root"],
        ["InitgPty/Id/OrgId/Othr/Id", "your CNPJ", "identifies the initiator in pacs.008"],
        ["MndtRltdInf/…/Prtry", "INIC", "formaDeIniciacao = initiation service"],
        ["Conta PI", "none", "no settlement role at all"],
      ]
    : [
        ["AppHdr/Fr/…/Id", sender, isDirect ? "you sign and send over your own ICOM connection" : "your liquidante signs and sends for you"],
        ["DbtrAgt/…/MmbId", YOU, "always the institution holding the payer's account"],
        ["PmtId/EndToEndId", `E${YOU}… or E${LIQ}…`, "direct or indirect participant may generate it"],
        ["Conta PI debited", isDirect ? YOU : `${LIQ} (liquidante)`, isDirect ? "your own central-bank balance" : "you hold a bilateral balance with the liquidante"],
        ["Liquidity top-up", isDirect ? "STR → Conta PI (LPI0001)" : "pay the liquidante", isDirect ? "06:30–18:30 on business days, pre-fund for weekends" : "its Conta PI, its treasury problem"],
        ["Registration", isDirect ? "Conta PI + ICOM + certificates" : `reda.014 sent by ${LIQ}`, isDirect ? "you face the SPI SLAs directly" : "SLA indicators are counted on the liquidante"],
        ["DICT", dictDirect ? "your own DICT connection" : "through a direct-access participant", "independent of the SPI mode"],
      ];

  return (
    <div className="space-y-4">
      <Controls>
        <label className="flex min-w-0 max-w-full items-center gap-2">
          <span className="text-muted">modality</span>
          <select value={c.modality} onChange={(e) => set({ modality: e.target.value as Modality })} className="min-w-0 max-w-full rounded-md border border-line bg-panel-2 px-2 py-1 text-xs">
            {(Object.keys(MODALITIES) as Modality[]).map((m) => (
              <option key={m} value={m}>
                {MODALITIES[m].label} · {MODALITIES[m].pt}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 max-w-full items-center gap-2">
          <span className="text-muted">institution</span>
          <select
            value={c.modality === "governo" ? "stn" : c.inst}
            disabled={c.modality === "governo"}
            onChange={(e) => set({ inst: e.target.value as InstType })}
            className="min-w-0 max-w-full rounded-md border border-line bg-panel-2 px-2 py-1 text-xs"
          >
            {(Object.keys(INST_TYPES) as InstType[]).map((m) => (
              <option key={m} value={m}>
                {INST_TYPES[m].label}
              </option>
            ))}
          </select>
        </label>
        <Segmented
          value={spi}
          onChange={(v) => allowed.includes(v) && set({ spi: v })}
          options={[
            { value: "direct", label: allowed.includes("direct") ? "SPI: direct" : "direct ✕" },
            { value: "indirect", label: allowed.includes("indirect") ? "SPI: indirect" : "indirect ✕" },
            { value: "none", label: allowed.includes("none") ? "no SPI" : "none ✕" },
          ]}
        />
        <Segmented
          value={dictDirect ? "d" : "i"}
          onChange={(v) => !isInit && set({ dictDirect: v === "d" })}
          options={[
            { value: "d", label: "DICT: direct" },
            { value: "i", label: "DICT: indirect" },
          ]}
        />
      </Controls>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Who connects to what" bodyClassName="p-2 sm:p-3">
          <svg viewBox="0 0 760 360" className="w-full">
            <defs>
              {["#32bcad", "#818cf8", "#f5a524", "#8a93a8", "#f472b6"].map((col) => (
                <marker key={col} id={`pm-${col.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={col} />
                </marker>
              ))}
            </defs>
            <rect x={8} y={8} width={744} height={150} rx={12} fill="#0e1118" stroke="#242a38" />
            <text x={20} y={26} fontSize={10.5} fill="#5a6275" letterSpacing={1}>
              BANCO CENTRAL DO BRASIL · RSFN
            </text>
            {/* SPI with Conta PI ledger */}
            <rect x={210} y={36} width={330} height={112} rx={10} fill="#1d2030" stroke="#818cf8" />
            <text x={225} y={54} fontSize={12} fill="#e7e9f0">
              SPI · Conta PI ledger
            </text>
            {[
              { id: LIQ, label: "Banco Liquidante", show: true },
              { id: YOU, label: "You", show: isDirect },
              { id: BETA, label: "Beta (payee PSP)", show: true },
            ].map((r, i) => (
              <g key={r.id} opacity={r.show ? 1 : 0.25}>
                <rect x={225} y={62 + i * 27} width={300} height={22} rx={5} fill="#11141b" stroke={r.id === YOU && r.show ? "#32bcad" : "#242a38"} />
                <text x={235} y={77 + i * 27} fontSize={10.5} fill={r.show ? "#e7e9f0" : "#5a6275"} fontFamily="ui-monospace,monospace">
                  {r.id}
                </text>
                <text x={515} y={77 + i * 27} fontSize={10.5} textAnchor="end" fill="#8a93a8">
                  {r.show ? r.label : "no Conta PI for you"}
                </text>
              </g>
            ))}
            <Box x={570} y={40} w={170} h={46} title="DICT" sub="dict.pi.rsfn.net.br" />
            <Box x={570} y={98} w={170} h={46} title="STR" sub="reserves, business hours" />
            <Box x={22} y={58} w={160} h={70} title="ICOM" sub="icom.pi.rsfn.net.br" stroke="#818cf8" />
            <Edge d="M182,93 L210,93" color="#818cf8" />
            <Edge d="M570,121 L540,121" color="#f5a524" label="LPI" lx={555} ly={116} />

            {/* participants */}
            <Box x={40} y={250} w={170} h={56} title={isInit ? "You (initiator)" : "You"} sub={`ISPB ${YOU}`} stroke="#32bcad" />
            <Box x={295} y={250} w={170} h={56} title="Banco Liquidante" sub={`ISPB ${LIQ} · direct`} dim={isDirect && !isInit} />
            <Box x={560} y={250} w={170} h={56} title={isInit ? "Payer's bank" : "Beta (payee PSP)"} sub={isInit ? "account provider" : `ISPB ${BETA} · direct`} />
            <text x={125} y={326} textAnchor="middle" fontSize={10} fill="#8a93a8">
              {isInit ? "no customer accounts" : "your customers' accounts"}
            </text>

            {/* edges */}
            {isInit ? (
              <>
                <Edge d="M210,278 C380,330 480,330 560,286" color="#f472b6" dashed label="Open Finance API (consent → payment)" lx={385} ly={340} />
                <Edge d="M645,250 C620,200 200,200 110,128" color="#818cf8" label="the bank sends pacs.008" lx={380} ly={196} />
                <Edge d="M150,250 C300,190 560,150 620,86" color="#8a93a8" label="DICT (direct access)" lx={420} ly={232} />
              </>
            ) : (
              <>
                {isDirect ? (
                  <Edge d="M100,250 L100,128" color="#32bcad" label="pacs.008 · Fr=you" lx={100} ly={190} />
                ) : (
                  <>
                    <Edge d="M210,278 L295,278" color="#32bcad" dashed label="contract" lx={252} ly={272} />
                    <Edge d="M360,250 C330,200 200,190 150,128" color="#32bcad" label={`pacs.008 · Fr=${LIQ}`} lx={300} ly={212} />
                  </>
                )}
                <Edge d="M645,250 C640,200 220,190 160,128" color="#818cf8" dashed label="pacs.002 · Fr=87654321" lx={560} ly={214} />
                {dictDirect ? (
                  <Edge d="M195,250 C330,170 560,130 600,86" color="#8a93a8" label="DICT direct" lx={470} ly={170} />
                ) : (
                  <Edge d="M380,250 C460,170 560,130 610,86" color="#8a93a8" dashed label="DICT via a direct-access PSP" lx={520} ly={186} />
                )}
              </>
            )}
          </svg>
          <p className="mt-1 px-2 text-xs leading-relaxed text-muted">{MODALITIES[c.modality].what}</p>
          {INST_TYPES[c.inst].forced && c.modality !== "iniciador" && c.modality !== "governo" && (
            <p className="mt-1 px-2 text-xs text-warn">Rule: {INST_TYPES[c.inst].note}.</p>
          )}
        </Panel>

        <div className="min-w-0 space-y-3">
          <Panel title="What changes on the wire">
            <ul className="space-y-2 text-xs">
              {wire.map(([k, v, note]) => (
                <li key={k}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-mono text-[#a5b4fc]">{k}</span>
                    <span className="font-mono text-ink">{v}</span>
                  </div>
                  <div className="text-faint">{note}</div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Is participation mandatory?">
            <Slider
              label="active accounts"
              value={c.accounts}
              min={0}
              max={2_000_000}
              step={10_000}
              onChange={(v) => set({ accounts: v })}
              format={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : `${Math.round(v / 1000)}k`)}
            />
            <div className="mt-3">
              <Stat
                label="Res. BCB nº 1/2020, art. 3º"
                value={must ? "mandatory" : "optional"}
                tone={must ? "warn" : "neutral"}
                hint={
                  c.modality !== "pct"
                    ? "the threshold applies to account-providing institutions"
                    : c.inst === "ipNa"
                      ? "applies to BCB-authorized FIs and IPs"
                      : "> 500,000 active deposit, savings and prepaid accounts"
                }
              />
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title={`The real population · BCB participant list of ${SNAPSHOT.date}`}>
          <div className="mb-3 flex flex-wrap gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-accent" /> direct
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[#818cf8]" /> indirect
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[#f472b6]" /> not in the SPI (initiators)
            </span>
          </div>
          <div className="space-y-2">
            {SNAPSHOT.byType.map((r) => {
              const tot = r.direct + r.indirect + r.none;
              const scale = 558;
              return (
                <div key={r.label} className="grid grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-[230px_minmax(0,1fr)] sm:items-center sm:gap-3">
                  <span className="text-xs text-muted">
                    {r.label} <span className="font-mono text-faint">{tot}</span>
                  </span>
                  <div className="flex h-4 min-w-0 overflow-hidden rounded-sm bg-panel-2">
                    <div className="bg-accent" style={{ width: `${(r.direct / scale) * 100}%` }} title={`${r.direct} direct`} />
                    <div className="bg-[#818cf8]" style={{ width: `${(r.indirect / scale) * 100}%` }} title={`${r.indirect} indirect`} />
                    <div className="bg-[#f472b6]" style={{ width: `${(r.none / scale) * 100}%` }} title={`${r.none} initiators`} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="active" value={SNAPSHOT.active} hint={`+${SNAPSHOT.joining} joining`} />
            <Stat label="direct / indirect" value={`${SNAPSHOT.spi.direct} / ${SNAPSHOT.spi.indirect}`} hint={`${SNAPSHOT.spi.none} not in SPI`} />
            <Stat label="mandatory" value={SNAPSHOT.pix.mandatory} hint="> 500k accounts" />
            <Stat label="modalities" value={`${SNAPSHOT.modality.pct}·${SNAPSHOT.modality.iniciador}·${SNAPSHOT.modality.liquidante}·${SNAPSHOT.modality.governo}`} hint="PCT · ITP · LESP · STN" />
          </div>
          <p className="mt-2 text-[11px] text-faint">
            Source: bcb.gov.br/estabilidadefinanceira/participantes_pix, CSV of 2026-10-01. 539 of 558 credit cooperatives are indirect — they
            settle through their cooperative system&apos;s bank.
          </p>
        </Panel>
        <Panel title="ISPB from a CNPJ">
          <input
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            spellCheck={false}
            className="w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-sm"
          />
          <div className="mt-3 font-mono text-2xl">
            {ispb ? (
              <>
                <span className="text-accent">{ispb}</span>
                <span className="text-faint">{cnpj.toUpperCase().replace(/[./-]/g, "").slice(8)}</span>
              </>
            ) : (
              <span className="text-sm text-bad">not a 14-character CNPJ</span>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The ISPB (Identificador do SPB) is the 8-character CNPJ root. It names an institution everywhere: AppHdr Fr/To, DbtrAgt/CdtrAgt,
            the EndToEndId, DICT entries. The SPI itself is <span className="font-mono text-ink">00038166</span> (BCB), Banco do Brasil is{" "}
            <span className="font-mono text-ink">00000000</span>, the STN <span className="font-mono text-ink">00394460</span>. The XSD
            already accepts letters ([0-9A-Z]{"{8}"}) for alphanumeric CNPJs.
          </p>
        </Panel>
      </div>
      <p className="text-xs text-faint">
        Try: start as an authorized payment institution, indirect — the pacs.008 leaves with the liquidante&apos;s ISPB in AppHdr/Fr but yours
        in DbtrAgt. Flip to direct and a Conta PI row appears. Pick &quot;not BCB-authorized&quot; or &quot;commercial bank&quot; and one of
        the modes is no longer allowed. Choose the initiator modality and the SPI edge disappears entirely.
      </p>
    </div>
  );
}
