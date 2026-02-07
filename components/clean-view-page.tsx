"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchCases, generateSummary } from "@/lib/api-client";
import type { CaseFilters, CourtCase } from "@/lib/types";

const defaultFilters: CaseFilters = {
  q: "",
  court: "",
  jurisdiction: "",
  filedAfter: "",
  filedBefore: "",
};

function formatDate(value?: string): string {
  if (!value) return "Not provided";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CleanViewPage() {
  const [filters, setFilters] = useState<CaseFilters>(defaultFilters);
  const [manualCaseId, setManualCaseId] = useState<string | null>(null);
  const [promptHint, setPromptHint] = useState(
    "Focus on procedural posture, obligations, and immediate risk.",
  );

  const casesQuery = useQuery({
    queryKey: ["courtlistener-cases", filters],
    queryFn: () => fetchCases(filters),
    placeholderData: (previous) => previous,
  });

  const activeCase = useMemo(() => {
    const results = casesQuery.data?.results ?? [];
    if (!results.length) return null;
    if (!manualCaseId) return results[0] ?? null;
    return results.find((item) => item.id === manualCaseId) ?? results[0] ?? null;
  }, [manualCaseId, casesQuery.data?.results]);

  const summaryMutation = useMutation({
    mutationFn: (input: { caseData: CourtCase; customPrompt: string }) =>
      generateSummary(input),
  });

  function onFilterChange<K extends keyof CaseFilters>(key: K, value: CaseFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--ink)] focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <header className="border-b border-[var(--line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4 lg:px-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              Clean View
            </p>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--ink)]">
              Court Case Intelligence
            </h1>
          </div>
          <div className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
            WCAG 2.1 AA-first UI
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[320px_minmax(0,1fr)_360px] lg:px-10"
      >
        <section
          aria-labelledby="search-filters"
          className="h-fit rounded-xl border border-[var(--line)] bg-white p-5 shadow-[var(--card-shadow)]"
        >
          <h2 id="search-filters" className="font-serif text-lg font-semibold text-[var(--ink)]">
            Search & Filters
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Narrow by phrase, court, jurisdiction, and filing date.
          </p>

          <form className="mt-4 space-y-4" onSubmit={(event) => event.preventDefault()}>
            <div>
              <label htmlFor="query" className="mb-1.5 block text-sm font-medium text-[var(--ink)]">
                Search filings
              </label>
              <input
                id="query"
                name="query"
                value={filters.q}
                onChange={(event) => onFilterChange("q", event.target.value)}
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                placeholder="e.g. order to show cause"
                aria-describedby="query-help"
              />
              <p id="query-help" className="mt-1 text-xs text-[var(--ink-muted)]">
                Matches case names and available docket metadata.
              </p>
            </div>

            <div>
              <label htmlFor="court" className="mb-1.5 block text-sm font-medium text-[var(--ink)]">
                Court
              </label>
              <input
                id="court"
                name="court"
                value={filters.court}
                onChange={(event) => onFilterChange("court", event.target.value)}
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                placeholder="ca9, dmn, nyed"
              />
            </div>

            <div>
              <label
                htmlFor="jurisdiction"
                className="mb-1.5 block text-sm font-medium text-[var(--ink)]"
              >
                Jurisdiction
              </label>
              <select
                id="jurisdiction"
                name="jurisdiction"
                value={filters.jurisdiction}
                onChange={(event) => onFilterChange("jurisdiction", event.target.value)}
                className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              >
                <option value="">All jurisdictions</option>
                <option value="federal">Federal</option>
                <option value="state">State</option>
                <option value="bankruptcy">Bankruptcy</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="filed-after"
                  className="mb-1.5 block text-sm font-medium text-[var(--ink)]"
                >
                  Filed after
                </label>
                <input
                  id="filed-after"
                  name="filed-after"
                  type="date"
                  value={filters.filedAfter}
                  onChange={(event) => onFilterChange("filedAfter", event.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
              </div>
              <div>
                <label
                  htmlFor="filed-before"
                  className="mb-1.5 block text-sm font-medium text-[var(--ink)]"
                >
                  Filed before
                </label>
                <input
                  id="filed-before"
                  name="filed-before"
                  type="date"
                  value={filters.filedBefore}
                  onChange={(event) => onFilterChange("filedBefore", event.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setFilters(defaultFilters)}
              className="w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
            >
              Reset filters
            </button>
          </form>
        </section>

        <section className="space-y-4" aria-labelledby="document-viewer">
          <h2 id="document-viewer" className="sr-only">
            Document viewer
          </h2>

          <div className="rounded-xl border border-[var(--line)] bg-white shadow-[var(--card-shadow)]">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-serif text-lg font-semibold text-[var(--ink)]">Search results</h3>
                <p className="text-xs text-[var(--ink-muted)]" aria-live="polite">
                  {casesQuery.isFetching
                    ? "Refreshing results..."
                    : `${casesQuery.data?.total ?? 0} cases loaded`}
                </p>
              </div>
            </div>

            <ul className="max-h-[300px] divide-y divide-[var(--line)] overflow-auto" aria-live="polite">
              {casesQuery.isLoading ? (
                <li className="px-5 py-6 text-sm text-[var(--ink-muted)]">Loading cases...</li>
              ) : null}

              {casesQuery.isError ? (
                <li className="px-5 py-6 text-sm text-[var(--danger)]">
                  Unable to load results from CourtListener.
                </li>
              ) : null}

              {!casesQuery.isLoading && !casesQuery.data?.results.length ? (
                <li className="px-5 py-6 text-sm text-[var(--ink-muted)]">
                  No matching cases found. Try fewer filters.
                </li>
              ) : null}

              {casesQuery.data?.results.map((item) => {
                const selected = item.id === activeCase?.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setManualCaseId(item.id)}
                      className={`w-full px-5 py-4 text-left outline-none transition ${
                        selected ? "bg-[var(--surface-soft)]" : "bg-white hover:bg-[var(--surface)]"
                      } focus:ring-2 focus:ring-inset focus:ring-[var(--accent-soft)]`}
                      aria-pressed={selected}
                    >
                      <p className="text-sm font-semibold text-[var(--ink)]">{item.caseName}</p>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">
                        {item.court} • Docket {item.docketNumber || "N/A"}
                      </p>
                      <p className="mt-2 text-sm text-[var(--ink-soft)]">{item.snippet}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <article className="rounded-xl border border-[var(--line)] bg-white shadow-[var(--card-shadow)]">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h3 className="font-serif text-lg font-semibold text-[var(--ink)]">Document viewer</h3>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Structured metadata and filing text in one reading pane.
              </p>
            </div>

            {activeCase ? (
              <div className="space-y-5 px-5 py-5">
                <dl className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Case</dt>
                    <dd className="mt-1 text-sm font-medium text-[var(--ink)]">{activeCase.caseName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Court</dt>
                    <dd className="mt-1 text-sm font-medium text-[var(--ink)]">{activeCase.court}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Filed</dt>
                    <dd className="mt-1 text-sm font-medium text-[var(--ink)]">
                      {formatDate(activeCase.dateFiled)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Status</dt>
                    <dd className="mt-1 text-sm font-medium text-[var(--ink)]">{activeCase.status ?? "N/A"}</dd>
                  </div>
                </dl>

                <section aria-labelledby="filing-content">
                  <h4 id="filing-content" className="text-sm font-semibold text-[var(--ink)]">
                    Filing text (cleaned)
                  </h4>
                  <p className="mt-2 rounded-lg border border-[var(--line)] bg-white p-4 text-sm leading-7 text-[var(--ink-soft)]">
                    {activeCase.plainText}
                  </p>
                </section>

                {activeCase.absoluteUrl ? (
                  <a
                    href={activeCase.absoluteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                  >
                    Open in CourtListener
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="px-5 py-8 text-sm text-[var(--ink-muted)]">
                Select a case to inspect filing details.
              </p>
            )}
          </article>
        </section>

        <aside
          aria-labelledby="summary-sidebar"
          className="h-fit rounded-xl border border-[var(--line)] bg-white p-5 shadow-[var(--card-shadow)]"
        >
          <h2 id="summary-sidebar" className="font-serif text-lg font-semibold text-[var(--ink)]">
            Summary Sidebar
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Generate plain-English legal summaries with explicit risk framing.
          </p>

          <div className="mt-4 space-y-3">
            <label htmlFor="summary-prompt" className="block text-sm font-medium text-[var(--ink)]">
              Summary focus
            </label>
            <textarea
              id="summary-prompt"
              value={promptHint}
              onChange={(event) => setPromptHint(event.target.value)}
              rows={4}
              className="w-full resize-y rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />

            <button
              type="button"
              disabled={!activeCase || summaryMutation.isPending}
              onClick={() => {
                if (!activeCase) return;
                summaryMutation.mutate({ caseData: activeCase, customPrompt: promptHint });
              }}
              className="w-full rounded-lg bg-[var(--ink)] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
            >
              {summaryMutation.isPending ? "Generating summary..." : "Generate plain-English summary"}
            </button>
          </div>

          <div
            className="mt-4 min-h-48 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
            aria-live="polite"
          >
            {summaryMutation.isError ? (
              <p className="text-sm text-[var(--danger)]">
                {(summaryMutation.error as Error).message}
              </p>
            ) : null}

            {summaryMutation.data ? (
              <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--ink-soft)]">
                {summaryMutation.data}
              </p>
            ) : (
              <p className="text-sm leading-7 text-[var(--ink-muted)]">
                Choose a case and run summary generation. The output emphasizes posture, obligations,
                deadlines, and compliance risk.
              </p>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
