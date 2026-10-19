"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminButton } from "@/components/admin-button";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { IS_MOCK } from "@/lib/api";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/ask", label: "Ask" },
  { href: "/evals", label: "Evals" },
];

export function NavLinks() {
  const pathname = usePathname();
  return LINKS.map((l) => {
    const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "py-1.5 text-sm font-[550] text-muted-foreground transition-colors hover:text-foreground",
          active && "text-foreground shadow-[inset_0_-2px_0_var(--primary)]",
        )}
      >
        {l.label}
      </Link>
    );
  });
}

export function SiteNav({ links }: { links: React.ReactNode }) {
  return (
    <nav className="sticky top-0 z-40 -mx-4 mb-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <Brand />
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        {links}
        {IS_MOCK && (
          <span
            className="rounded-full border border-panel-border bg-panel px-2.5 py-0.5 text-xs font-semibold"
            title="NEXT_PUBLIC_API_URL is not set, so answers and eval runs are canned demo data"
          >
            Mock data
          </span>
        )}
        <AdminButton />
        <ThemeToggle />
      </div>
    </nav>
  );
}
