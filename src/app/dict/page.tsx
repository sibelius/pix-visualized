import { Fragment } from "react";
import { Callout, PageHeader, Section, Takeaways } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { dict } from "@/content/dict";
import { KeyInspector } from "@/components/dict/KeyInspector";
import { LookupFlow } from "@/components/dict/LookupFlow";
import { RateLimitSim } from "@/components/dict/RateLimitSim";
import { ClaimSim } from "@/components/dict/ClaimSim";
import { SyncSim } from "@/components/dict/SyncSim";
import { StatsWindows } from "@/components/dict/StatsWindows";
import { CacheSim } from "@/components/dict/CacheSim";

export const metadata = { title: "DICT: the key directory" };

export default function Page() {
  return (
    <>
      <PageHeader n="03" title="DICT: the key directory" color={CHAPTER_COLOR.dict}>
        The <em>Diretório de Identificadores de Contas Transacionais</em> is the BCB-run directory that turns a Pix key into an account. It is a
        plain REST API over the RSFN with mutual TLS, XML bodies and XMLDSig-signed writes and responses (API DICT v2.12, base path{" "}
        <code className="font-mono text-sm">/api/v2/</code>). Every Pix sent by key starts with a <code className="font-mono text-sm">GET /entries/&#123;Key&#125;</code>.
        Around that one read sits a lot of machinery: token buckets that make enumeration expensive, claim workflows with legal deadlines, HMAC
        content ids that let hundreds of participants prove their copy of the directory matches, and anti-fraud counters shared by the whole system.
        Numbers below come from the API spec v2.12.1 and the Manual Operacional do DICT v8.5.
      </PageHeader>

      <div id="keys" className="scroll-mt-20">
        <Section
          title="Five key types, one normal form"
          concepts={["pix-key", "cpf-check-digits", "alphanumeric-cnpj", "evp-key", "key-limit"]}
          intro="A key is only useful if every PSP writes it identically. Type anything: the inspector detects the type, normalizes it the way the DICT stores it, and runs the real validations, including the mod-11 verifier digits of CPF and of the new alphanumeric CNPJ."
        >
          <KeyInspector />
        </Section>
      </div>

      <div id="lookup" className="scroll-mt-20">
        <Section
          title="The lookup: GET /entries/{Key}"
          concepts={["get-entry", "dict-entry", "payer-data-masking"]}
          intro="The payer's PSP sends three mandatory headers and gets back a signed entry. Hover the headers and the XML fields. Only a small subset may reach the payer's screen; the rest is for building the pacs.008 and for risk."
        >
          <LookupFlow />
        </Section>
      </div>

      <div id="ratelimit" className="scroll-mt-20">
        <Section
          title="Token buckets against enumeration"
          concepts={["antiscan-bucket", "participant-category", "read-attack"]}
          intro="The DICT keeps three buckets in play for every lookup: two per payer (keyed by PI-PayerId) and one per PSP. Misses are 20× more expensive than hits, and a payment that settles with the lookup's EndToEndId gives tokens back. This is the real policy, simulated second by second."
        >
          <RateLimitSim />
          <div className="mt-4">
            <Callout tone="info">
              The bucket rules reward exactly one behavior: look up, then pay. A lookup whose EndToEndId never shows up in a settled pacs.008 is a
              lookup the DICT assumes was reconnaissance. That is why <code className="font-mono text-sm">PI-EndToEndId</code> must be the id you
              will really use, and why <code className="font-mono text-sm">PI-PayerId</code> must be the payer&apos;s real CPF/CNPJ, never a pseudonym.
            </Callout>
          </div>
        </Section>
      </div>

      <div id="claims" className="scroll-mt-20">
        <Section
          title="Claims: portability and ownership"
          concepts={["key-portability", "ownership-claim", "claim-periods"]}
          intro="A key changes hands only through a claim, always opened by the PSP that wants it. Both flows share one state machine but have opposite defaults. Play donor and claimer, move the clock, and try the operations the DICT refuses."
        >
          <ClaimSim />
        </Section>
      </div>

      <div id="sync" className="scroll-mt-20">
        <Section
          title="Staying in sync: CIDs and the VSync"
          concepts={["dict-cid", "vsync"]}
          intro="Each PSP keeps its own copy of its keys. To check that copy without shipping it, both sides hash every entry into a CID and XOR all CIDs into one verifier. These are real HMAC-SHA256 computations in your browser; the self-test reproduces the CID from the API docs."
        >
          <SyncSim />
        </Section>
      </div>

      <div id="statistics" className="scroll-mt-20">
        <Section
          title="Anti-fraud statistics and their windows"
          concepts={["dict-statistics"]}
          intro="With IncludeStatistics=true (or getEntryStatistics / getPersonStatistics), the DICT returns counters aggregated over three windows. The windows are calendar-based in Brasília time, which is easy to get wrong; drag the query time and watch the boundaries move."
        >
          <StatsWindows />
        </Section>
      </div>

      <div id="cache" className="scroll-mt-20">
        <Section
          title="Caches, checkKeys and polling"
          concepts={["entry-cache", "check-keys"]}
          intro="The DICT is pull-only and rate-limited, so PSPs cache what they are allowed to and poll what they must. The rules are narrow: legal-person entries for 180 s, existence as a SHA-256 hash, nothing personal in clear."
        >
          <CacheSim />
        </Section>
      </div>

      <Takeaways
        items={[
          <Fragment key="t0">Normalize and validate keys locally (mod-11, E.164, lowercase e-mail, alphanumeric CNPJ) before touching the DICT: a typo costs the payer 20 tokens.</Fragment>,
          <Fragment key="t1">The anti-scan buckets only stay full for lookups that end in a settled payment with the same EndToEndId. Mirror the buckets in your PSP and watch VCD/EOS and the 404 ratio.</Fragment>,
          <Fragment key="t2">Claims are deadline machines: portability defaults to cancel, ownership defaults to confirm. CIDs and VSync let you prove your copy of the directory matches the DICT in 256 bits.</Fragment>,
        ]}
      />

      <ConceptList chapter={dict} />
    </>
  );
}
