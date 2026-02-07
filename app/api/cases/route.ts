import { NextRequest, NextResponse } from "next/server";
import { fallbackCases } from "@/lib/fallback-cases";
import type { CasesResponse, CourtCase } from "@/lib/types";

const BASE_URL = process.env.COURTLISTENER_BASE_URL ?? "https://www.courtlistener.com/api/rest/v4/dockets/";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const court = searchParams.get("court") ?? "";
  const jurisdiction = searchParams.get("jurisdiction") ?? "";
  const filedAfter = searchParams.get("filedAfter") ?? "";
  const filedBefore = searchParams.get("filedBefore") ?? "";

  const params = new URLSearchParams();
  params.set("page_size", "20");
  if (q) params.set("search", q);
  if (court) params.set("court", court);
  if (jurisdiction) params.set("jurisdiction", jurisdiction);
  if (filedAfter) params.set("date_filed_after", filedAfter);
  if (filedBefore) params.set("date_filed_before", filedBefore);

  const headers: HeadersInit = { Accept: "application/json" };
  if (process.env.COURTLISTENER_API_KEY) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_API_KEY}`;
  }

  try {
    const upstream = await fetch(`${BASE_URL}?${params.toString()}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!upstream.ok) {
      throw new Error(`CourtListener request failed with status ${upstream.status}`);
    }

    const data = (await upstream.json()) as {
      count?: number;
      results?: Array<Record<string, unknown>>;
    };

    const results: CourtCase[] = (data.results ?? []).map((item) => {
      const caseName = String(item.case_name ?? item.short_name ?? "Untitled Case");
      const docketNumber = String(item.docket_number ?? "");
      const courtName = String(item.court ?? item.court_id ?? "Unknown Court");
      const textSnippet = String(item.snippet ?? item.summary ?? item.nature_of_suit ?? "No preview available.");
      const cleanedSnippet = textSnippet.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

      return {
        id: String(item.id ?? crypto.randomUUID()),
        caseName,
        docketNumber,
        court: courtName,
        jurisdiction: String(item.jurisdiction ?? jurisdiction ?? "unspecified"),
        dateFiled: String(item.date_filed ?? ""),
        status: String(item.case_status ?? ""),
        absoluteUrl: item.absolute_url
          ? `https://www.courtlistener.com${String(item.absolute_url)}`
          : undefined,
        snippet: cleanedSnippet || "No summary snippet available.",
        plainText:
          cleanedSnippet ||
          "Original filing text was not returned by this endpoint. Open the case in CourtListener for the full filing.",
      };
    });

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
