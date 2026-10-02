import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { contapi } from "@/content/contapi";

export const metadata = { title: "Conta PI & statements" };

export default function Page() {
  return (
    <>
      <PageHeader n="07" title="Conta PI & statements" color={CHAPTER_COLOR.contapi}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={contapi} />
    </>
  );
}
