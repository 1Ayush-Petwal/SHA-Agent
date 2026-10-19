# Fixpoint frontend

Next.js 16 app: landing (`/`), chat (`/ask`), evals (`/evals`, `/evals/[id]`).

## Run

    pnpm install
    pnpm dev            # http://localhost:3000

`NEXT_PUBLIC_API_URL` points at the Fixpoint API (no trailing slash). Leave it unset to use the built-in mock at
`/api/mock`; the nav then shows a "Mock data" pill.

## Mock triggers

The example questions on `/ask` each reach a different answer type. Questions containing `mock replan`,
`mock unverified`, `mock truncated`, `mock error`, `mock drop` or `mock 429` reach the rest. Any admin token works
except `wrong`, which the mock rejects. A started eval run finishes after 15 seconds.

## Links

- `/ask?q=<question>` asks on arrival.
- `?theme=day|night` on any page overrides the clock-based theme.

## Checks

    pnpm test && pnpm lint && pnpm typecheck && pnpm build
