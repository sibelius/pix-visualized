import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { returns } from "@/content/returns";

export const metadata = { title: "Returns: pacs.004" };

export default function Page() {
  return (
    <>
      <PageHeader n="06" title="Returns: pacs.004" color={CHAPTER_COLOR.returns}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={returns} />
    </>
  );
}
