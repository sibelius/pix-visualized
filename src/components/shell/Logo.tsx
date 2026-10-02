/** A diamond (the instant-payment rail) with a transfer arrow through it, two participants at the tips. Mirrors app/icon.svg. */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#171b24" />
      <path d="M16 5 L27 16 L16 27 L5 16 Z" fill="none" stroke="#32bcad" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M10.5 16h9.5m-3.2-3.4L20.2 16l-3.4 3.4" fill="none" stroke="#e7e9f0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="5" r="2" fill="#a78bfa" />
      <circle cx="16" cy="27" r="2" fill="#f5a524" />
    </svg>
  );
}
