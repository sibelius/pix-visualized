import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { beyond } from "@/content/beyond";
import { SaqueTroco } from "@/components/beyond/SaqueTroco";
import { Aproximacao } from "@/components/beyond/Aproximacao";
import { Agendado } from "@/components/beyond/Agendado";
import { LimitsExplorer } from "@/components/beyond/LimitsExplorer";
import { LatencyBudget } from "@/components/beyond/LatencyBudget";
import { FeeClassifier } from "@/components/beyond/FeeClassifier";
import { Iniciacao } from "@/components/beyond/Iniciacao";

export const metadata = { title: "Beyond the basic Pix" };

const STATUS = [
  { name: "Pix Agendado recorrente", state: "live", note: "Mandatory for PSPs serving individuals (Res. BCB 402/425, 2024)." },
  { name: "Pix Automático", state: "live", note: "Since 16 Jun 2025. See chapter 12." },
  { name: "Pix por aproximação", state: "live", note: "Via JSR wallets since Feb 2025; native APDN/APES form since Res. BCB 482/2025; R$500 cap removed 1 Oct 2026 (IN 746); still Android-only (no iPhone NFC access yet)." },
  { name: "Pix Parcelado", state: "dropped", note: "BCB dropped the plan to regulate it on 4 Dec 2025 and banned the name; banks sell their own instalment credit." },
  { name: "Pix Garantido (Pix em Garantia)", state: "not launched", note: "No rules published as of Oct 2026; press reports point to 2027." },
  { name: "Cobrança híbrida (boleto + Pix)", state: "upcoming", note: "Instituted by Res. BCB 587 (18 Sep 2026), effective 1 Feb 2027; the same resolution allows Pix Automático from salary accounts from 1 Jul 2027." },
];

export default function Page() {
  return (
    <>
      <PageHeader n="14" title="Beyond the basic Pix" color={CHAPTER_COLOR.beyond}>
        Most Pix products are not new rails. They are the same pacs.008 with a different <span className="font-mono">Purp</span>, a different{" "}
        <span className="font-mono">LclInstrm</span> or a different channel. Cash withdrawal is <span className="font-mono">OTHR</span>, cash back is{" "}
        <span className="font-mono">GSCB</span>, a tap is <span className="font-mono">APDN</span>, a schedule is <span className="font-mono">PAGAGD</span>. What really
        differs is the rulebook around them: value limits by time of day and by device, how long a limit change takes, who may be charged, and how many seconds each
        hop may spend. This chapter puts those rules, as they stand in October 2026, into models you can push on.
      </PageHeader>

      <div id="saque-troco">
        <Section
          title="Pix Saque & Pix Troco: cash out through a Pix"
          concepts={["pix-saque", "pix-troco", "agente-de-saque"]}
          intro="The user pays the shop (or the facilitator) by Pix and gets banknotes. Build the transaction, and see the pacs.008 purpose codes, the amount breakdown, the IN 512 caps and who gets the operational-cost refund."
        >
          <SaqueTroco />
        </Section>
      </div>

      <div id="aproximacao">
        <Section
          title="Pix por aproximação: NFC is just another QR reader"
          concepts={["tap-to-pix", "jsr"]}
          intro={
            <>
              Two pieces. First, the <em>Jornada Sem Redirecionamento</em> enrollment that lets a wallet pay from your bank account with only a fingerprint. Second, the
              byte-level &quot;Tap to Pix&quot; protocol the terminal speaks, computed live from the Copia e Cola you type.
            </>
          }
        >
          <Aproximacao />
        </Section>
      </div>

      <div id="agendado">
        <Section
          title="Pix Agendado, recurring schedules and what didn't ship"
          concepts={["pix-agendado", "pix-parcelado-status"]}
          intro="A scheduled Pix is checked twice: against the daily Agendado limit when the payer confirms, and again, with the limit and balance in force, on the date it is sent. Add schedules and break them."
        >
          <div className="space-y-4">
            <Agendado />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {STATUS.map((s) => (
                <div key={s.name} className="rounded-lg border border-line bg-panel p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span
                      className={`rounded px-1.5 py-px font-mono text-[10.5px] ${s.state === "live" ? "bg-ok/15 text-ok" : s.state === "upcoming" ? "bg-info/15 text-info" : "bg-bad/15 text-bad"}`}
                    >
                      {s.state}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{s.note}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <div id="limits">
        <Section
          title="Limits & security rules: what the payer PSP must refuse"
          concepts={["pix-limits", "nighttime-limit", "limit-change-delay", "device-registration"]}
          intro="Pick the product, the time, the device and the amount. The payer PSP runs the checks in order: device cap, product-specific caps, then the independent per-period bucket. Below, how long each kind of limit change takes to apply."
        >
          <div className="space-y-4">
            <LimitsExplorer />
            <Callout tone="info">
              Since IN 669/2025 the BCB no longer ties limits to the TED limit: a PSP sets them by the user&apos;s risk profile (transaction history, relationship
              length, digital behaviour, authentication strength). It may set them to zero on request, or when it can&apos;t get the device&apos;s location. The fixed
              numbers that remain are the R$1,000 night default to individuals, the Saque/Troco caps and the new-device caps.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="tempos">
        <Section
          title="Manual de Tempos: a latency budget with owners"
          concepts={["manual-de-tempos", "pix-availability"]}
          intro="A Pix is five hops, each owned by someone with a percentile target. Tune the hops and the Monte-Carlo shows whether the payer-felt p50 ≤ 6 s and p99 ≤ 10 s still hold. Tails, not medians, break SLAs."
        >
          <LatencyBudget />
        </Section>
      </div>

      <div id="fees">
        <Section
          title="Fees: free for people, by presumption"
          concepts={["pix-fee-presumption", "no-interchange"]}
          intro="The Regulamento doesn't say 'free for individuals'. It classifies each Pix as a transfer or a purchase from facts the PSP can see, then says who may be charged for each."
        >
          <FeeClassifier />
        </Section>
      </div>

      <div id="open-finance">
        <Section
          title="Initiation by third parties: ITP, INIC and the TxId rules"
          concepts={["itp-iniciacao", "lclinstrm-inic"]}
          intro="An Open Finance initiator (ITP) can start a Pix in your bank account. The pacs.008 records that in InitgPty, and the formaDeIniciacao decides whether TxId is forbidden, optional or mandatory, and how long it must be."
        >
          <Iniciacao />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="t1">Saque, Troco, tap, schedule and initiation by third parties are codes on the same pacs.008 (<span className="font-mono">Purp</span>, <span className="font-mono">LclInstrm</span>, <span className="font-mono">SvcLvl</span>, <span className="font-mono">InitgPty</span>). Learn the codes and you can read any product.</Fragment>,
          <Fragment key="t2">Security is mostly asymmetric time: night caps, R$200 on a new phone, increases that take 24–48h while decreases are instant. A coerced user can&apos;t undo the protections quickly.</Fragment>,
          <Fragment key="t3">The SLA is percentiles per hop with named owners. A receiver PSP that stalls 1% of the time ruins the system-wide p99 without moving the median.</Fragment>,
        ]}
      />
      <ConceptList chapter={beyond} />
    </>
  );
}
