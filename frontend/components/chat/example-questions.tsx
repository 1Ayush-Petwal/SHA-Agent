import { EXAMPLES } from "@/lib/examples";

export function ExampleQuestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mt-8">
      <p className="eyebrow">Try one</p>
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {EXAMPLES.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="h-full w-full rounded-lg border bg-card px-4 py-3 text-left text-sm shadow-soft transition hover:border-primary/40 hover:shadow-lifted"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
