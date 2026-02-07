import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";

const BASE_URL =
  process.env.COURTLISTENER_BASE_URL ??
  "https://www.courtlistener.com/api/rest/v4/";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const docketId = searchParams.get("docketId");

  if (!docketId) {
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
    // Get docket entries for the specific docket
    const docketEntriesUrl = `${BASE_URL}docket-entries/?docket=${docketId}&page_size=50&ordering=entry_number`;

    const docketEntriesResponse = await fetch(docketEntriesUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!docketEntriesResponse.ok) {
      throw new Error(
        `Docket entries request failed with status ${docketEntriesResponse.status}`,
      );
    }

    const docketEntriesData = await docketEntriesResponse.json();

    // Get basic docket information
    const docketUrl = `${BASE_URL}dockets/${docketId}/`;

    const docketResponse = await fetch(docketUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    let docketInfo = null;
    if (docketResponse.ok) {
      docketInfo = await docketResponse.json();
    }

    // Process and structure the response in extractFeatures format
    const caseMetadata = docketInfo
      ? {
          case_number: docketInfo.docket_number,
          case_name: docketInfo.case_name,
          year: docketInfo.date_filed
            ? parseInt(docketInfo.date_filed.substring(0, 4)) || null
            : null,
          docket_id: docketInfo.id,
          nature_of_suit: docketInfo.nature_of_suit,
          jurisdiction_type: docketInfo.jurisdiction_type,
          assigned_to: docketInfo.assigned_to_str || docketInfo.assigned_to,
          referred_to: docketInfo.referred_to_str || docketInfo.referred_to,
          date_filed: docketInfo.date_filed,
          date_terminated: docketInfo.date_terminated,
        }
      : {
          case_number: null,
          case_name: null,
          year: null,
          docket_id: docketId,
          nature_of_suit: null,
          jurisdiction_type: null,
          assigned_to: null,
          referred_to: null,
          date_filed: null,
          date_terminated: null,
        };

    const entries = (docketEntriesData.results ?? []).map((entry: any) => {
      const docs = entry.recap_documents || [];
      let chosenDoc = null;

      // Prefer an available document if any
      for (const doc of docs) {
        if (doc.is_available === true) {
          chosenDoc = doc;
          break;
        }
      }
      if (!chosenDoc && docs.length > 0) {
        chosenDoc = docs[0];
      }

      return {
        entry_number: entry.entry_number,
        date_filed: entry.date_filed,
        time_filed: entry.time_filed,
        description: entry.description,
        document_number: chosenDoc ? String(chosenDoc.document_number) : null,
        document_description: chosenDoc ? chosenDoc.description : null,
        plain_text:
          chosenDoc && typeof chosenDoc.plain_text === "string"
            ? chosenDoc.plain_text
            : null,
        page_count: chosenDoc ? chosenDoc.page_count : null,
        is_available: chosenDoc ? chosenDoc.is_available : null,
      };
    });

    // Structure data for ML processing (same format as extractFeatures.py)
    const extractedData = {
      case_metadata: caseMetadata,
      entries: entries,
    };

    // Save to data directory for ML processing
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `docket_${docketId}_${timestamp}.json`;
    const dataDir = join(process.cwd(), "data");
    const filePath = join(dataDir, filename);

    try {
      await writeFile(filePath, JSON.stringify(extractedData, null, 2));
      console.log(`\n=== DOCKET DATA SAVED ===`);
      console.log(`File: ${filename}`);
      console.log(
        `Docket: ${caseMetadata.case_name || "Unknown"} (${docketId})`,
      );
      console.log(`Total entries: ${entries.length}`);
      console.log(`Case metadata: ${JSON.stringify(caseMetadata, null, 2)}`);
      console.log(
        `Sample entry: ${entries[0] ? JSON.stringify(entries[0], null, 2) : "No entries"}`,
      );
      console.log("=== READY FOR ML PROCESSING ===");
    } catch (writeError) {
      console.error("Failed to save docket data:", writeError);
    }

    // Return minimal response for API confirmation
    return NextResponse.json({
      success: true,
      message: `Docket data saved to ${filename}`,
      docketId: docketId,
      caseName: caseMetadata.case_name,
      totalEntries: entries.length,
      filename: filename,
    });
  } catch (error) {
    console.log("Docket details API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch and save docket details",
        details: error instanceof Error ? error.message : "Unknown error",
        docketId: docketId,
      },
      { status: 500 },
    );
  }
}
