import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { iso } from "@/content/iso";

export const metadata = { title: "ISO 20022 anatomy" };

export default function Page() {
  return (
    <>
      <PageHeader n="04" title="ISO 20022 anatomy" color={CHAPTER_COLOR.iso}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={iso} />
    </>
  );
}
