"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";
import { GitHubIcon } from "./GitHubIcon";

export function PageFooter() {
  const pathname = usePathname();
  const i = NAV.findIndex((n) =>
    n.href === "/" ? pathname === "/" : pathname.startsWith(n.href),
  );
  if (i < 0) return null;
  const prev = NAV[i - 1];
  const next = NAV[i + 1];
  return (
    <>
      <div className="mt-16 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
        {prev ? (
          <Link
            href={prev.href}
            className="rounded-xl border border-line bg-panel p-4 transition hover:border-faint"
          >
            <div className="text-xs text-faint">← Previous · {prev.n}</div>
            <div className="mt-1 font-medium">{prev.label}</div>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={next.href}
            className="rounded-xl border border-line bg-panel p-4 text-right transition hover:border-faint"
          >
            <div className="text-xs text-faint">Next · {next.n} →</div>
            <div className="mt-1 font-medium">{next.label}</div>
          </Link>
        )}
      </div>
      <a
        href="https://github.com/sibelius/pix-visualized"
        target="_blank"
        rel="noreferrer"
        className="mt-6 flex items-center justify-center gap-1.5 text-xs text-faint transition-colors hover:text-ink"
      >
        <GitHubIcon />
        Source on GitHub
      </a>
    </>
  );
}
