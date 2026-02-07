import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";

const BASE_URL =
  process.env.COURTLISTENER_BASE_URL ??
  "https://www.courtlistener.com/api/rest/v4/";

/**
 * Fetches docket + entries from CourtListener and saves to data/ in the same
 * format as extracted_features.json (case_metadata + entries schema).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const docketId = searchParams.get("docketId");

  if (!docketId?.trim()) {
    return NextResponse.json(
      { error: "docketId parameter is required" },
      { status: 400 },
    );
  }

  const headers: HeadersInit = { Accept: "application/json" };
  if (process.env.COURTLISTENER_API_KEY) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_API_KEY}`;
  }

  try {
    const docketEntriesUrl = `${BASE_URL}docket-entries/?docket=${docketId}&page_size=50&ordering=entry_number`;
    const docketEntriesResponse = await fetch(docketEntriesUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!docketEntriesResponse.ok) {
      throw new Error(
        `Docket entries request failed (${docketEntriesResponse.status})`,
      );
    }

    const docketEntriesData = (await docketEntriesResponse.json()) as {
      results?: Array<{
        entry_number?: number | null;
        date_filed?: string | null;
        time_filed?: string | null;
        description?: string | null;
        recap_documents?: Array<{
          document_number?: number | null;
          description?: string | null;
          plain_text?: string | null;
          page_count?: number | null;
          is_available?: boolean | null;
        }>;
      }>;
    };

    const docketUrl = `${BASE_URL}dockets/${docketId}/`;
    const docketResponse = await fetch(docketUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    let docketInfo: {
      docket_number?: string | null;
      case_name?: string | null;
      date_filed?: string | null;
      date_terminated?: string | null;
      id?: number | null;
      nature_of_suit?: string | null;
      jurisdiction_type?: string | null;
      assigned_to_str?: string | null;
      assigned_to?: string | null;
      referred_to_str?: string | null;
      referred_to?: string | null;
    } | null = null;
    if (docketResponse.ok) {
      docketInfo = await docketResponse.json();
    }

    const dateFiled = docketInfo?.date_filed;
    const year =
      typeof dateFiled === "string" && dateFiled.length >= 4
        ? parseInt(dateFiled.slice(0, 4), 10) || null
        : null;

    const case_metadata = {
      case_number: docketInfo?.docket_number ?? null,
      case_name: docketInfo?.case_name ?? null,
      year,
      docket_id: docketInfo?.id ?? (Number(docketId) || null),
      nature_of_suit: docketInfo?.nature_of_suit ?? null,
      jurisdiction_type: docketInfo?.jurisdiction_type ?? null,
      assigned_to:
        docketInfo?.assigned_to_str ?? docketInfo?.assigned_to ?? null,
      referred_to:
        docketInfo?.referred_to_str ?? docketInfo?.referred_to ?? null,
      date_filed: docketInfo?.date_filed ?? null,
      date_terminated: docketInfo?.date_terminated ?? null,
    };

    const entries = (docketEntriesData.results ?? []).map((entry) => {
      const docs = entry.recap_documents ?? [];
      let chosen = docs.find((d) => d.is_available === true) ?? docs[0] ?? null;

      const docNum = chosen?.document_number;
      const document_number =
        docNum != null ? String(docNum) : null;

      return {
        entry_number: entry.entry_number ?? null,
        date_filed: entry.date_filed ?? null,
        time_filed: entry.time_filed ?? null,
        description: entry.description ?? null,
        document_number,
        document_description: chosen?.description ?? null,
        plain_text:
          chosen && typeof chosen.plain_text === "string"
            ? chosen.plain_text
            : null,
        page_count: chosen?.page_count ?? null,
        is_available: chosen?.is_available ?? null,
      };
    });

    // Same format as extracted_features.json (one case = one object with case_metadata + entries)
    const extractedData = {
      case_metadata,
      entries,
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `docket_${docketId}_${timestamp}.json`;
    const dataDir = join(process.cwd(), "data");
    const filePath = join(dataDir, filename);

    await writeFile(filePath, JSON.stringify(extractedData, null, 2));

    return NextResponse.json({
      success: true,
      message: `Docket saved to ${filename}`,
      docketId: docketId.trim(),
      caseName: case_metadata.case_name ?? undefined,
      totalEntries: entries.length,
      filename,
      extractedData,
    });
  } catch (error) {
    console.error("Docket details API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch and save docket details",
        details: error instanceof Error ? error.message : "Unknown error",
        docketId: docketId?.trim(),
      },
      { status: 500 },
    );
  }
}
