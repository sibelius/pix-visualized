import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { xmldsig } from "@/content/xmldsig";

export const metadata = { title: "XMLDSig signatures" };

export default function Page() {
  return (
    <>
      <PageHeader n="09" title="XMLDSig signatures" color={CHAPTER_COLOR.xmldsig}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={xmldsig} />
    </>
  );
}
