import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { dict } from "@/content/dict";

export const metadata = { title: "DICT: the key directory" };

export default function Page() {
  return (
    <>
      <PageHeader n="03" title="DICT: the key directory" color={CHAPTER_COLOR.dict}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={dict} />
    </>
  );
}
