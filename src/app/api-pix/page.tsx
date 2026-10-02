import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { api } from "@/content/api";

export const metadata = { title: "The API Pix" };

export default function Page() {
  return (
    <>
      <PageHeader n="11" title="The API Pix" color={CHAPTER_COLOR.api}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={api} />
    </>
  );
}
