"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Logo } from "./Logo";
import { CHAPTER_COLOR, NAV } from "./nav";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-panel/60 px-3 py-5 lg:flex">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold">Pix, visualized</div>
          <div className="text-xs text-muted">SPI · DICT · ISO 20022 · 14 chapters</div>
        </div>
      </Link>
      <nav className="flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map((item, i) => {
          const heading = i > 0 && NAV[i - 1].group !== item.group ? item.group : null;
          const active = isActive(pathname, item.href);
          const color = item.chapter ? CHAPTER_COLOR[item.chapter] : undefined;
          return (
            <div key={item.href}>
              {heading && (
                <div className="mt-4 mb-1 px-2 text-[10px] font-semibold tracking-widest text-faint uppercase">{heading}</div>
              )}
              <Link
                href={item.href}
                className={clsx(
                  "group flex gap-3 rounded-lg px-2 py-1.5 transition-colors",
                  active ? "bg-panel-2 text-ink" : "text-muted hover:bg-panel-2/60 hover:text-ink",
                )}
              >
                <span
                  className={clsx("mt-0.5 font-mono text-[11px]", !color && (active ? "text-accent" : "text-faint"))}
                  style={color ? { color: active ? color : undefined } : undefined}
                >
                  {item.n}
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-faint group-hover:text-muted">{item.blurb}</span>
                </span>
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="mt-auto px-2 pt-4 text-xs leading-relaxed text-faint">
        An unofficial, low-level tour of Pix built from the Banco Central do Brasil's public manuals and specs. Every diagram is a live model you can push on.
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line px-4 py-2 lg:hidden">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={clsx(
            "shrink-0 rounded-md px-2.5 py-1 text-xs",
            isActive(pathname, item.href) ? "bg-panel-2 text-ink" : "text-muted",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
