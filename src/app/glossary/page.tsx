import { PageHeader } from "@/components/ui";
import { GlossaryBrowser } from "@/components/glossary/GlossaryBrowser";
import { CHAPTERS } from "@/content";

export const metadata = { title: "Glossary" };

export default function GlossaryPage() {
  const n = CHAPTERS.reduce((s, c) => s + c.concepts.length, 0);
  return (
    <>
      <PageHeader n="15" title="Glossary">
        Pix has an alphabet soup problem: SPI, DICT, ICOM, RSFN, ISPB, EndToEndId, pacs.008, camt.053, CertPIC, MED, JSR.
        Here are all {n} concepts from the fourteen chapters in one place, each defined in plain language and linked to the
        page where you can watch it work.
      </PageHeader>
      <GlossaryBrowser />
    </>
  );
}
