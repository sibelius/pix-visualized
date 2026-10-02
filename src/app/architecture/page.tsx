import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { architecture } from "@/content/architecture";

export const metadata = { title: "The architecture of Pix" };

export default function Page() {
  return (
    <>
      <PageHeader n="01" title="The architecture of Pix" color={CHAPTER_COLOR.architecture}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={architecture} />
    </>
  );
}
