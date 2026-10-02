import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#171b24" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
      <rect width="32" height="32" fill="#171b24" />
      <path d="M16 5 L27 16 L16 27 L5 16 Z" fill="none" stroke="#32bcad" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M10.5 16h9.5m-3.2-3.4L20.2 16l-3.4 3.4" fill="none" stroke="#e7e9f0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="5" r="2" fill="#a78bfa" />
      <circle cx="16" cy="27" r="2" fill="#f5a524" />
    </svg>
      </div>
    ),
    size,
  );
}
