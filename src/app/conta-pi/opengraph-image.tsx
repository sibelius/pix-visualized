import { ogImage, OG_SIZE } from "@/lib/og";
import { NAV } from "@/components/shell/nav";

export const alt = `${NAV.find((n) => n.chapter === "contapi")!.label} · Pix, visualized`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage("contapi");
}
