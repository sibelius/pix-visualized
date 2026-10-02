import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { contapi } from "@/content/contapi";
import { LiquidityWeek } from "@/components/contapi/LiquidityWeek";
import { BalanceBlocking } from "@/components/contapi/BalanceBlocking";
import { StrTransfers } from "@/components/contapi/StrTransfers";
import { Remuneration } from "@/components/contapi/Remuneration";
import { CamtQueries } from "@/components/contapi/CamtQueries";
import { Reconciliation } from "@/components/contapi/Reconciliation";
import { AccountingDay } from "@/components/contapi/AccountingDay";
import { IndirectSim } from "@/components/contapi/IndirectSim";

export const metadata = { title: "Conta PI & statements" };

export default function Page() {
  return (
    <>
      <PageHeader n="07" title="Conta PI & statements" color={CHAPTER_COLOR.contapi}>
        A Pix is final the moment the SPI changes two balances at the Banco Central: the payer PSP&apos;s <em>Conta PI</em> goes down and the payee PSP&apos;s goes up.
        Nobody extends credit, so the money has to be there first. The catch is the calendar. Pix settles every minute of the year, but money can only enter or
        leave a Conta PI through the STR, which opens 06:30–18:30 on business days. This chapter covers how a PSP keeps its account funded across that gap, what the
        SPI tells you about your account (camt.060 queries answered by camt.052/053/054, which in the SPI do not mean what the ISO names suggest), how to reconcile
        your ledger against it, which date an entry is booked under, and what changes when you settle other institutions&apos; Pix too. Sources: Regulamento do SPI e
        da Conta PI (Res. BCB 195/2022, as amended through Res. BCB 554/2026), Regulamento do STR (Res. BCB 105), Catálogo de Mensagens do SPI 5.13.
      </PageHeader>

      <div id="liquidity-week">
        <Section
          title="A week in a Conta PI: 24/7 Pix, business-hours STR"
          concepts={["conta-pi", "prefunding", "liquidity-gap", "str"]}
          intro="A minute-by-minute simulation of one PSP's Conta PI over a week. Pix flows in and out continuously with an intraday profile. Treasury moves money in through the STR (LPI0001) at 06:30 and whenever the balance drops below 40% of target during STR hours. Before a closure, an automatic aporte configured with LPI0005 runs right after the regular STR close and loads the extra pre-funding. When available balance runs out, outgoing pacs.008 are rejected with AM04 (DS02 if they hit your operational floor)."
        >
          <LiquidityWeek />
        </Section>
      </div>

      <div id="balance-blocking" className="mt-12">
        <Section
          title="Available, blocked, and the 2026 circuit breaker"
          concepts={["saldo-bloqueado", "am04", "min-operational-limit"]}
          intro="Step through individual orders. When the SPI accepts a pacs.008 it blocks the amount (SABK). The receiver's pacs.002 then either settles it or releases it. A camt.060 balance query returns both parts. Since 30/03/2026 you can also set an operational floor and have the SPI block the whole account automatically when an order would breach it."
        >
          <BalanceBlocking />
          <div className="mt-4">
            <Callout tone="info">
              The automatic block (Res. BCB 554, art. 26-A) rejects every outgoing order that is still pending, but it does not stop incoming Pix, LPI aportes/retiradas or
              balance queries (art. 18 §5). Only an operator unblocking in the SPI module of SPB-Web releases it. Catálogo 5.13 (mandatory from 25/10/2026) adds reject code
              DS02 for orders refused by the operational floor or by the participant&apos;s own SPI-Web block; plain lack of funds stays AM04. Since 23/07/2026 the same
              SPI-Web module also holds the mandatory ICOM IP allowlist.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="str-transfers" className="mt-12">
        <Section
          title="Moving liquidity: the LPI messages and the STR clock"
          concepts={["lpi-messages", "aporte-window", "redesconto-spi", "str"]}
          intro="Liquidity does not move with an ISO 20022 SPI message. There is no pacs.009 or camt.050 in the SPI catalogue. It moves with STR messages of the LPI group, sent over the RSFN or through STR-Web, and only shows up in the SPI afterwards as a Conta PI entry. Pick a day, a time and a message and see what the STR does."
        >
          <StrTransfers />
        </Section>
      </div>

      <div id="remuneration" className="mt-12">
        <Section
          title="What idle money earns: Conta PI remuneration"
          concepts={["contapi-remuneration"]}
          intro="The balance at the close of the STR regular grade (before the aporte window) earns the Selic rate for one business day, up to a cap. Here is the exact formula with the regulation's rounding rules (8 decimals for partial results, 2 for the result), and the camt.053 the SPI sends when it credits it."
        >
          <Remuneration />
        </Section>
      </div>

      <div id="camt-queries" className="mt-12">
        <Section
          title="Asking the SPI: camt.060 → camt.053 / camt.052 / camt.054"
          concepts={["camt060", "camt053-spi", "camt052-rel", "camt054-entry"]}
          intro="Everything you can learn about your Conta PI starts with one signed camt.060 sent through the ICOM. The answer arrives asynchronously on your read stream. For the list of entries, the answer is a pointer: a file name that is the SHA-256 of a CSV you then download from the ARQ service."
        >
          <CamtQueries />
          <div className="mt-4">
            <Callout tone="accent">
              Do not map these onto textbook ISO 20022 cash management. In the SPI, camt.053 is a balance answer (SADP/SABK or remuneration), not an end-of-day
              statement. camt.052 is a file pointer, not an intraday report. camt.054 is the detail of one entry you asked for, not a push notification. Balance types
              are proprietary (SADP, SABK, PSSR, REMN, VSME, VVSR), and OPBD/CLBD do not appear.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="reconciliation" className="mt-12">
        <Section
          title="Reconciliation game: your ledger vs. what the SPI booked"
          concepts={["conta-pi-reconciliation", "camt052-rel"]}
          intro="Twelve rows of a REL file joined to a PSP ledger. Four have something wrong, planted from real failure modes: a pacs.002 you never consumed, a rejection you did not reverse, a redelivered message processed twice, an entry you never booked, a payment that never reached the SPI, a partial-return amount bug. Label each row, then check."
        >
          <Reconciliation />
        </Section>
      </div>

      <div id="accounting-day" className="mt-12">
        <Section
          title="Which day is it? The SPI accounting date"
          concepts={["data-contabil"]}
          intro="Messages carry UTC timestamps, Brasília is UTC−3, and the SPI books every settlement under an accounting date: the Brasília calendar date if it is a business day, otherwise the next business day. This uses the real October 2026 calendar, where Monday the 12th is a national holiday."
        >
          <AccountingDay />
          <div className="mt-4">
            <Callout tone="info">
              The queries use different calendars. A past-day closing balance (camt.060 CSA with FrDt) uses the Brasília calendar. A REL list uses the UTC calendar
              of the entries and covers at most 24 hours. Month-end accounting uses the data contábil. The catalogue also has an admi.004 example announcing a
              “mudança da data contábil” (accounting date change). Treat it as a notice and do not derive the date from it.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="indirect" className="mt-12">
        <Section
          title="Settling for others: indirect participants and the liquidante's exposure"
          concepts={["participante-indireto", "liquidante-spi"]}
          intro="An indirect participant has no Conta PI. Its Pix settle in its liquidante's account, against a position the indirect pre-funds at the liquidante. Below is a Saturday (no STR) with one liquidante and up to four indirects. At 14:00 indirect B starts sending far more than it receives, as in a bank run or a fraud drain."
        >
          <IndirectSim />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="t0">
            Treasury for a PSP comes down to one number: the pre-funding needed to get from Friday 19:00 to the next business day 06:30 without an AM04. It comes from
            the tail of your weekend net outflows, plus holidays, and is paid for partly by remuneration up to the cap.
          </Fragment>,
          <Fragment key="t1">
            In the SPI the camt messages are something you query. camt.053 returns balances (SADP/SABK), camt.052 returns a hashed file name on ARQ, and camt.054
            returns one entry. None of them is pushed to you, and none matches the ISO textbook meaning.
          </Fragment>,
          <Fragment key="t2">
            Reconcile on EndToEndId (+RtrId, +direction) against the REL file, and prove the file is complete with closing balances. Keep three dates per entry:
            UTC timestamp, Brasília date and data contábil.
          </Fragment>,
        ]}
      />
      <ConceptList chapter={contapi} />
    </>
  );
}
