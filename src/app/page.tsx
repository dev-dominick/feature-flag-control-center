import { FlagsControlCenter } from "@/features/flags/client";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl app-shell p-4 sm:p-6 lg:p-8">
        <header className="mb-8 border-b border-(--border-subtle) pb-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="section-kicker">Engineering Demo</p>
              <h1 className="text-3xl font-semibold tracking-tight text-(--text-primary) sm:text-4xl">
                Feature Flag Control Center
              </h1>
              <p className="mt-3 text-sm text-(--text-secondary) sm:text-base">
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
                className="rounded-full border border-(--border-default) bg-(--surface-overlay)/70 px-3 py-1.5 hover:border-(--border-strong) hover:text-(--text-primary)"
              >
                Create
              </a>
              <a
                href="#flag-evaluate"
                className="rounded-full border border-(--border-default) bg-(--surface-overlay)/70 px-3 py-1.5 hover:border-(--border-strong) hover:text-(--text-primary)"
              >
                Evaluate
              </a>
              <a
                href="#flag-list"
                className="rounded-full border border-(--border-default) bg-(--surface-overlay)/70 px-3 py-1.5 hover:border-(--border-strong) hover:text-(--text-primary)"
              >
                Manage
              </a>
            </nav>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="app-panel p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-(--text-muted)">Bucket model</p>
              <p className="mt-2 text-sm font-medium text-(--text-primary)">Deterministic</p>
            </div>
            <div className="app-panel p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-(--text-muted)">Policy layer</p>
              <p className="mt-2 text-sm font-medium text-(--text-primary)">Rule-driven</p>
            </div>
            <div className="app-panel p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-(--text-muted)">Storage</p>
              <p className="mt-2 text-sm font-medium text-(--text-primary)">PostgreSQL</p>
            </div>
          </div>
        </header>

        <FlagsControlCenter />
      </div>
    </main>
  );
}
