# Rove — Fashion Discovery & Deals Platform

Part 1: foundation + premium homepage shell.

## Stack

- Next.js 14 (App Router, JavaScript)
- Tailwind CSS (design tokens in `tailwind.config.js`)
- Self-hosted fonts via `@fontsource` (Fraunces + Inter) — no runtime Google
  Fonts call, so builds work offline and there's no third-party font request
  in production.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

```bash
npm run build   # production build
npm run start   # run the production build
```

See `MASTER-ARCHITECTURE.md` for the architecture doc and
`PHASE-1-CONTEXT.md` for what's implemented and what the next phase should
know.
