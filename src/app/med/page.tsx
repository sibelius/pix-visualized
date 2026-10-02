import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { med } from "@/content/med";

export const metadata = { title: "MED & anti-fraud" };

export default function Page() {
  return (
    <>
      <PageHeader n="13" title="MED & anti-fraud" color={CHAPTER_COLOR.med}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={med} />
    </>
  );
}
