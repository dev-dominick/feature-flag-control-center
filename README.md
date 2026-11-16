# Feature Flag Control Center

Deterministic feature-flag infrastructure for rollout control, targeting, and evaluation history.

## Current status

This project is verified for local development and CI quality gates. There is no verified public deployment at `flags.dev-dominick.com` yet, and the project does not publish a live demo URL until DNS, routing, and health checks are confirmed.

## What it does

- Deterministic user bucketing using a stable hash for each flag + subject pair
- Percentage-based rollout checks with sticky assignment behavior
- Rule-based targeting using equality, contains, startsWith, and membership logic
- Enable/disable controls with persisted configuration
- Inline flag editing and description updates
- Evaluation previews and history capture for debugging rollout decisions
- Scalar evaluation context support for string, number, and boolean inputs
- PostgreSQL-backed persistence for flags, rules, and evaluation records

## Architecture

The core engine lives under `src/features/flags`.

- `src/features/flags/utils/bucket.ts` computes deterministic buckets using FNV-1a hashing
- `src/features/flags/utils/rules.ts` evaluates targeting rules against subject and context data
- `src/features/flags/utils/evaluate.ts` combines rule matching and rollout threshold checks
- `src/features/flags/server/service.ts` persists flags and records evaluation history in PostgreSQL
- `src/features/flags/components/FlagsControlCenter.tsx` provides the interactive admin control center

## Stack

Next.js 16, React 19, TypeScript, PostgreSQL, Tailwind CSS, Radix UI, Zod, Vitest, and Testing Library.

## Local setup

1. Create a PostgreSQL database for the app.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to a working local database connection.
3. Apply the schema migrations in `db/migrations`.
4. Install dependencies:
   `pnpm install`
5. Start the app:
   `pnpm dev`

Example schema flow:

- `db/migrations/012_feature_flags.sql`
- `db/migrations/015_feature_flags_archive.sql`
- `db/migrations/016_e2e_source_column.sql`

## Validation

Run the same checks used in CI:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Deployment status

The repository is in a verified local/CI-ready state. Production activation requires:

- verified DNS and HTTPS routing for the target hostname,
- confirmed runtime environment values,
- confirmed database role and schema access,
- health checks and acceptance tests against the deployed service.

No live demo link is published until those checks pass.
