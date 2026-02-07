"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  analyzeCase,
  fetchCases,
  generateSummary,
  saveDocketForProcessing,
} from "@/lib/api-client";
import type {
  CaseFilters,
  CourtCase,
  ExtractedFeaturesPayload,
} from "@/lib/types";

const defaultFilters: CaseFilters = {
  q: "",
  court: "",
  docketNumber: "",
  natureOfSuit: "",
  dateFiledAfter: "",
  dateFiledBefore: "",
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

type StepCardProps = {
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

type Stage = "intro" | "search" | "select" | "review";

function StepCard({ step, title, description, children }: StepCardProps) {
  return (
    <section className="border-t-2 border-[var(--line)] pt-6">
      <div className="mb-5 flex items-start gap-4">
        <div className="border border-[var(--line)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          {step}
        </div>
        <div>
          <h2 className="font-serif text-3xl font-light tracking-[-0.01em] text-[var(--ink)]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function CleanViewPage() {
  const [stage, setStage] = useState<Stage>("intro");
  const [filters, setFilters] = useState<CaseFilters>(defaultFilters);
  const [searchFilters, setSearchFilters] =
    useState<CaseFilters>(defaultFilters);
  const [manualCaseId, setManualCaseId] = useState<string | null>(null);
  const [selectedDocketId, setSelectedDocketId] = useState<number | null>(null);
  const [isCaseConfirmed, setIsCaseConfirmed] = useState(false);
  const [confirmedCaseId, setConfirmedCaseId] = useState<string | null>(null);
  const [confirmedDocketId, setConfirmedDocketId] = useState<number | null>(
    null,
  );
  const [confirmedExtractedData, setConfirmedExtractedData] =
    useState<ExtractedFeaturesPayload | null>(null);
  const [promptHint, setPromptHint] = useState(
    "Focus on procedural posture, obligations, and immediate risk.",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSearchHelp, setShowSearchHelp] = useState(false);
  const [isSearchSubmitting, setIsSearchSubmitting] = useState(false);

  const queryClient = useQueryClient();

  const casesQuery = useQuery({
    queryKey: ["courtlistener-cases", searchFilters],
    queryFn: () => fetchCases(searchFilters),
    placeholderData: (previous) => previous,
    enabled: false,
  });

  const summaryMutation = useMutation({
    mutationFn: (input: { caseData: CourtCase; customPrompt: string }) =>
      generateSummary(input),
  });

  const analysisMutation = useMutation({
    mutationFn: (
      input:
        | string
        | { docketId: string; extractedData?: ExtractedFeaturesPayload },
    ) =>
      typeof input === "string"
        ? analyzeCase(input)
        : analyzeCase(input.docketId, input.extractedData),
  });

  const hasSearched =
    casesQuery.isFetched ||
    casesQuery.isFetching ||
    !!casesQuery.data ||
    !!casesQuery.error;

  const isSearchBusy = isSearchSubmitting || casesQuery.isFetching;

  const activeCase = useMemo(() => {
    if (!manualCaseId) return null;
    const results = casesQuery.data?.results ?? [];
    return results.find((item) => item.id === manualCaseId) ?? null;
  }, [manualCaseId, casesQuery.data?.results]);

  function onFilterChange<K extends keyof CaseFilters>(
    key: K,
    value: CaseFilters[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSearch() {
    if (isSearchBusy) return;

    const filtersToUse = { ...filters };
    setSearchFilters(filtersToUse);
    setStage("select");
    setManualCaseId(null);
    setSelectedDocketId(null);
    setIsCaseConfirmed(false);
    setConfirmedCaseId(null);
    setConfirmedDocketId(null);
    setConfirmedExtractedData(null);
    summaryMutation.reset();
    analysisMutation.reset();

    setIsSearchSubmitting(true);
    try {
      await queryClient.fetchQuery({
        queryKey: ["courtlistener-cases", filtersToUse],
        queryFn: () => fetchCases(filtersToUse),
      });
    } finally {
      setIsSearchSubmitting(false);
    }
  }

  function handleReset() {
    setStage("search");
    setFilters(defaultFilters);
    setSearchFilters(defaultFilters);
    setManualCaseId(null);
    setSelectedDocketId(null);
    setIsCaseConfirmed(false);
    setConfirmedCaseId(null);
    setConfirmedDocketId(null);
    setConfirmedExtractedData(null);
    setShowAdvanced(false);
    summaryMutation.reset();
    analysisMutation.reset();
  }

  function handleSelectCase(caseId: string, docketId?: number) {
    setStage("select");
    setManualCaseId(caseId);
    setSelectedDocketId(docketId ?? null);
    setIsCaseConfirmed(false);
    setConfirmedCaseId(null);
    setConfirmedDocketId(null);
    setConfirmedExtractedData(null);
    summaryMutation.reset();
    analysisMutation.reset();
    // Analysis will be triggered on confirmation, not selection
  }

  async function handleConfirmCaseSelection() {
    if (!manualCaseId || selectedDocketId === null) return;

    setStage("review");
    setIsCaseConfirmed(true);
    setConfirmedCaseId(manualCaseId);
    setConfirmedDocketId(selectedDocketId);
    void printConfirmedDocketIdToTerminal(selectedDocketId);

    const docketIdStr = String(selectedDocketId);

    try {
      const saveResult = await saveDocketForProcessing(docketIdStr);

      if (saveResult.extractedData) {
        setConfirmedExtractedData(saveResult.extractedData);
        void analysisMutation.mutateAsync({
          docketId: docketIdStr,
          extractedData: saveResult.extractedData,
        });
      } else {
        setConfirmedExtractedData(null);
        void analysisMutation.mutateAsync(docketIdStr);
      }
    } catch (err) {
      console.error("Failed to save docket for processing:", err);
      setConfirmedExtractedData(null);
      void analysisMutation.mutateAsync(docketIdStr);
    }
  }

  async function printConfirmedDocketIdToTerminal(
    docketId: number,
  ): Promise<void> {
    await fetch("/api/debug-docket", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ docketId }),
    });
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void handleSearch();
  }

  function handleStartCaseReview() {
    setStage("search");
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--ink)] focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              Clean View
            </p>
            <h1 className="font-serif text-5xl font-light tracking-[-0.03em] text-[var(--ink)]">
              Court Case Intelligence
            </h1>
          </div>
          {stage === "intro" ? (
            <div className="hidden border border-[var(--line)] px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--ink-muted)] sm:block">
              CourtListener Workflow
            </div>
          ) : (
            <div className="hidden border border-[var(--line)] px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--ink-muted)] sm:block">
              Step 1 Search • Step 2 Select • Step 3 Summarize
            </div>
          )}
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10"
      >
        {stage === "intro" ? (
          <>
            <section className="border-t-2 border-[var(--line)] pt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                Legal Ops Case Triage
              </p>
              <h2 className="mt-4 max-w-5xl font-serif text-6xl font-light leading-[0.92] tracking-[-0.03em] text-[var(--ink)] sm:text-7xl">
                Start with a case. End with a clear, risk-aware brief.
              </h2>
              <p className="mt-6 max-w-3xl text-sm leading-7 text-[var(--ink-soft)]">
                This workflow helps your team find federal dockets in
                CourtListener, confirm the right case, pass the docket ID to
                backend workflows, and generate a plain-English summary with
                risk signals.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleStartCaseReview}
                  className="rounded-lg bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                >
                  Start a case review
                </button>
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById("how-it-works")?.scrollIntoView({
                      behavior: "smooth",
                    })
                  }
                  className="rounded-lg border border-[var(--line-strong)] px-5 py-3 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                >
                  How it works
                </button>
              </div>
            </section>

            <section
              id="how-it-works"
              className="grid grid-cols-1 gap-8 border-t border-[var(--line)] pt-8 sm:grid-cols-3"
            >
              <article className="border-t border-[var(--line)] pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Step 1
                </p>
                <h3 className="mt-2 font-serif text-lg font-semibold text-[var(--ink)]">
                  Find a case
                </h3>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  Search by filing language first, then refine only if needed.
                </p>
              </article>

              <article className="border-t border-[var(--line)] pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Step 2
                </p>
                <h3 className="mt-2 font-serif text-lg font-semibold text-[var(--ink)]">
                  Confirm docket
                </h3>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  Select one case and confirm the docket ID before downstream
                  actions.
                </p>
              </article>

              <article className="border-t border-[var(--line)] pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Step 3
                </p>
                <h3 className="mt-2 font-serif text-lg font-semibold text-[var(--ink)]">
                  Generate summary
                </h3>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  Produce a plain-English brief with risk-aware context for
                  review.
                </p>
              </article>
            </section>
          </>
        ) : (
          <>
            <StepCard
              step="Step 1"
              title="Search cases"
              description="Start with one query. Open advanced filters only when needed."
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSearch();
                }}
                onKeyDown={handleSearchKeyDown}
                className="space-y-4"
                aria-busy={isSearchBusy}
              >
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex-1">
                    <div className="mb-1.5 flex items-center gap-2">
                      <label
                        htmlFor="query"
                        className="block text-sm font-medium text-[var(--ink)]"
                      >
                        Search filings
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowSearchHelp((prev) => !prev)}
                          aria-label="Search help"
                          aria-expanded={showSearchHelp}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line-strong)] text-xs font-semibold text-[var(--ink-muted)] transition hover:bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                        >
                          ?
                        </button>
                        {showSearchHelp ? (
                          <div className="absolute left-0 z-20 mt-2 w-80 rounded-xl border border-[var(--line)] bg-white p-3 text-xs text-[var(--ink-soft)] shadow-[var(--card-shadow)]">
                            <p className="font-semibold text-[var(--ink)]">
                              How to search well
                            </p>
                            <p className="mt-1">
                              Use plain phrases from filings, then narrow with
                              filters if needed.
                            </p>
                            <p className="mt-2">
                              Examples:{" "}
                              <span className="font-medium">
                                order to show cause
                              </span>
                              ,{" "}
                              <span className="font-medium">
                                motion for sanctions
                              </span>
                              ,{" "}
                              <span className="font-medium">
                                failure to comply
                              </span>
                              , <span className="font-medium">contempt</span>.
                            </p>
                            <p className="mt-2">
                              Tip: Start broad, confirm one case, then continue
                              to summary.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <input
                      id="query"
                      name="query"
                      value={filters.q}
                      onChange={(event) =>
                        onFilterChange("q", event.target.value)
                      }
                      disabled={isSearchBusy}
                      className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      placeholder="e.g. order to show cause"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={isSearchBusy}
                      className="w-full rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {isSearchBusy
                        ? "Searching court records..."
                        : "Search cases"}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isSearchBusy}
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  aria-expanded={showAdvanced}
                  aria-controls="advanced-filters"
                  className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                >
                  {showAdvanced ? "Hide advanced filters" : "Advanced filters"}
                </button>

                {showAdvanced ? (
                  <div
                    id="advanced-filters"
                    className="grid grid-cols-1 gap-3 border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-2"
                  >
                    <div>
                      <label
                        htmlFor="court"
                        className="mb-1.5 block text-sm font-medium text-[var(--ink)]"
                      >
                        Court
                      </label>
                      <input
                        id="court"
                        name="court"
                        value={filters.court}
                        onChange={(event) =>
                          onFilterChange("court", event.target.value)
                        }
                        disabled={isSearchBusy}
                        className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        placeholder="e.g. ca9, dmn"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="docket-number"
                        className="mb-1.5 block text-sm font-medium text-[var(--ink)]"
                      >
                        Docket number
                      </label>
                      <input
                        id="docket-number"
                        name="docket-number"
                        value={filters.docketNumber}
                        onChange={(event) =>
                          onFilterChange("docketNumber", event.target.value)
                        }
                        disabled={isSearchBusy}
                        className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        placeholder="e.g. 1:25-cv-00123"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="nature-of-suit"
                        className="mb-1.5 block text-sm font-medium text-[var(--ink)]"
                      >
                        Jurisdiction / nature of suit
                      </label>
                      <input
                        id="nature-of-suit"
                        name="nature-of-suit"
                        value={filters.natureOfSuit}
                        onChange={(event) =>
                          onFilterChange("natureOfSuit", event.target.value)
                        }
                        disabled={isSearchBusy}
                        className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        placeholder="e.g. 463 (habeas corpus)"
                      />
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
                          value={filters.dateFiledAfter}
                          onChange={(event) =>
                            onFilterChange("dateFiledAfter", event.target.value)
                          }
                          disabled={isSearchBusy}
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
                          value={filters.dateFiledBefore}
                          onChange={(event) =>
                            onFilterChange(
                              "dateFiledBefore",
                              event.target.value,
                            )
                          }
                          disabled={isSearchBusy}
                          className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isSearchBusy}
                  className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                >
                  Reset search
                </button>
              </form>
            </StepCard>

            {stage !== "search" ? (
              <StepCard
                step="Step 2"
                title="Select one case"
                description="Pick a case from results to inspect details before generating a summary."
              >
                {isSearchBusy ? (
                  <div
                    className="mb-4 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-4"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-0.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--ink)]"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink)]">
                          Search in progress
                        </p>
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">
                          We are querying CourtListener and preparing a ranked
                          case list for review.
                        </p>
                        <p className="mt-2 text-xs text-[var(--ink-muted)]">
                          Next: results will appear below, then select one case
                          to continue.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-[var(--line)] bg-white">
                  <div className="border-b border-[var(--line)] px-4 py-3">
                    <p
                      className="text-sm text-[var(--ink-muted)]"
                      aria-live="polite"
                    >
                      {isSearchBusy
                        ? "Searching CourtListener..."
                        : casesQuery.data?.total
                          ? `${casesQuery.data.total} cases found`
                          : "Run a search to load cases"}
                    </p>
                  </div>

                  <ul
                    className="max-h-[280px] divide-y divide-[var(--line)] overflow-auto"
                    aria-live="polite"
                  >
                    {casesQuery.isLoading ? (
                      <li className="px-4 py-5 text-sm text-[var(--ink-muted)]">
                        Loading cases...
                      </li>
                    ) : null}

                    {casesQuery.isError ? (
                      <li className="px-4 py-5 text-sm text-[var(--danger)]">
                        Unable to load results from CourtListener.
                      </li>
                    ) : null}

                    {hasSearched &&
                    !casesQuery.isFetching &&
                    !casesQuery.data?.results.length ? (
                      <li className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
                        No matching cases found. Adjust search or open advanced
                        filters.
                      </li>
                    ) : null}

                    {!hasSearched ? (
                      <li className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
                        Start with Step 1 and click Search cases.
                      </li>
                    ) : null}

                    {casesQuery.data?.results.map((item) => {
                      const isSelected = item.id === manualCaseId;

                      return (
                        <li key={item.id}>
                          <div
                            className={`w-full px-4 py-4 text-left transition ${
                              isSelected
                                ? "bg-[var(--surface-soft)]"
                                : "bg-white hover:bg-[var(--surface)]"
                            }`}
                          >
                            <p className="text-sm font-semibold text-[var(--ink)]">
                              {item.caseName || "Untitled case"}
                            </p>
                            <p className="mt-1 text-xs text-[var(--ink-muted)]">
                              {item.court || "Unknown Court"}
                              {item.docketNumber
                                ? ` • Docket ${item.docketNumber}`
                                : ""}
                              {item.dateFiled
                                ? ` • ${formatDate(item.dateFiled)}`
                                : ""}
                            </p>
                            <p className="mt-2 text-sm text-[var(--ink-soft)]">
                              {item.snippet || "No preview available."}
                            </p>
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() =>
                                  handleSelectCase(item.id, item.docketId)
                                }
                                aria-pressed={isSelected}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent-soft)] ${
                                  isSelected
                                    ? "bg-[var(--accent)] text-white"
                                    : "border border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                                }`}
                              >
                                {isSelected ? "Selected" : "Select this case"}
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="mt-5">
                  {activeCase ? (
                    <article className="mx-auto max-w-4xl border-2 border-[var(--accent)] bg-white p-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                        Selected Case
                      </p>
                      <h3 className="mt-2 font-serif text-2xl font-semibold text-[var(--ink)]">
                        {activeCase.caseName || "Untitled case"}
                      </h3>

                      <dl className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-[var(--line)] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                            Docket
                          </dt>
                          <dd className="mt-1 text-sm font-medium text-[var(--ink)]">
                            {activeCase.docketNumber || "N/A"}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                            Court
                          </dt>
                          <dd className="mt-1 text-sm font-medium text-[var(--ink)]">
                            {activeCase.absoluteUrl ? (
                              <a
                                href={activeCase.absoluteUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[var(--accent)] underline decoration-[var(--accent-soft)] underline-offset-2 hover:text-[var(--ink-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                              >
                                CourtListener
                              </a>
                            ) : (
                              activeCase.court || "N/A"
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                            Filed
                          </dt>
                          <dd className="mt-1 text-sm font-medium text-[var(--ink)]">
                            {formatDate(activeCase.dateFiled)}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                            Status
                          </dt>
                          <dd className="mt-1 text-sm font-medium text-[var(--ink)]">
                            {activeCase.status || "N/A"}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                            Docket ID
                          </dt>
                          <dd className="mt-1 text-sm font-medium text-[var(--ink)]">
                            {selectedDocketId ?? "N/A"}
                          </dd>
                        </div>
                      </dl>

                      {activeCase.absoluteUrl ? (
                        <a
                          href={activeCase.absoluteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                        >
                          Open in CourtListener
                        </a>
                      ) : null}

                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={handleConfirmCaseSelection}
                          disabled={
                            selectedDocketId === null ||
                            (isCaseConfirmed &&
                              confirmedCaseId === activeCase.id)
                          }
                          className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                        >
                          {isCaseConfirmed && confirmedCaseId === activeCase.id
                            ? "Case confirmed"
                            : "Confirm selected case"}
                        </button>

                        {selectedDocketId === null ? (
                          <p className="mt-2 text-xs text-[var(--ink-muted)]">
                            Confirm is available after case selection.
                          </p>
                        ) : null}
                      </div>
                    </article>
                  ) : hasSearched &&
                    (casesQuery.data?.results?.length ?? 0) > 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--ink-muted)]">
                      Select one case from the list above to continue to
                      summary.
                    </div>
                  ) : null}
                </div>
              </StepCard>
            ) : null}

            {stage === "review" &&
            activeCase &&
            isCaseConfirmed &&
            confirmedCaseId === activeCase.id ? (
              <StepCard
                step="Step 3"
                title="Read and summarize"
                description="Generate a plain-English summary only after confirming the selected case."
              >
                <div className="space-y-4">
                  {analysisMutation.data ? (
                    <section
                      className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
                      aria-label="Classifier output"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                        Classifier output
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span
                          className={`inline-block rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            analysisMutation.data.weakLabel === "HIGH_RISK"
                              ? "bg-red-100 text-red-800"
                              : analysisMutation.data.weakLabel ===
                                  "MEDIUM_RISK"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-green-100 text-green-800"
                          }`}
                        >
                          {analysisMutation.data.weakLabel.replace("_", " ")}
                        </span>
                        <span className="text-sm text-[var(--ink-soft)]">
                          Score:{" "}
                          {(
                            analysisMutation.data.noncomplianceScore * 100
                          ).toFixed(1)}
                          % · {analysisMutation.data.classifierSource}
                        </span>
                      </div>
                    </section>
                  ) : null}

                  <section
                    aria-labelledby="filing-content"
                    className="rounded-xl border border-[var(--line)] bg-white p-4"
                  >
                    <h4
                      id="filing-content"
                      className="text-sm font-semibold text-[var(--ink)]"
                    >
                      Filing text (cleaned)
                    </h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--ink-soft)]">
                      {analysisMutation.data?.plainText ??
                        activeCase.plainText ??
                        "No filing text available."}
                    </p>
                  </section>

                  <div>
                    <label
                      htmlFor="summary-prompt"
                      className="mb-1.5 block text-sm font-medium text-[var(--ink)]"
                    >
                      Summary focus
                    </label>
                    <textarea
                      id="summary-prompt"
                      value={promptHint}
                      onChange={(event) => setPromptHint(event.target.value)}
                      rows={4}
                      className="w-full resize-y rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={
                      summaryMutation.isPending || analysisMutation.isPending
                    }
                    onClick={() => {
                      const baseCaseData: Parameters<
                        typeof summaryMutation.mutate
                      >[0]["caseData"] = {
                        ...activeCase,
                        plainText:
                          analysisMutation.data?.plainText ??
                          activeCase.plainText,
                        docketId: confirmedDocketId ?? undefined,
                        noncomplianceScore:
                          analysisMutation.data?.noncomplianceScore ??
                          activeCase.noncomplianceScore,
                        weakLabel:
                          analysisMutation.data?.weakLabel ??
                          activeCase.weakLabel,
                      };

                      const caseData: any = { ...baseCaseData };

                      if (confirmedExtractedData) {
                        caseData.case_metadata =
                          confirmedExtractedData.case_metadata;
                        caseData.entries = confirmedExtractedData.entries;
                      }

                      summaryMutation.mutate({
                        caseData,
                        customPrompt: promptHint,
                      });
                    }}
                    className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                  >
                    {summaryMutation.isPending
                      ? "Generating summary..."
                      : "Generate plain-English summary"}
                  </button>

                  <div
                    className="min-h-48 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
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
                        The summary appears here after generation.
                      </p>
                    )}
                  </div>
                </div>
              </StepCard>
            ) : stage !== "search" && activeCase ? (
              <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--ink-muted)]">
                Confirm the selected case to continue to summary.
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
