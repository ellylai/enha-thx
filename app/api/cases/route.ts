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

    const results: CourtCase[] = (data.results ?? []).map((item) => {
      const textSnippet = String(
        item.snippet ?? item.summary ?? item.nature_of_suit ?? "No preview available.",
      );
      const cleanedSnippet = textSnippet.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

      return {
        id: String(item.id ?? crypto.randomUUID()),
        caseName: String(item.case_name ?? "Untitled"),
        docketNumber: String(item.docket_number ?? ""),
        court: String(item.court ?? "Unknown"),
        jurisdiction: String(item.jurisdiction ?? ""),
        dateFiled: String(item.date_filed ?? ""),
        status: String(item.status ?? ""),
        absoluteUrl: item.absolute_url
          ? String(item.absolute_url).startsWith("http")
            ? String(item.absolute_url)
            : `https://www.courtlistener.com${String(item.absolute_url)}`
          : undefined,
        snippet: cleanedSnippet || "No snippet",
        plainText: cleanedSnippet || "No text",
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
