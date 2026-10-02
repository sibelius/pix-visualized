"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented, Stat } from "@/components/ui";
import { XmlView, DICT_DOCS } from "./XmlView";
import {
  apply,
  autoAction,
  COMPLETION,
  DAY,
  lookupView,
  newClaim,
  RESOLUTION,
  VALIDATION_DEADLINE,
  type Actor,
  type Claim,
  type ClaimStatus,
  type ClaimType,
  type Op,
  type Reason,
} from "./claims";

const BASE = Date.UTC(2026, 9, 2, 12, 0, 0);
const iso = (h: number) => new Date(BASE + Math.round(h * 3600e3)).toISOString();
const fmtT = (h: number) => {
  const d = Math.floor(h / DAY);
  const hh = Math.floor(h - d * DAY);
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `day ${d} +${String(hh).padStart(2, "0")}:${String(mm === 60 ? 59 : mm).padStart(2, "0")}`;
};

type LogRow = { t: number; actor: Actor | "DICT"; op: string; ok: boolean; text: string };

const DONOR = { ispb: "87654321", name: "Banco Fictício" };
const CLAIMER = { ispb: "12345678", name: "Banco Exemplo" };

const ACTIONS: Record<Actor, { op: Op; reason?: Reason; label: string; types: ClaimType[] }[]> = {
  DONOR: [
    { op: "acknowledge", label: "acknowledge", types: ["PORTABILITY", "OWNERSHIP"] },
    { op: "confirm", reason: "USER_REQUESTED", label: "confirm · USER_REQUESTED", types: ["PORTABILITY", "OWNERSHIP"] },
    { op: "confirm", reason: "ACCOUNT_CLOSURE", label: "confirm · ACCOUNT_CLOSURE", types: ["PORTABILITY"] },
    { op: "confirm", reason: "DEFAULT_OPERATION", label: "confirm · DEFAULT_OPERATION", types: ["PORTABILITY", "OWNERSHIP"] },
    { op: "cancel", reason: "USER_REQUESTED", label: "cancel · USER_REQUESTED", types: ["PORTABILITY", "OWNERSHIP"] },
    { op: "cancel", reason: "DEFAULT_OPERATION", label: "cancel · DEFAULT_OPERATION", types: ["PORTABILITY"] },
    { op: "cancel", reason: "FRAUD", label: "cancel · FRAUD", types: ["PORTABILITY", "OWNERSHIP"] },
  ],
  CLAIMER: [
    { op: "cancel", reason: "USER_REQUESTED", label: "cancel · USER_REQUESTED", types: ["PORTABILITY", "OWNERSHIP"] },
    { op: "cancel", reason: "FRAUD", label: "cancel · FRAUD", types: ["PORTABILITY", "OWNERSHIP"] },
    { op: "cancel", reason: "DEFAULT_OPERATION", label: "cancel · DEFAULT_OPERATION", types: ["OWNERSHIP"] },
    { op: "complete", label: "complete", types: ["PORTABILITY", "OWNERSHIP"] },
  ],
};

const NODES: { s: ClaimStatus; x: number; y: number }[] = [
  { s: "OPEN", x: 70, y: 36 },
  { s: "WAITING_RESOLUTION", x: 232, y: 36 },
  { s: "CONFIRMED", x: 408, y: 36 },
  { s: "COMPLETED", x: 568, y: 36 },
  { s: "CANCELLED", x: 320, y: 112 },
];
const EDGES: [ClaimStatus, ClaimStatus][] = [
  ["OPEN", "WAITING_RESOLUTION"],
  ["WAITING_RESOLUTION", "CONFIRMED"],
  ["CONFIRMED", "COMPLETED"],
  ["OPEN", "CANCELLED"],
  ["WAITING_RESOLUTION", "CANCELLED"],
  ["CONFIRMED", "CANCELLED"],
];

function StateDiagram({ status }: { status: ClaimStatus }) {
  const at = (s: ClaimStatus) => NODES.find((n) => n.s === s)!;
  return (
    <svg viewBox="0 0 640 140" className="w-full">
      <defs>
        <marker id="claim-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#5a6275" />
        </marker>
      </defs>
      {EDGES.map(([a, b]) => {
        const A = at(a);
        const B = at(b);
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const len = Math.hypot(dx, dy);
        const ox = (dx / len) * 62;
        const oy = (dy / len) * 16;
        return (
          <line
            key={a + b}
            x1={Math.round(A.x + ox)}
            y1={Math.round(A.y + oy)}
            x2={Math.round(B.x - ox)}
            y2={Math.round(B.y - oy)}
            stroke="#5a6275"
            strokeWidth={1.2}
            markerEnd="url(#claim-arrow)"
          />
        );
      })}
      {NODES.map((n) => {
        const on = n.s === status;
        const col = n.s === "CANCELLED" ? "#f87171" : n.s === "COMPLETED" ? "#34d399" : "#22d3ee";
        return (
          <g key={n.s}>
            <rect x={n.x - 66} y={n.y - 14} width={132} height={28} rx={14} fill={on ? col : "#171b24"} stroke={on ? col : "#242a38"} opacity={on ? 0.9 : 1} />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={10.5} fontFamily="ui-monospace, monospace" fill={on ? "#0a0c11" : "#8a93a8"}>
              {n.s}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Timeline({ type, now, log }: { type: ClaimType; now: number; log: LogRow[] }) {
  const W = 640;
  const L = 20;
  const R = 620;
  const max = 31 * DAY;
  const x = (h: number) => Math.round(L + (Math.min(h, max) / max) * (R - L));
  return (
    <svg viewBox={`0 0 ${W} 86`} className="w-full">
      <rect x={x(0)} y={22} width={x(RESOLUTION) - x(0)} height={18} fill="#22d3ee" opacity={0.18} />
      <text x={x(0) + 4} y={35} fontSize={10} fill="#22d3ee">
        resolution period (7 d)
      </text>
      {type === "OWNERSHIP" && (
        <>
          <rect x={x(RESOLUTION)} y={22} width={x(COMPLETION) - x(RESOLUTION)} height={18} fill="#a78bfa" opacity={0.18} />
          <text x={x(RESOLUTION) + 4} y={35} fontSize={10} fill="#a78bfa">
            completion period (7 d)
          </text>
          <line x1={x(VALIDATION_DEADLINE)} x2={x(VALIDATION_DEADLINE)} y1={14} y2={48} stroke="#f87171" strokeDasharray="3 3" />
          <text x={x(VALIDATION_DEADLINE) - 4} y={12} fontSize={10} textAnchor="end" fill="#f87171">
            day 30: validate or cancel
          </text>
        </>
      )}
      <line x1={L} x2={R} y1={48} y2={48} stroke="#242a38" />
      {[0, 7, 14, 21, 28].map((d) => (
        <text key={d} x={x(d * DAY)} y={62} fontSize={10} textAnchor="middle" fill="#5a6275">
          d{d}
        </text>
      ))}
      {log
        .filter((l) => l.ok)
        .map((l, i) => (
          <circle key={i} cx={x(l.t)} cy={48} r={3.5} fill={l.actor === "DONOR" ? "#fbbf24" : l.actor === "CLAIMER" ? "#34d399" : "#8a93a8"} stroke="#0a0c11" />
        ))}
      <line x1={x(now)} x2={x(now)} y1={16} y2={70} stroke="#e7e9f0" strokeWidth={1.5} />
      <text x={Math.min(x(now) + 4, 560)} y={80} fontSize={10} fill="#e7e9f0">
        now · {fmtT(now)}
      </text>
    </svg>
  );
}

function claimXml(c: Claim, owner: string) {
  const isOwn = c.type === "OWNERSHIP";
  return [
    `<GetClaimResponse>`,
    `    <Signature>…</Signature>`,
    `    <Claim>`,
    `        <Type>${c.type}</Type>`,
    `        <Key>+5561988887777</Key>`,
    `        <KeyType>PHONE</KeyType>`,
    `        <ClaimerAccount>`,
    `            <Participant>${CLAIMER.ispb}</Participant>`,
    `            <Branch>0001</Branch>`,
    `            <AccountNumber>0007654321</AccountNumber>`,
    `            <AccountType>CACC</AccountType>`,
    `            <OpeningDate>2024-01-10T03:00:00.000Z</OpeningDate>`,
    `        </ClaimerAccount>`,
    `        <Claimer>`,
    `            <Type>NATURAL_PERSON</Type>`,
    `            <TaxIdNumber>${isOwn ? "98765432100" : "12345678909"}</TaxIdNumber>`,
    `            <Name>${owner}</Name>`,
    `        </Claimer>`,
    `        <DonorParticipant>${DONOR.ispb}</DonorParticipant>`,
    `        <Id>123e4567-e89b-12d3-a456-426655440000</Id>`,
    `        <Status>${c.status}</Status>`,
    `        <ResolutionPeriodEnd>${iso(c.resolutionEnd)}</ResolutionPeriodEnd>`,
    `        <CompletionPeriodEnd>${iso(c.completionEnd)}</CompletionPeriodEnd>`,
    c.confirmReason ? `        <ConfirmReason>${c.confirmReason}</ConfirmReason>` : null,
    c.cancelReason ? `        <CancelReason>${c.cancelReason}</CancelReason>` : null,
    c.cancelledBy ? `        <CancelledBy>${c.cancelledBy}</CancelledBy>` : null,
    `    </Claim>`,
    `</GetClaimResponse>`,
  ]
    .filter(Boolean)
    .join("\n");
}

const CLAIM_DOCS: Record<string, string> = {
  ...DICT_DOCS,
  GetClaimResponse: "What listClaims / getClaim return. Both PSPs poll listClaims at least once a minute to see changes.",
  Claim: "One reivindicação: always created by the claimer PSP on its user's request.",
  Type: "PORTABILITY (same owner, new PSP) or OWNERSHIP (a different person says the phone is now theirs).",
  ClaimerAccount: "The account the key should point to after completion.",
  Claimer: "The person asking. Same TaxIdNumber as the current owner for PORTABILITY, different for OWNERSHIP (else ClaimTypeInconsistent).",
  DonorParticipant: "ISPB of the PSP that holds the key today.",
  Id: "Claim id (UUID). Used in /claims/{ClaimId}/acknowledge|confirm|cancel|complete.",
  Status: "OPEN → WAITING_RESOLUTION → CONFIRMED → COMPLETED, or CANCELLED from any non-terminal state.",
  ResolutionPeriodEnd: "Creation + 7 days. Portability: donor must cancel (DEFAULT_OPERATION) right after it. Ownership: donor must confirm right after it.",
  CompletionPeriodEnd: "Ownership: resolution end + 7 days, the window in which the old owner can still prove possession. Claimer may complete only after it.",
  ConfirmReason: "USER_REQUESTED, ACCOUNT_CLOSURE (portability) or DEFAULT_OPERATION (ownership after 7 days of silence).",
  CancelReason: "USER_REQUESTED, ACCOUNT_CLOSURE, DEFAULT_OPERATION, FRAUD, RECONCILIATION, RFB_VALIDATION…",
  CancelledBy: "DONOR or CLAIMER.",
};

export function ClaimSim() {
  const [type, setType] = useState<ClaimType>("PORTABILITY");
  const [claim, setClaim] = useState<Claim>(() => newClaim("PORTABILITY"));
  const [now, setNow] = useState(0);
  const [since, setSince] = useState(0);
  const [auto, setAuto] = useState(true);
  const [log, setLog] = useState<LogRow[]>([{ t: 0, actor: "CLAIMER", op: "createClaim", ok: true, text: "201 Created · status OPEN" }]);

  const claimerName = type === "OWNERSHIP" ? "Rafael Costa" : "João Silva";

  const reset = (t: ClaimType) => {
    setType(t);
    setClaim(newClaim(t));
    setNow(0);
    setSince(0);
    setLog([{ t: 0, actor: "CLAIMER", op: "createClaim", ok: true, text: "201 Created · status OPEN" }]);
  };

  const act = (actor: Actor, op: Op, reason?: Reason) => {
    const r = apply(claim, now, actor, op, reason);
    const label = `${op}${reason ? ` · ${reason}` : ""}`;
    if (r.ok) {
      setClaim(r.claim);
      setSince(now);
      setLog((l) => [...l, { t: now, actor, op: label, ok: true, text: `200 → ${r.claim.status}${r.note ? ` · ${r.note}` : ""}` }]);
    } else {
      setLog((l) => [...l, { t: now, actor, op: label, ok: false, text: `400 ${r.error}: ${r.why}` }]);
    }
  };

  const advance = (dh: number) => {
    const target = Math.min(now + dh, 31 * DAY);
    let c = claim;
    let s = since;
    const rows: LogRow[] = [];
    if (auto) {
      for (let guard = 0; guard < 6; guard++) {
        const a = autoAction(c, s);
        if (!a || a.at > target) break;
        const r = apply(c, a.at, a.actor, a.op, a.reason);
        if (!r.ok) break;
        c = r.claim;
        s = a.at;
        rows.push({ t: a.at, actor: a.actor, op: `${a.op}${a.reason ? ` · ${a.reason}` : ""} (SLA)`, ok: true, text: `200 → ${c.status}${r.note ? ` · ${r.note}` : ""}` });
      }
    }
    setClaim(c);
    setSince(s);
    setNow(target);
    if (rows.length) setLog((l) => [...l, ...rows]);
  };

  const lv = lookupView(claim);
  const terminal = claim.status === "COMPLETED" || claim.status === "CANCELLED";

  return (
    <div className="space-y-4">
      <Controls>
        <Segmented
          value={type}
          onChange={reset}
          options={[
            { value: "PORTABILITY", label: "PORTABILITY (same owner)" },
            { value: "OWNERSHIP", label: "OWNERSHIP (posse)" },
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={() => advance(1)} disabled={terminal}>
            +1 h
          </Button>
          <Button onClick={() => advance(DAY)} disabled={terminal}>
            +1 day
          </Button>
          <Button onClick={() => advance(7 * DAY)} disabled={terminal}>
            +7 days
          </Button>
          <Button onClick={() => reset(type)}>Reset</Button>
        </div>
        <Segmented
          value={auto ? "on" : "off"}
          onChange={(v) => setAuto(v === "on")}
          options={[
            { value: "on", label: "PSPs follow SLAs" },
            { value: "off", label: "manual only" },
          ]}
        />
      </Controls>
      <Panel title={`Claim for +5561988887777 · ${type}`} right={<span className="font-mono text-xs text-muted">{fmtT(now)}</span>}>
        <StateDiagram status={claim.status} />
        <Timeline type={type} now={now} log={log} />
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(["DONOR", "CLAIMER"] as Actor[]).map((actor) => (
            <div key={actor} className="rounded-lg border border-line bg-panel-2/40 p-3">
              <div className="mb-2 text-xs text-muted">
                <span className={clsx("font-semibold", actor === "DONOR" ? "text-warn" : "text-ok")}>{actor === "DONOR" ? "Donor PSP" : "Claimer PSP"}</span>{" "}
                · {actor === "DONOR" ? `${DONOR.name} ${DONOR.ispb}` : `${CLAIMER.name} ${CLAIMER.ispb}`}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ACTIONS[actor]
                  .filter((a) => a.types.includes(type))
                  .map((a) => (
                    <Button key={a.label} onClick={() => act(actor, a.op, a.reason)} disabled={terminal} className="px-2 py-0.5 font-mono text-[11px]">
                      {a.label}
                    </Button>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">
          Try: with SLAs on, press +7 days on a portability where nobody acts: the donor must cancel it (DEFAULT_OPERATION), so silence keeps the
          key where it is. Do the same on an ownership claim: silence means the key leaves the old owner. Then try to confirm an ownership claim
          by default on day 2, or complete it on day 9, and read the error the DICT returns.
        </p>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="API log" bodyClassName="p-0">
          <ol className="max-h-80 divide-y divide-line overflow-auto font-mono text-[11px]">
            {log
              .slice()
              .reverse()
              .map((l, i) => (
                <li key={i} className="flex gap-3 px-4 py-1.5">
                  <span className="w-24 shrink-0 text-faint">{fmtT(l.t)}</span>
                  <span className={clsx("w-14 shrink-0", l.actor === "DONOR" ? "text-warn" : "text-ok")}>{l.actor.toLowerCase()}</span>
                  <span className="min-w-0">
                    <span className="text-ink">{l.op}</span>
                    <span className={clsx("block", l.ok ? "text-muted" : "text-bad")}>{l.text}</span>
                  </span>
                </li>
              ))}
          </ol>
        </Panel>
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="GET /entries/{key} now"
              value={lv.code}
              tone={lv.code === 404 ? "bad" : "good"}
              hint={lv.where === "donor" ? `→ ${DONOR.name}${lv.openClaim ? " (+OpenClaimCreationDate)" : ""}` : lv.where === "claimer" ? `→ ${CLAIMER.name}` : "key in limbo: payments to it fail"}
            />
            <Stat label="key owner" value={<span className="text-sm">{type === "PORTABILITY" ? "João Silva" : lv.where === "claimer" ? "Rafael Costa" : "Maria (old number holder)"}</span>} hint={type === "OWNERSHIP" ? "different people" : "João at both PSPs"} />
          </div>
          <XmlView xml={claimXml(claim, claimerName)} docs={CLAIM_DOCS} highlight={["Status"]} maxHeight={300} />
        </div>
      </div>
    </div>
  );
}
