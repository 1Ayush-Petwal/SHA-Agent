import Link from "next/link";

/** A loop that returns to its own point: f(x) = x. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <g fill="none" stroke="var(--primary-foreground)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22.6 11.4A8 8 0 1 0 24 16" />
        <path d="M24.2 7.6v4.6h-4.6" />
      </g>
      <circle cx="16" cy="16" r="2.4" fill="var(--primary-foreground)" />
    </svg>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 text-base font-[680] tracking-[-0.01em] text-foreground">
      <LogoMark className="size-7" />
      Fixpoint
    </Link>
  );
}
