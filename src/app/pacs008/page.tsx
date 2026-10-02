import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { spi } from "@/content/spi";

export const metadata = { title: "Payment: pacs.008 → pacs.002" };

export default function Page() {
  return (
    <>
      <PageHeader n="05" title="Payment: pacs.008 → pacs.002" color={CHAPTER_COLOR.spi}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={spi} />
    </>
  );
}
