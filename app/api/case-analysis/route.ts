import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";

type AnalysisResponse = {
  plainText: string;
  noncomplianceScore: number;
  weakLabel: "HIGH_RISK" | "MEDIUM_RISK" | "LOW_RISK";
  classifierSource: "external" | "heuristic";
  selectedDocketEntryId: string | null;
  rawDocketEntries?: {
    filename: string;
    totalEntries: number;
  };
  extractedFeatures?: {
    filename: string;
    totalEntries: number;
    caseName: string | null;
  };
};

const BASE_URL =
  process.env.COURTLISTENER_BASE_URL ??
  "https://www.courtlistener.com/api/rest/v4/";

const problematicPhrases = [
  /held in contempt/gi,
  /sanctions? (?:are |were )?imposed/gi,
  /willful(?:ly)? (?:violated?|failed)/gi,
  /failure to comply/gi,
  /not in compliance/gi,
  /contempt of (?:this )?court/gi,
  /violation of (?:the )?court'?s order/gi,
  /order to show cause/gi,
  /motion for (?:order to )?show cause/gi,
  /failed to (?:timely )?release/gi,
  /did not (?:timely )?comply/gi,
  /non-?compliance/gi,
  /show cause why .* should not be sanctioned/gi,
];

function countMatches(regex: RegExp, text: string): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function heuristicClassifier(
  text: string,
): Omit<AnalysisResponse, "plainText" | "classifierSource"> {
  const lower = text.toLowerCase();
  let raw = 0;

  for (const pattern of problematicPhrases) {
    const hits = countMatches(pattern, lower);
    if (!hits) continue;
    const severe = /(contempt|sanction|willful|violation)/i.test(
      pattern.source,
    );
    raw += hits * (severe ? 25 : 10);
  }

  const normalized = Math.min(raw / 200, 1);
  const weakLabel: AnalysisResponse["weakLabel"] =
    normalized >= 0.6
      ? "HIGH_RISK"
      : normalized >= 0.2
        ? "MEDIUM_RISK"
        : "LOW_RISK";

  return {
    noncomplianceScore: normalized,
    weakLabel,
  };
}

function collectPlainText(value: unknown, output: string[]): void {
  if (!value) return;

  if (typeof value === "string") {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (cleaned.length > 40) output.push(cleaned);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectPlainText(item, output);
    return;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.plain_text === "string") {
      collectPlainText(record.plain_text, output);
    }
    if (typeof record.description === "string") {
      collectPlainText(record.description, output);
    }
    for (const nestedValue of Object.values(record)) {
      if (nestedValue && typeof nestedValue === "object") {
        collectPlainText(nestedValue, output);
      }
    }
  }
}

async function fetchDocketPlainText(docketId: string): Promise<{
  plainText: string;
  selectedDocketEntryId: string | null;
}> {
  const headers: HeadersInit = { Accept: "application/json" };
  if (process.env.COURTLISTENER_API_KEY) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_API_KEY}`;
  }

  const params = new URLSearchParams({
    docket: docketId,
    ordering: "-date_filed",
  });

  const fullUrl = `${BASE_URL}docket-entries/?${params.toString()}`;
  console.log(`[fetchDocketPlainText] API Call: ${fullUrl}`);

  const response = await fetch(fullUrl, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `CourtListener docket-entry fetch failed (${response.status})`,
    );
  }

  const data = (await response.json()) as {
    results?: Array<Record<string, unknown>>;
  };

  const entries = data.results ?? [];
  const selectedDocketEntryId =
    entries.length > 0 && entries[0]?.id != null ? String(entries[0].id) : null;

  const chunks: string[] = [];
  for (const entry of entries) {
    collectPlainText(entry, chunks);
  }

  const deduped = Array.from(new Set(chunks));
  const fullText = deduped.join("\n\n").trim();
  if (!fullText) {
    throw new Error(
      "No plain_text available from CourtListener docket entries",
    );
  }

  return {
    plainText: fullText.slice(0, 12000),
    selectedDocketEntryId,
  };
}

async function externalClassifier(
  text: string,
): Promise<Omit<AnalysisResponse, "plainText" | "classifierSource"> | null> {
  const url = process.env.CLASSIFIER_API_URL;
  if (!url) return null;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    cache: "no-store",
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    noncomplianceScore?: number;
    weakLabel?: string;
  };

  if (typeof payload.noncomplianceScore !== "number") return null;

  const weakLabel: AnalysisResponse["weakLabel"] =
    payload.weakLabel === "HIGH_RISK" ||
    payload.weakLabel === "MEDIUM_RISK" ||
    payload.weakLabel === "LOW_RISK"
      ? payload.weakLabel
      : payload.noncomplianceScore >= 0.6
        ? "HIGH_RISK"
        : payload.noncomplianceScore >= 0.2
          ? "MEDIUM_RISK"
          : "LOW_RISK";

  return {
    noncomplianceScore: Math.max(0, Math.min(payload.noncomplianceScore, 1)),
    weakLabel,
  };
}

async function saveRawDocketEntries(docketId: string) {
  const headers: HeadersInit = { Accept: "application/json" };
  if (process.env.COURTLISTENER_API_KEY) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_API_KEY}`;
  }

  const params = new URLSearchParams({
    docket: docketId,
    ordering: "-date_filed",
  });

  const fullUrl = `${BASE_URL}docket-entries/?${params.toString()}`;
  console.log(`[saveRawDocketEntries] API Call: ${fullUrl}`);

  const response = await fetch(fullUrl, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `CourtListener docket-entries fetch failed (${response.status})`,
    );
  }

  const rawData = await response.json();

  // Save the complete raw JSON response
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `raw_docket_entries_${docketId}_${timestamp}.json`;
  const dataDir = join(process.cwd(), "data");
  const filePath = join(dataDir, filename);

  await writeFile(filePath, JSON.stringify(rawData, null, 2));

  console.log(`[raw-docket-entries-saved] ${filename}`);

  return {
    filename,
    totalEntries: rawData.results?.length || 0,
    rawData,
  };
}

async function generateExtractedFeatures(docketId: string) {
  const headers: HeadersInit = { Accept: "application/json" };
  if (process.env.COURTLISTENER_API_KEY) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_API_KEY}`;
  }

  // Get docket entries for the specific docket
  const docketEntriesParams = new URLSearchParams({
    docket: docketId,
    ordering: "-date_filed",
  });

  const docketEntriesUrl = `${BASE_URL}docket-entries/?${docketEntriesParams.toString()}`;
  console.log(`[generateExtractedFeatures] Docket Entries API Call: ${docketEntriesUrl}`);

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
  
  console.log(`[generateExtractedFeatures] Response results count: ${(docketEntriesData.results ?? []).length}`);
  if (docketEntriesData.results && docketEntriesData.results.length > 0) {
    console.log(`[generateExtractedFeatures] Sample entry:`, JSON.stringify(docketEntriesData.results[0], null, 2));
  }

  // Get basic docket information
  const docketUrl = `${BASE_URL}dockets/${docketId}/`;
  console.log(`[generateExtractedFeatures] Docket API Call: ${docketUrl}`);

  const docketResponse = await fetch(docketUrl, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  let docketInfo = null;
  if (docketResponse.ok) {
    docketInfo = await docketResponse.json();
  }

  // Process and structure the case metadata
  const caseMetadata = docketInfo
    ? {
        case_number: docketInfo.docket_number,
        case_name: docketInfo.case_name,
        year: docketInfo.date_filed
          ? parseInt(docketInfo.date_filed.substring(0, 4)) || null
          : null,
        docket_id: parseInt(docketId),
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
        docket_id: parseInt(docketId),
        nature_of_suit: null,
        jurisdiction_type: null,
        assigned_to: null,
        referred_to: null,
        date_filed: null,
        date_terminated: null,
      };

  // Process docket entries in extracted_features format
  const entries = (docketEntriesData.results ?? [])
    .map((entry: any) => {
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

      const extractedEntry = {
        entry_number: entry.entry_number,
        date_filed: entry.date_filed,
        time_filed: entry.time_filed,
        description: entry.description,
        document_number: chosenDoc ? String(chosenDoc.document_number) : "",
        document_description: chosenDoc ? chosenDoc.description : "",
        plain_text:
          chosenDoc && typeof chosenDoc.plain_text === "string"
            ? chosenDoc.plain_text
            : "",
        page_count: chosenDoc ? chosenDoc.page_count : null,
        is_available: chosenDoc ? chosenDoc.is_available : false,
      };
      
      return extractedEntry;
    })
    .sort((a, b) => {
      // Sort by entry_number (ascending), handle nulls by putting them at the end
      if (a.entry_number === null && b.entry_number === null) return 0;
      if (a.entry_number === null) return 1;
      if (b.entry_number === null) return -1;
      return a.entry_number - b.entry_number;
    });

  // Structure data in extracted_features format (as array to match reference format)
  const extractedFeatures = [
    {
      case_metadata: caseMetadata,
      entries: entries,
    },
  ];

  // Save to data directory with extracted_features filename format
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `extracted_features_${docketId}_${timestamp}.json`;
  const dataDir = join(process.cwd(), "data");
  const filePath = join(dataDir, filename);

  await writeFile(filePath, JSON.stringify(extractedFeatures, null, 2));

  console.log(`[extracted-features-saved] ${filename}`);

  return {
    filename,
    totalEntries: entries.length,
    caseMetadata,
  };
}

/** Build plain text from extracted_features entries for the ML classifier. */
function plainTextFromExtractedEntries(entries: Array<{ description?: string | null; plain_text?: string | null }>): string {
  const parts = entries
    .map((e) => [e.description, e.plain_text].filter(Boolean).join(" "))
    .filter(Boolean);
  return parts.join("\n\n").trim().slice(0, 12000) || "";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      docketId?: string;
      extractedData?: {
        case_metadata?: { case_name?: string | null };
        entries?: Array<{
          description?: string | null;
          plain_text?: string | null;
          entry_number?: number | null;
        }>;
      };
    };
    const docketId = body.docketId?.trim();
    const extractedDataFromClient = body.extractedData;

    if (!docketId) {
      return NextResponse.json(
        { error: "docketId is required" },
        { status: 400 },
      );
    }

    let extractedFeatures: AnalysisResponse["extractedFeatures"] = undefined;
    let docketData: { plainText: string; selectedDocketEntryId: string | null } = {
      plainText: "",
      selectedDocketEntryId: null,
    };

    if (extractedDataFromClient?.entries?.length) {
      // Use saved JSON (from docket-details) for ML classifier
      docketData.plainText = plainTextFromExtractedEntries(extractedDataFromClient.entries);
      extractedFeatures = {
        filename: "(from confirmed docket)",
        totalEntries: extractedDataFromClient.entries.length,
        caseName: extractedDataFromClient.case_metadata?.case_name ?? null,
      };
      console.log(
        `✓ Using extractedData for classification (${extractedDataFromClient.entries.length} entries)`,
      );
    } else {
      // Generate extracted features and fetch plain text from CourtListener
      try {
        const extractedData = await generateExtractedFeatures(docketId);
        extractedFeatures = {
          filename: extractedData.filename || "",
          totalEntries: extractedData.totalEntries || 0,
          caseName: extractedData.caseMetadata.case_name || null,
        };
        console.log(
          `✓ Generated extracted_features: ${extractedFeatures.filename}`,
        );
      } catch (error) {
        console.warn(
          "Failed to generate extracted features during analysis:",
          error,
        );
      }

      try {
        docketData = await fetchDocketPlainText(docketId);
      } catch (error) {
        const analysisError =
          error instanceof Error ? error.message : "Failed to fetch plain text";
        console.warn(
          "Plain text not available, using empty text for analysis:",
          analysisError,
        );
      }
    }

    const external = await externalClassifier(docketData.plainText);
    const prediction = external ?? heuristicClassifier(docketData.plainText);

    let rawDocketEntries: AnalysisResponse["rawDocketEntries"] = undefined;
    if (!extractedDataFromClient?.entries?.length) {
      try {
        const rawData = await saveRawDocketEntries(docketId);
        rawDocketEntries = {
          filename: rawData.filename || "",
          totalEntries: rawData.totalEntries || 0,
        };
      } catch (error) {
        console.warn("Failed to save raw docket entries during analysis:", error);
      }
    }

    const response: AnalysisResponse = {
      plainText: docketData.plainText,
      noncomplianceScore: prediction.noncomplianceScore,
      weakLabel: prediction.weakLabel,
      classifierSource: external ? "external" : "heuristic",
      selectedDocketEntryId: docketData.selectedDocketEntryId,
      rawDocketEntries,
      extractedFeatures,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
