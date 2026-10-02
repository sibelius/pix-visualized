import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { icom } from "@/content/icom";

export const metadata = { title: "ICOM: talking to the SPI" };

export default function Page() {
  return (
    <>
      <PageHeader n="08" title="ICOM: talking to the SPI" color={CHAPTER_COLOR.icom}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={icom} />
    </>
  );
}
