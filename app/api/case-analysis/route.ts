import { NextRequest, NextResponse } from "next/server";

type AnalysisResponse = {
  plainText: string;
  noncomplianceScore: number;
  weakLabel: "HIGH_RISK" | "MEDIUM_RISK" | "LOW_RISK";
  classifierSource: "external" | "heuristic";
  selectedDocketEntryId: string | null;
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
): Pick<AnalysisResponse, "noncomplianceScore" | "weakLabel"> {
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
    page_size: "100",
    ordering: "-date_filed",
  });

  const response = await fetch(
    `${BASE_URL}docket-entries/?${params.toString()}`,
    {
      method: "GET",
      headers,
      cache: "no-store",
    },
  );

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
): Promise<Pick<AnalysisResponse, "noncomplianceScore" | "weakLabel"> | null> {
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { docketId?: string };
    const docketId = body.docketId?.trim();

    if (!docketId) {
      return NextResponse.json(
        { error: "docketId is required" },
        { status: 400 },
      );
    }

    const docketData = await fetchDocketPlainText(docketId);

    const external = await externalClassifier(docketData.plainText);
    const prediction = external ?? heuristicClassifier(docketData.plainText);

    const response: AnalysisResponse = {
      plainText: docketData.plainText,
      noncomplianceScore: prediction.noncomplianceScore,
      weakLabel: prediction.weakLabel,
      classifierSource: external ? "external" : "heuristic",
      selectedDocketEntryId: docketData.selectedDocketEntryId,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
