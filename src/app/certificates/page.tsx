import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { certs } from "@/content/certs";

export const metadata = { title: "RSFN & certificates" };

export default function Page() {
  return (
    <>
      <PageHeader n="10" title="RSFN & certificates" color={CHAPTER_COLOR.certs}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={certs} />
    </>
  );
}
