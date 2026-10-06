import { FlagsControlCenter } from "@/features/flags/client";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] opacity-60">
            Engineering Demo
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Feature Flag Control Center
          </h1>
          <p className="mt-3 max-w-3xl opacity-70">
            Deterministic bucketing, rollout percentages, targeting rules,
            evaluation previews, and persisted flag configuration.
          </p>
        </header>

        <FlagsControlCenter />
      </div>
    </main>
  );
}
