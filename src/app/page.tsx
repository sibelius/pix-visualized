import Link from "next/link";
import { CHAPTER_COLOR, NAV } from "@/components/shell/nav";
import { PixJourney } from "@/components/home/PixJourney";
import { CHAPTERS } from "@/content";

const PARTS = [
  {
    name: "I · The rails",
    blurb: "Who is in Pix and how a payment finds its destination: participants, the BCB's infrastructure, the BR Code in the QR, and the DICT key directory.",
  },
  {
    name: "II · Settlement (SPI)",
    blurb: "The ISO 20022 messages that actually move the money: pacs.008 out, pacs.002 back, pacs.004 to return, camt statements, all over the ICOM HTTP interface.",
  },
  {
    name: "III · Security",
    blurb: "Why the SPI trusts a message: every one is signed with XMLDSig and sent over mTLS on the private RSFN network, with ICP-Brasil certificates registered per ISPB.",
  },
  {
    name: "IV · Products",
    blurb: "What gets built on the rails: the API Pix for charges and webhooks, Pix Automático for recurring debits, MED for fraud, and Saque, Troco, NFC and limits.",
  },
];

const BIG = [
  { t: "Instant", d: "A Pix settles in seconds, end to end, and the payee PSP has to credit the customer right away. Each hop runs on a timeout budget." },
  { t: "Always on", d: "24 hours a day, 7 days a week, 365 days a year. Settlement is gross, one payment at a time, in central-bank money held in each participant's Conta PI." },
  { t: "Final", d: "Once the SPI settles a payment it cannot be reversed. A mistake or a fraud is undone with a new message going the other way: pacs.004." },
];

export default function Home() {
  const count = CHAPTERS.reduce((n, c) => n + c.concepts.length, 0);
  return (
    <div>
      <header className="max-w-3xl animate-rise">
        <div className="mb-3 font-mono text-xs text-accent">pix, visualized · spi · dict · iso 20022</div>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Five seconds, one QR code, a dozen messages.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted text-pretty">
          Pix is the Banco Central do Brasil&apos;s instant payment system. Billions of transfers a month run on it, and it
          looks simple: scan, confirm, done. Underneath is a stack of public specs: EMV TLV strings with a CRC16, a
          rate-limited key directory, signed ISO 20022 XML over mutual TLS on a private network, and a settlement engine
          moving central-bank money between accounts around the clock. Each of the fourteen chapters here is a page of
          working models you can push on: build a BR Code, drain a DICT token bucket, sign a pacs.008, let a payee time
          out, return a payment in three parts.
        </p>
      </header>

      <section className="mt-10 rounded-2xl border border-line bg-panel/50 p-4 sm:p-6">
        <div className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">The life of one Pix</div>
        <p className="mb-4 max-w-3xl text-sm text-faint">
          From the QR code to the credit in the payee&apos;s account: every hop a payment makes, the message it carries,
          and the chapter that opens it up.
        </p>
        <PixJourney />
      </section>

      <section className="mt-12 grid gap-3 md:grid-cols-3">
        {BIG.map((b) => (
          <div key={b.t} className="rounded-xl border border-line bg-panel p-5">
            <div className="font-mono text-xs text-accent">design constraint</div>
            <div className="mt-2 text-lg font-semibold">{b.t}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{b.d}</p>
          </div>
        ))}
      </section>

      {PARTS.map((part) => {
        const items = NAV.filter((n) => n.group === part.name);
        return (
          <section key={part.name} className="mt-12">
            <h2 className="text-xl font-semibold tracking-tight">{part.name}</h2>
            <p className="mt-1.5 mb-4 max-w-3xl text-[15px] text-muted">{part.blurb}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const ch = CHAPTERS.find((c) => c.href === item.href);
                const color = item.chapter ? CHAPTER_COLOR[item.chapter] : undefined;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group rounded-xl border border-line bg-panel p-5 transition hover:-translate-y-0.5 hover:border-faint"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs" style={{ color }}>
                        {item.n}
                        {ch && ch.concepts.length > 0 && <span className="ml-2 text-faint">{ch.concepts.length} concepts</span>}
                      </span>
                      <span className="text-faint transition group-hover:translate-x-0.5 group-hover:text-ink">→</span>
                    </div>
                    <div className="mt-3 font-medium">{item.label}</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                      {ch && ch.thesis !== "TODO" ? ch.thesis : item.blurb}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="mt-12">
        <Link href="/glossary" className="group block rounded-xl border border-line bg-panel p-5 transition hover:border-faint">
          <div className="font-mono text-xs text-accent">15 · reference</div>
          <div className="mt-2 font-medium">Glossary: {count || "all"} concepts, searchable →</div>
          <p className="mt-1 text-sm text-muted">Every acronym and message, in plain language, linked to its visualization.</p>
        </Link>
      </section>

      <p className="mt-12 max-w-3xl text-xs leading-relaxed text-faint">
        An independent study aid, not affiliated with or endorsed by the Banco Central do Brasil. Pix is a trademark of
        the BCB. Explanations are paraphrased from the BCB&apos;s public regulation, manuals and specs (github.com/bacen),
        which change often: check the current versions before you build on any detail here. All ISPBs, names, keys and
        documents in the examples are fictional.
      </p>
    </div>
  );
}
