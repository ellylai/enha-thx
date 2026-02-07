import type { CaseFilters, CasesResponse, CourtCase } from "@/lib/types";

export async function fetchCases(filters: CaseFilters): Promise<CasesResponse> {
  const params = new URLSearchParams();

  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.court) params.set("court", filters.court);
  if (filters.jurisdiction) params.set("jurisdiction", filters.jurisdiction);
  if (filters.filedAfter) params.set("filedAfter", filters.filedAfter);
  if (filters.filedBefore) params.set("filedBefore", filters.filedBefore);

  const response = await fetch(`/api/cases?${params.toString()}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Unable to load CourtListener cases");
  }

  return (await response.json()) as CasesResponse;
}

export async function generateSummary(input: {
  caseData: CourtCase;
  customPrompt: string;
}): Promise<string> {
  const response = await fetch("/api/summary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? "Summary generation failed");
  }

  const data = (await response.json()) as { summary: string };
  return data.summary;
}
