"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Controls, Panel, Segmented } from "@/components/ui";
import { XmlView, DICT_DOCS } from "./XmlView";
import { cnpjWithDv, cpfWithDv, fmtCnpj, maskCpf } from "./keys";

const PAYER_ISPB = "12345678";
const PAYER_PSP = "Banco Exemplo";
const PAYER_CPF = cpfWithDv("529982247");

type Stats = { settle: [number, number, number]; mule: [number, number, number]; scam: [number, number, number]; reporters: number; open: number; accounts: number };

type DirEntry = {
  id: string;
  label: string;
  key: string;
  keyType: string;
  ispb: string;
  psp: string;
  branch: string;
  account: string;
  accountType: string;
  opening: string;
  ownerType: "NATURAL_PERSON" | "LEGAL_PERSON";
  taxId: string;
  name: string;
  tradeName?: string;
  created: string;
  owned: string;
  openClaim?: string;
  stats: Stats;
};

const CLEAN: Stats = { settle: [214, 980, 3120], mule: [0, 0, 0], scam: [0, 0, 0], reporters: 0, open: 0, accounts: 1 };

const DIR: DirEntry[] = [
  {
    id: "phone",
    label: "+5511987654321 (person)",
    key: "+5511987654321",
    keyType: "PHONE",
    ispb: "99999011",
    psp: "Banco Fictício",
    branch: "0001",
    account: "0007654321",
    accountType: "CACC",
    opening: "2014-03-02T03:00:00Z",
    ownerType: "NATURAL_PERSON",
    taxId: cpfWithDv("777888999"),
    name: "Maria Aparecida Souza",
    created: "2020-11-16T13:02:11Z",
    owned: "2020-11-16T13:02:11Z",
    stats: { settle: [41, 160, 512], mule: [0, 0, 0], scam: [0, 0, 0], reporters: 0, open: 0, accounts: 1 },
  },
  {
    id: "merchant",
    label: "vendas@padaria… (company)",
    key: "vendas@padariatresirmaos.com.br",
    keyType: "EMAIL",
    ispb: "99999012",
    psp: "Cooperativa Exemplo",
    branch: "0042",
    account: "1029384756",
    accountType: "CACC",
    opening: "2018-07-19T03:00:00Z",
    ownerType: "LEGAL_PERSON",
    taxId: cnpjWithDv("112223330001"),
    name: "Padaria Tres Irmaos Ltda",
    tradeName: "Padaria 3 Irmãos",
    created: "2021-02-08T10:45:00Z",
    owned: "2021-02-08T10:45:00Z",
    stats: CLEAN,
  },
  {
    id: "fresh",
    label: "EVP on a 3-day-old account",
    key: "8d2c6f4a-1b7e-4c3a-9f5d-0e8a7b6c5d4e",
    keyType: "EVP",
    ispb: "99999013",
    psp: "Pagamentos Digitais IP",
    branch: "",
    account: "4400918",
    accountType: "TRAN",
    opening: "2026-09-29T03:00:00Z",
    ownerType: "NATURAL_PERSON",
    taxId: cpfWithDv("314159265"),
    name: "Carlos Eduardo Mendes",
    created: "2026-09-29T18:20:41Z",
    owned: "2026-09-29T18:20:41Z",
    openClaim: undefined,
    stats: { settle: [50, 50, 0], mule: [2, 2, 2], scam: [0, 0, 0], reporters: 2, open: 3, accounts: 4 },
  },
  {
    id: "claim",
    label: "CPF key under portability",
    key: cpfWithDv("271828182"),
    keyType: "CPF",
    ispb: "99999011",
    psp: "Banco Fictício",
    branch: "0003",
    account: "0000112233",
    accountType: "SVGS",
    opening: "2011-05-10T03:00:00Z",
    ownerType: "NATURAL_PERSON",
    taxId: cpfWithDv("271828182"),
    name: "Ana Beatriz Lima",
    created: "2020-10-05T09:00:00Z",
    owned: "2020-10-05T09:00:00Z",
    openClaim: "2026-09-30T15:12:09Z",
    stats: CLEAN,
  },
  {
    id: "book",
    label: "key held at your own PSP",
    key: "joao.pereira@example.com",
    keyType: "EMAIL",
    ispb: PAYER_ISPB,
    psp: PAYER_PSP,
    branch: "0001",
    account: "0005551234",
    accountType: "CACC",
    opening: "2019-01-10T03:00:00Z",
    ownerType: "NATURAL_PERSON",
    taxId: cpfWithDv("161803398"),
    name: "João Pereira",
    created: "2020-11-16T09:00:00Z",
    owned: "2020-11-16T09:00:00Z",
    stats: CLEAN,
  },
  {
    id: "missing",
    label: "unregistered phone",
    key: "+5521912340000",
    keyType: "PHONE",
    ispb: "",
    psp: "",
    branch: "",
    account: "",
    accountType: "",
    opening: "",
    ownerType: "NATURAL_PERSON",
    taxId: "",
    name: "",
    created: "",
    owned: "",
    stats: CLEAN,
  },
];

const ALNUM = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function e2e(n: number) {
  // E + ISPB(8) + yyyyMMddHHmm(12) + 11 alphanumerics = 32 chars
  let x = (n * 2654435761) >>> 0;
  let tail = "";
  for (let i = 0; i < 11; i++) {
    x = (Math.imul(x ^ (x >>> 15), 2246822507) + i * 97) >>> 0;
    tail += ALNUM[x % 62];
  }
  const minute = String(37 + (n % 20)).padStart(2, "0");
  return `E${PAYER_ISPB}2026100214${minute}${tail}`;
}

const w = (t: [number, number, number]) => `d90="${t[0]}" m12="${t[1]}" m60="${t[2]}"`;

function statsXml(s: Stats, ind: string) {
  const fm = (lbl: string) => `${ind}    <${lbl} ${lbl === "MuleAccounts" ? w(s.mule) : lbl === "ScammerAccounts" ? w(s.scam) : 'd90="0" m12="0" m60="0"'}/>`;
  return [
    `${ind}<Spi>`,
    `${ind}    <Watermark>2026-10-02T03:00:00.000Z</Watermark>`,
    `${ind}    <Settlements ${w(s.settle)}/>`,
    `${ind}</Spi>`,
    `${ind}<FraudMarkers>`,
    `${ind}    <Watermark>2026-10-02T03:00:00.000Z</Watermark>`,
    fm("ApplicationFrauds"),
    fm("MuleAccounts"),
    fm("ScammerAccounts"),
    fm("OtherFrauds"),
    fm("UnknownFrauds"),
    `${ind}    <TotalFraudTransactionAmount ${s.mule[0] ? 'd90="4870" m12="4870" m60="4870"' : 'd90="0" m12="0" m60="0"'}/>`,
    `${ind}    <DistinctFraudReporters d90="${s.reporters}" m12="${s.reporters}" m60="${s.reporters}"/>`,
    `${ind}</FraudMarkers>`,
    `${ind}<InfractionReports>`,
    `${ind}    <Watermark>2026-10-02T03:00:00.000Z</Watermark>`,
    `${ind}    <OpenReports>${s.open}</OpenReports>`,
    `${ind}    <OpenReportsDistinctReporters>${Math.min(s.open, 2)}</OpenReportsDistinctReporters>`,
    `${ind}    <RejectedReports d90="0" m12="0" m60="0"/>`,
    `${ind}</InfractionReports>`,
  ].join("\n");
}

function responseXml(e: DirEntry, withStats: boolean) {
  const acct = [
    `            <Participant>${e.ispb}</Participant>`,
    e.branch ? `            <Branch>${e.branch}</Branch>` : null,
    `            <AccountNumber>${e.account}</AccountNumber>`,
    `            <AccountType>${e.accountType}</AccountType>`,
    `            <OpeningDate>${e.opening}</OpeningDate>`,
  ].filter(Boolean);
  const owner = [
    `            <Type>${e.ownerType}</Type>`,
    `            <TaxIdNumber>${e.taxId}</TaxIdNumber>`,
    `            <Name>${e.name}</Name>`,
    e.tradeName ? `            <TradeName>${e.tradeName}</TradeName>` : null,
  ].filter(Boolean);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<GetEntryResponse>`,
    `    <Signature>…ds:SignedInfo, ds:SignatureValue…</Signature>`,
    `    <ResponseTime>2026-10-02T17:37:04.118Z</ResponseTime>`,
    `    <CorrelationId>5b1e0c2f9a7d43e8b6c1d2e3f4a5b6c7</CorrelationId>`,
    `    <Entry>`,
    `        <Key>${e.key}</Key>`,
    `        <KeyType>${e.keyType}</KeyType>`,
    `        <Account>`,
    ...acct,
    `        </Account>`,
    `        <Owner>`,
    ...owner,
    `        </Owner>`,
    `        <CreationDate>${e.created}</CreationDate>`,
    `        <KeyOwnershipDate>${e.owned}</KeyOwnershipDate>`,
    e.openClaim ? `        <OpenClaimCreationDate>${e.openClaim}</OpenClaimCreationDate>` : null,
    `    </Entry>`,
  ].filter(Boolean) as string[];
  if (withStats) {
    lines.push(`    <OwnerStatistics>`, statsXml(e.stats, "        "), `        <Entries>`, `            <RegisteredAccounts>${e.ownerType === "LEGAL_PERSON" ? 3 : 1}</RegisteredAccounts>`, `        </Entries>`, `    </OwnerStatistics>`);
    lines.push(`    <KeyStatistics>`, statsXml(e.stats, "        "), `        <Entries>`, `            <DistinctAccounts d90="${e.stats.accounts}" m12="${e.stats.accounts}" m60="${e.stats.accounts}"/>`, `        </Entries>`, `    </KeyStatistics>`);
  }
  lines.push(`</GetEntryResponse>`);
  return lines.join("\n");
}

const problem = (type: string, title: string, status: number, detail?: string) =>
  [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<problem xmlns="urn:ietf:rfc:7807">`,
    `    <type>https://dict.pi.rsfn.net.br/api/v2/error/${type}</type>`,
    `    <title>${title}</title>`,
    `    <status>${status}</status>`,
    detail ? `    <detail>${detail}</detail>` : null,
    `</problem>`,
  ]
    .filter(Boolean)
    .join("\n");

export function LookupFlow() {
  const [id, setId] = useState("phone");
  const [stats, setStats] = useState<"no" | "yes">("no");
  const [n, setN] = useState(1);
  const e = DIR.find((d) => d.id === id)!;
  const endToEnd = e2e(n);

  const status = e.id === "missing" ? 404 : e.id === "book" ? 400 : 200;
  const body =
    status === 404
      ? problem("NotFound", "Not found", 404, "Entry associated with given key does not exist")
      : status === 400
        ? problem("EntryCannotBeQueriedForBookTransfer", "Entry cannot be queried for book transfer", 400)
        : responseXml(e, stats === "yes");

  const req = [
    `GET /api/v2/entries/${encodeURIComponent(e.key)}${stats === "yes" ? "?IncludeStatistics=true" : ""} HTTP/1.1`,
    `Host: dict.pi.rsfn.net.br:16422`,
    `PI-RequestingParticipant: ${PAYER_ISPB}`,
    `PI-PayerId: ${PAYER_CPF}`,
    `PI-EndToEndId: ${endToEnd}`,
    `Accept: application/xml`,
    `Accept-Encoding: gzip`,
  ];
  const reqDocs: Record<number, string> = {
    0: "The key goes in the path, URL-encoded (+ becomes %2B). No request body and no signature on reads. The mTLS client certificate identifies the PSP.",
    2: "ISPB of the PSP asking (or the first 8 digits of the CNPJ for a payment initiator).",
    3: "CPF/CNPJ of the payer, in clear, digits only. The DICT keeps a token bucket per payer with this id: it must be the same id that will appear in the pacs.008.",
    4: "The EndToEndId the PSP will use in the pacs.008. When that payment settles, the DICT matches it to this lookup and refunds tokens.",
    6: "Responses can be large with statistics; gzip is supported for responses (not for requests).",
  };
  const [hl, setHl] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <Controls>
        <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
          key
          <select
            value={id}
            onChange={(ev) => setId(ev.target.value)}
            className="min-w-0 rounded-lg border border-line bg-bg px-2 py-1 font-mono text-xs text-ink"
          >
            {DIR.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <Segmented
          value={stats}
          onChange={setStats}
          options={[
            { value: "no", label: "IncludeStatistics=false" },
            { value: "yes", label: "IncludeStatistics=true" },
          ]}
        />
        <Button onClick={() => setN(n + 1)}>new EndToEndId</Button>
      </Controls>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Panel title="Request: payer PSP → DICT" right={<span className="font-mono text-xs text-muted">mTLS · RSFN</span>}>
            <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-[11.5px] leading-[1.6]">
              {req.map((l, i) => (
                <div
                  key={i}
                  onMouseEnter={() => setHl(i)}
                  className={clsx("-mx-3 px-3 whitespace-pre", reqDocs[i] && "cursor-help", hl === i && "bg-panel-2")}
                >
                  {l.includes(": ") && i > 0 ? (
                    <>
                      <span className="text-[#67e8f9]">{l.split(": ")[0]}</span>
                      <span className="text-faint">: </span>
                      <span className="text-ink">{l.split(": ").slice(1).join(": ")}</span>
                    </>
                  ) : (
                    <span className="text-ink">{l}</span>
                  )}
                </div>
              ))}
            </pre>
            <div className="mt-2 min-h-[3rem] text-xs leading-relaxed text-muted">
              {hl !== null && reqDocs[hl] ? reqDocs[hl] : <span className="text-faint">hover a header</span>}
            </div>
          </Panel>
          <Panel title="What the payer may see" right={<span className="font-mono text-xs text-muted">Manual DICT §8.1</span>}>
            {status === 200 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-bg p-4">
                  <div className="text-[11px] tracking-wide text-faint uppercase">Pay to</div>
                  <div className="mt-1 text-base font-semibold text-ink">{e.name}</div>
                  {e.tradeName && <div className="text-sm text-muted">{e.tradeName}</div>}
                  <div className="mt-2 font-mono text-sm text-muted">{e.ownerType === "NATURAL_PERSON" ? `CPF ${maskCpf(e.taxId)}` : `CNPJ ${fmtCnpj(e.taxId)}`}</div>
                  <div className="font-mono text-xs break-all text-faint">key {e.key}</div>
                  <div className="mt-1 text-xs text-faint">{e.psp} (optional)</div>
                </div>
                <ul className="space-y-1 text-xs text-muted">
                  <li className="text-faint">kept inside the PSP, never shown:</li>
                  {["ISPB", "Branch", "AccountNumber", "AccountType", "OpeningDate", "CreationDate", "KeyOwnershipDate", "Statistics"].map((f) => (
                    <li key={f} className="font-mono text-faint line-through decoration-bad/60">
                      {f}
                    </li>
                  ))}
                  <li className="pt-1">A CPF is masked to the middle six digits. A CNPJ is a company&apos;s public id and may be shown in full.</li>
                </ul>
              </div>
            ) : status === 404 ? (
              <p className="text-sm text-bad">&quot;Chave não encontrada&quot;. And this miss cost the payer 20 tokens and the PSP 3 (see the next section).</p>
            ) : (
              <p className="text-sm text-warn">
                Payer and receiver are both at {PAYER_PSP}: this is an internal book transfer. The PSP must resolve the key in its own database and
                must not query the DICT.
              </p>
            )}
          </Panel>
        </div>
        <Panel
          title={`Response: ${status} ${status === 200 ? "OK" : status === 404 ? "Not Found" : "Bad Request"}`}
          right={<span className="font-mono text-xs text-muted">{status === 200 ? "application/xml" : "application/problem+xml"}</span>}
        >
          <XmlView xml={body} docs={DICT_DOCS} maxHeight={560} highlight={e.openClaim ? ["OpenClaimCreationDate"] : e.id === "fresh" ? ["OpeningDate", "KeyOwnershipDate", "MuleAccounts", "OpenReports"] : []} />
          <p className="mt-2 text-xs text-faint">
            Try: pick the 3-day-old EVP with statistics on: the OpeningDate, the fresh KeyOwnershipDate and the MuleAccounts counters are what a
            payer PSP&apos;s risk engine reads before showing the confirmation screen. Then the key under portability: lookups still resolve to the
            old account, with OpenClaimCreationDate set.
          </p>
        </Panel>
      </div>
    </div>
  );
}
