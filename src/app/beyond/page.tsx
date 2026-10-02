import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { beyond } from "@/content/beyond";

export const metadata = { title: "Beyond the basic Pix" };

export default function Page() {
  return (
    <>
      <PageHeader n="14" title="Beyond the basic Pix" color={CHAPTER_COLOR.beyond}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={beyond} />
    </>
  );
}
