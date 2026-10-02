import { ogImage, OG_SIZE } from "@/lib/og";

export const alt = "Data-Intensive, visualized: interactive study companion to Designing Data-Intensive Applications";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage();
}
