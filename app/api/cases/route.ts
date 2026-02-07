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

  const params = new URLSearchParams();
  params.set("page_size", "20");
  if (q) params.set("search", q);
  if (court) params.set("court", court);
  if (docketNumber) params.set("docket_number__icontains", docketNumber);
  if (natureOfSuit) params.set("nature_of_suit__startswith", natureOfSuit);
  if (dateFiledAfter) params.set("date_filed__gte", dateFiledAfter);
  if (dateFiledBefore) params.set("date_filed__lte", dateFiledBefore);

  const headers: HeadersInit = { Accept: "application/json" };
  if (process.env.COURTLISTENER_API_KEY) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_API_KEY}`;
  }

  try {
    const upstream = await fetch(`${BASE_URL}dockets/?${params.toString()}`, {
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
        const docketNumber = String(item.docket_number ?? "");
        const caseName = String(item.case_name ?? "");
        // Extract judge if available in the CourtListener item structure
        const judgeName = String(item.assigned_to ?? "");
        const courtName = String(
          item.court ?? item.court_id ?? "Unknown Court",
        );
        const textSnippet = String(
          item.snippet ??
            item.summary ??
            item.nature_of_suit ??
            "No preview available.",
        );
        const cleanedSnippet = textSnippet
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        let mlResults = { score: 0, label: "UNKNOWN" };

        try {
          // Call the local Vercel Python API
          const classifierRes = await fetch(
            `${process.env.NEXT_PUBLIC_SITE_URL}/api/classify`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                case_number: docketNumber,
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
          console.error("Inference lookup failed", err);
        }

        return {
          id: String(item.id ?? crypto.randomUUID()),
          caseName: String(item.case_name ?? "Untitled"),
          docketNumber: String(item.docket_number ?? ""),
          court: String(item.court ?? "Unknown"), // Required
          jurisdiction: String(item.jurisdiction ?? ""), // Required
          dateFiled: String(item.date_filed ?? ""),
          status: String(item.status ?? ""),
          snippet: cleanedSnippet || "No snippet", // Required
          plainText: cleanedSnippet || "No text", // Required
          noncomplianceScore: mlResults.score,
          weakLabel: mlResults.label,
        };
      }),
    );

    const payload: CasesResponse = {
      results,
      total: Number(data.count ?? results.length),
      source: "live",
    };

    return NextResponse.json(payload);
  } catch {
    const fallbackPayload: CasesResponse = {
      results: fallbackCases,
      total: fallbackCases.length,
      source: "fallback",
    };
    return NextResponse.json(fallbackPayload);
  }
}
