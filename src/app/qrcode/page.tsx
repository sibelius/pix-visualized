import { PageHeader } from "@/components/ui";
import { ConceptList } from "@/components/ConceptList";
import { CHAPTER_COLOR } from "@/components/shell/nav";
import { qrcode } from "@/content/qrcode";

export const metadata = { title: "QR codes & BR Code" };

export default function Page() {
  return (
    <>
      <PageHeader n="02" title="QR codes & BR Code" color={CHAPTER_COLOR.qrcode}>
        Coming soon.
      </PageHeader>
      <ConceptList chapter={qrcode} />
    </>
  );
}
