import { FlagsControlCenter } from "@/features/flags/client";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl rounded-2xl p-4 sm:p-6 lg:p-8 app-shell">
        <header className="mb-8 border-b border-(--border-subtle) pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--text-muted)">
                Engineering Demo
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-(--text-primary) sm:text-3xl">
                Feature Flag Control Center
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-(--text-secondary) sm:text-base">
                Deterministic bucketing, rollout percentages, targeting rules, evaluation previews,
                and persisted flag configuration.
              </p>
            </div>
            <nav
              aria-label="Page sections"
              className="flex flex-wrap items-center gap-2 text-xs text-(--text-muted)"
            >
              <a
                href="#flag-create"
                className="rounded border border-(--border-default) px-2 py-1 hover:border-(--border-strong) hover:text-(--text-primary)"
              >
                Create
              </a>
              <a
                href="#flag-evaluate"
                className="rounded border border-(--border-default) px-2 py-1 hover:border-(--border-strong) hover:text-(--text-primary)"
              >
                Evaluate
              </a>
              <a
                href="#flag-list"
                className="rounded border border-(--border-default) px-2 py-1 hover:border-(--border-strong) hover:text-(--text-primary)"
              >
                Manage
              </a>
            </nav>
          </div>
        </header>

        <FlagsControlCenter />
      </div>
    </main>
  );
}
