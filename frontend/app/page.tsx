import { ArrowRight, Check, FileSearch, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { LiveStats } from "@/components/landing/live-stats";
import { MockWindow } from "@/components/landing/mock-window";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "#how", label: "How it heals" },
  { href: "#traps", label: "Traps" },
  { href: "/evals", label: "Evals" },
  { href: "#faq", label: "FAQ" },
];

const STEPS = [
  {
    icon: FileSearch,
    title: "Plans, then writes SQL",
    body: "Reads the question against a data dictionary that spells out every trap, picks the grain and the metrics, and reuses verified queries from similar past questions.",
  },
  {
    icon: ShieldCheck,
    title: "Checks the result",
    body: "A query that runs is not a query that is right. Deterministic checks catch duplicate rows from fan-out joins, impossible values, empty results and partial months.",
  },
  {
    icon: Wrench,
    title: "Repairs, or says so",
    body: "A failed run or check goes to a debugger: up to three repairs, the last on a stronger model. If nothing verifies, you see what was tried, never a silent guess.",
  },
];

const TRAPS = [
  ["customer_id is per order.", "Unique customers and repeat buyers need customer_unique_id."],
  ["Items and payments fan out joins.", "Aggregate to one row per order before joining them."],
  ["Reviews are not unique per order.", "Deduplicate before averaging review scores."],
  ["The first and last months are partial.", "A drop there is missing data, not a trend, and the answer says so."],
  ["Two categories have no English name.", "Fall back to the Portuguese name instead of dropping them."],
];

const FAQS = [
  ["Which data does it use?", "The public Olist Brazilian e-commerce dataset: 9 tables, 99,441 orders from September 2016 to October 2018."],
  ["Can it change the data?", "No. Every query runs in a read-only transaction with a 15-second timeout, and only one statement is allowed."],
  ["What happens when it can't answer?", "If the data can't answer, it says why and offers the closest question it can answer. If a question is ambiguous, it offers 2 to 3 concrete readings to pick from."],
  ["What do the evals measure?", "Execution accuracy on a hand-verified golden set, on the first try and after repair, with and without memory, plus cost per correct answer and latency. Every question links to its full trace."],
  ["Is there a limit?", "Yes: 10 questions per hour per visitor and 300 a day overall, so the public demo stays affordable."],
];

const h2 = "text-[clamp(1.7rem,3.5vw,2.3rem)] leading-tight font-[720] tracking-[-0.03em]";

export default function LandingPage() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Brand />
          <nav className="hidden items-center gap-6 md:flex">
            {SECTIONS.map((s) => (
              <a key={s.href} href={s.href} className="text-sm font-[550] text-muted-foreground hover:text-foreground">
                {s.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/ask" className={buttonVariants({ size: "lg" })}>
              Ask a question
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_70%)]"
          />
          <div className="relative mx-auto max-w-[1100px] px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs font-semibold shadow-soft sm:text-sm">
              <span className="size-1.5 rounded-full bg-primary" />
              Built on 99,441 real Olist marketplace orders
            </p>
            {/* Two lines, one per sentence, as in Café De; each balances its own wrap on narrow screens. */}
            <h1 className="mx-auto mt-7 text-[clamp(2.2rem,5.4vw,3.6rem)] leading-[1.06] font-[750] tracking-[-0.04em] text-balance">
              <span className="block">Ask your warehouse anything.</span>
              <span className="block text-primary">Get an answer that checked itself.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[58ch] text-base text-muted-foreground sm:text-lg">
              Fixpoint turns a plain-English question into SQL, runs it read-only, checks the result for the traps that
              make numbers quietly wrong, and repairs its own mistakes before you see an answer.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/ask" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
                Ask a question <ArrowRight data-icon="inline-end" />
              </Link>
              <Link href="/evals" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 bg-card px-5")}>
                See the evals
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["Shows its SQL", "Repairs its own mistakes", "Never a silent guess"].map((c) => (
                <li key={c} className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-primary" />
                  {c}
                </li>
              ))}
            </ul>
            <div className="mx-auto mt-14 max-w-[880px] text-left">
              <MockWindow />
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-y bg-card/60 py-20">
          <div className="reveal mx-auto max-w-[1100px] px-4 sm:px-6">
            <p className="eyebrow text-center">How it heals</p>
            <h2 className={cn(h2, "mt-3 text-center")}>Three ways it keeps an answer honest.</h2>
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="rounded-lg border bg-card p-6 shadow-soft">
                  <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 flex items-center gap-2 text-base">
                    <Icon className="size-4 text-primary" />
                    {title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="traps" className="scroll-mt-16 py-20">
          <div className="reveal mx-auto grid max-w-[1100px] gap-10 px-4 sm:px-6 md:grid-cols-[1fr_1.15fr] md:items-center">
            <div>
              <p className="eyebrow">Traps</p>
              <h2 className={cn(h2, "mt-3")}>The warehouse is full of traps. It knows them.</h2>
              <p className="mt-4 text-muted-foreground">
                These are what turn a confident dashboard number into a wrong one. Each is written into the data
                dictionary the agent plans with, and the checks catch the ones that slip through.
              </p>
              <p className="mt-4 text-muted-foreground">
                When a question is vague, like &ldquo;who are our best customers?&rdquo;, it asks which reading you mean.
                When the data can&apos;t answer, like profit margin with no cost data, it says so.
              </p>
            </div>
            <ul className="flex flex-col gap-2.5">
              {TRAPS.map(([trap, fix]) => (
                <li key={trap} className="flex gap-3 rounded-lg border bg-card px-4 py-3 shadow-soft">
                  <Check className="mt-1 size-4 shrink-0 text-primary" />
                  <span className="text-sm">
                    <span className="font-semibold">{trap}</span> <span className="text-muted-foreground">{fix}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <LiveStats />

        <section id="faq" className="scroll-mt-16 border-t bg-card/60 py-20">
          <div className="reveal mx-auto max-w-[760px] px-4 sm:px-6">
            <p className="eyebrow text-center">FAQ</p>
            <h2 className={cn(h2, "mt-3 text-center")}>Questions people ask first.</h2>
            <div className="mt-10 flex flex-col gap-2.5">
              {FAQS.map(([q, a]) => (
                <details key={q} className="group rounded-lg border bg-card px-5 py-4 shadow-soft">
                  <summary className="flex list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                    {q}
                    <span className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2.5 text-sm text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 text-center">
          <h2 className={h2}>Ask it something.</h2>
          <Link href="/ask" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 px-5")}>
            Ask a question <ArrowRight data-icon="inline-end" />
          </Link>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <Brand />
          <p>A self-healing data analyst. Data: Olist Brazilian E-Commerce (MIT).</p>
          <div className="flex gap-5">
            <Link href="/ask" className="hover:text-foreground">
              Ask
            </Link>
            <Link href="/evals" className="hover:text-foreground">
              Evals
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
