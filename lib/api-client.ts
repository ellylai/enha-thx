import type {
  CaseAnalysis,
  CaseFilters,
  CasesResponse,
  CourtCase,
  DocketSaveResponse,
  ExtractedFeaturesPayload,
} from "@/lib/types";

export async function fetchCases(filters: CaseFilters): Promise<CasesResponse> {
  const params = new URLSearchParams();

  const q = filters.q?.trim() ?? "";
  if (q) params.set("q", q);
  if (filters.court) params.set("court", filters.court);
  if (filters.docketNumber) params.set("docketNumber", filters.docketNumber);
  if (filters.natureOfSuit) params.set("natureOfSuit", filters.natureOfSuit);
  if (filters.dateFiledAfter)
    params.set("dateFiledAfter", filters.dateFiledAfter);
  if (filters.dateFiledBefore)
    params.set("dateFiledBefore", filters.dateFiledBefore);

  const response = await fetch(`/api/cases?${params.toString()}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Unable to load CourtListener cases");
  }

  return (await response.json()) as CasesResponse;
}

export async function generateSummary(input: {
  caseData: CourtCase & {
    case_metadata?: ExtractedFeaturesPayload["case_metadata"];
    entries?: ExtractedFeaturesPayload["entries"];
  };
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
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "Summary generation failed");
  }

  const data = (await response.json()) as { summary: string };
  return data.summary;
}

export async function analyzeCase(
  docketId: string,
  extractedData?: ExtractedFeaturesPayload | null,
): Promise<CaseAnalysis> {
  const response = await fetch("/api/case-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      extractedData ? { docketId, extractedData } : { docketId },
    ),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "Case analysis failed");
  }

  return (await response.json()) as CaseAnalysis;
}

export async function saveDocketForProcessing(
  docketId: string,
): Promise<DocketSaveResponse> {
  // NOTE: This function may be called from server contexts (e.g., during SSR),
  // so we ensure an absolute URL when window is undefined.
  const baseUrl =
    typeof window !== "undefined"
      ? ""
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

  const response = await fetch(
    `${baseUrl}/api/docket-details?docketId=${encodeURIComponent(docketId)}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      details?: string;
    } | null;

    throw new Error(
      payload?.error ??
        payload?.details ??
        "Failed to save docket for processing",
    );
  }

  return (await response.json()) as DocketSaveResponse;
}
