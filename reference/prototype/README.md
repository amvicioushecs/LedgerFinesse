# Prototype (reference only)

The original Vite + React prototype from Google AI Studio (commit `e257f36`), moved here unchanged with `git mv` so its history is kept.

- **Logic reference:** `src/utils/auditEngine.ts` (ported to `src/lib/rules-engine/` with integer cents and verified rules only).
- **Visual reference:** `src/components/*` (to be ported to Next.js + shadcn/ui).
- **Sample data:** `src/data/sampleCases.ts`. Statute references inside it (e.g. Colorado § 38-12-105) are **unverified** and must not be used as citations.

This folder is not built, linted, type-checked or tested by the app (`tsconfig.json`, `eslint.config.mjs` and `vitest.config.mts` exclude it). Don't edit it; delete it once everything useful has been ported.
