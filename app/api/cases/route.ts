import { NextRequest, NextResponse } from "next/server";
import { fallbackCases } from "@/lib/fallback-cases";
import type { CasesResponse, CourtCase } from "@/lib/types";

const BASE_URL =
  process.env.COURTLISTENER_BASE_URL ??
  "https://www.courtlistener.com/api/rest/v4/";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const court = searchParams.get("court") ?? "";
  const docketNumber = searchParams.get("docketNumber") ?? "";
  const natureOfSuit = searchParams.get("natureOfSuit") ?? "";
  const dateFiledAfter = searchParams.get("dateFiledAfter") ?? "";
  const dateFiledBefore = searchParams.get("dateFiledBefore") ?? "";

  // Check if only general search is being used (no specific filters)
  const isGeneralSearchOnly =
    q &&
    !court &&
    !docketNumber &&
    !natureOfSuit &&
    !dateFiledAfter &&
    !dateFiledBefore;

  const params = new URLSearchParams();
  params.set("page_size", "20");

  let endpoint: string;

  if (isGeneralSearchOnly) {
    // Use search endpoint for general text search
    endpoint = "search/";
    params.set("q", q);
    params.set("type", "o"); // 'o' for opinions/dockets
  } else {
    // Use dockets endpoint for specific filters
    endpoint = "dockets/";
    if (q) params.set("search", q);
    if (court) params.set("court", court);
    if (docketNumber) params.set("docket_number__icontains", docketNumber);
    if (natureOfSuit) params.set("nature_of_suit__startswith", natureOfSuit);
    if (dateFiledAfter) params.set("date_filed__gte", dateFiledAfter);
    if (dateFiledBefore) params.set("date_filed__lte", dateFiledBefore);
  }

  const headers: HeadersInit = { Accept: "application/json" };
  if (process.env.COURTLISTENER_API_KEY) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_API_KEY}`;
  }

  try {
    const fullUrl = `${BASE_URL}${endpoint}?${params.toString()}`;

    const upstream = await fetch(fullUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!upstream.ok) {
      throw new Error(
        `CourtListener request failed with status ${upstream.status}`,
      );
    }

    const data = (await upstream.json()) as {
      count?: number;
      results?: Array<Record<string, unknown>>;
    };

    const results: CourtCase[] = await Promise.all(
      (data.results ?? []).map(async (item) => {
        let resolvedDocketNumber: string;
        let caseName: string;
        let judgeName: string;
        let courtName: string;
        let textSnippet: string;
        let dateFiled: string;
        let status: string;

        if (isGeneralSearchOnly) {
          // Handle search endpoint response format
          resolvedDocketNumber = String(item.docketNumber ?? item.docket_number ?? "");
          caseName = String(item.caseName ?? item.case_name ?? item.title ?? "");
          judgeName = String(item.assignedTo ?? item.assigned_to ?? "");
          courtName = String(item.court ?? item.court_id ?? "Unknown Court");
          textSnippet = String(
            item.text ?? item.snippet ?? item.summary ?? "No preview available.",
          );
          dateFiled = String(item.dateFiled ?? item.date_filed ?? "");
          status = String(item.status ?? "");
        } else {
          // Handle dockets endpoint response format
          resolvedDocketNumber = String(item.docket_number ?? "");
          caseName = String(item.case_name ?? "");
          judgeName = String(item.assigned_to ?? "");
          courtName = String(item.court ?? item.court_id ?? "Unknown Court");
          textSnippet = String(
            item.snippet ?? item.summary ?? item.nature_of_suit ?? "No preview available.",
          );
          dateFiled = String(item.date_filed ?? "");
          status = String(item.status ?? "");
        }

        const cleanedSnippet = textSnippet
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        const absoluteUrl = item.absolute_url
          ? String(item.absolute_url).startsWith("http")
            ? String(item.absolute_url)
            : `https://www.courtlistener.com${String(item.absolute_url)}`
          : undefined;

        let mlResults = { score: 0, label: "UNKNOWN" };

        try {
          // Call the local Vercel Python API
          const classifierRes = await fetch(
            `${process.env.NEXT_PUBLIC_SITE_URL}/api/classify`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                case_number: resolvedDocketNumber,
                case_name: caseName,
                judge: judgeName,
              }),
            },
          );

          if (classifierRes.ok) {
            const mlData = await classifierRes.json();

            if (mlData.status === "success" && mlData.results.length > 0) {
              mlResults = {
                score: mlData.results[0].noncomplianceScore,
                label: mlData.results[0].weakLabel,
              };
            }
          }
        } catch (err) {
          console.error("ML classification failed:", err);
        }

        const numericDocketIdCandidate =
          item.id ?? item.docket_id ?? item.docketId ?? null;
        const docketId =
          typeof numericDocketIdCandidate === "number"
            ? numericDocketIdCandidate
            : Number.isFinite(Number(numericDocketIdCandidate))
              ? Number(numericDocketIdCandidate)
              : undefined;

        return {
          id: String(item.id ?? crypto.randomUUID()),
          caseName: caseName || "Untitled",
          docketNumber: resolvedDocketNumber || "",
          court: courtName || "Unknown",
          jurisdiction: String(item.jurisdiction ?? ""),
          dateFiled: dateFiled || "",
          status: status || "",
          absoluteUrl,
          snippet: cleanedSnippet || "No snippet",
          plainText: cleanedSnippet || "No text",
          noncomplianceScore: mlResults.score,
          weakLabel: mlResults.label,
          docketId,
        };
      }),
    );

    const payload: CasesResponse = {
      results,
      total: Number(data.count ?? results.length),
      source: "live",
    };

    console.log(
      `\n=== FINAL API RESPONSE (${endpoint.slice(0, -1)} endpoint) ===`,
    );
    console.log("Processed results count:", results.length);
    console.log("Total available:", payload.total);
    console.log(
      "Sample processed case:",
      results[0] ? JSON.stringify(results[0], null, 2) : "No processed results",
    );
    console.log("=== END API CALL ===");

    return NextResponse.json(payload);
  } catch (error) {
    console.log("API Error - using fallback data:", error);

    const fallbackPayload: CasesResponse = {
      results: fallbackCases,
      total: fallbackCases.length,
      source: "fallback",
    };
    return NextResponse.json(fallbackPayload);
  }
}
