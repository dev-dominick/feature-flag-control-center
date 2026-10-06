# Feature Flag Control Center

A standalone feature-flag system built with Next.js, React, TypeScript, and PostgreSQL.

## Highlights

- Deterministic user bucketing
- Percentage-based rollouts
- Rule-based targeting
- Enable / disable controls
- Evaluation previews
- PostgreSQL-backed flag configuration
- Persisted evaluation history
- Zod validation
- Unit and component tests

## Architecture

The evaluation engine lives in `src/features/flags/utils`.

- `bucket.ts` provides deterministic bucketing
- `rules.ts` handles targeting-rule matching
- `evaluate.ts` combines targeting and percentage rollout behavior
- `server/service.ts` provides PostgreSQL persistence and evaluation recording
- `FlagsControlCenter.tsx` provides the interactive control-center UI

## Stack

Next.js 16, React 19, TypeScript, PostgreSQL, Tailwind CSS, Radix UI, Zod, Vitest, and Testing Library.

## Local setup

Create a PostgreSQL database named `feature_flag_control_center`, copy `.env.example` to `.env.local`, then apply:

1. `db/migrations/012_feature_flags.sql`
2. `db/migrations/015_feature_flags_archive.sql`
3. `db/migrations/016_e2e_source_column.sql`

Then run `pnpm install` and `pnpm dev`.

## Validation

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
