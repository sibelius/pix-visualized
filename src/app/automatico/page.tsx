import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { automatico } from "@/content/automatico";

export const metadata = { title: "Pix Automático" };

export default function Page() {
  return (
    <>
      <PageHeader n="12" title="Pix Automático" color={CHAPTER_COLOR.automatico}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={automatico} />
    </>
  );
}
