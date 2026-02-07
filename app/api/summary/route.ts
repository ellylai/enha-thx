import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // 1. Change to GEMINI_API_KEY to match backend
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "GEMINI_API_KEY is missing. Add it to your environment.",
      },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    caseData?: {
      caseName?: string;
      case_name?: string;
      court?: string;
      docketNumber?: string;
      case_number?: string;
      dateFiled?: string;
      date_filed?: string;
      plainText?: string;
      snippet?: string;
      text_descriptions?: string;
      // Fields for the Python-style approach
      docket_entries?: Array<{
        description: string;
        document_number?: string;
        filing_date?: string;
        entry_number?: string;
        pacer_sequence_number?: string;
      }>;
      // Extracted_features format (from docket-details saved JSON)
      case_metadata?: {
        case_number?: string | null;
        case_name?: string | null;
        date_filed?: string | null;
      };
      entries?: Array<{
        description?: string | null;
        document_number?: string | null;
        date_filed?: string | null;
        entry_number?: number | null;
        plain_text?: string | null;
      }>;
      parties?: Array<{
        name: string;
        role: string;
      }>;
      filing_parties?: string[];
      filing_date?: string;
      file_url?: string;
    };
    customPrompt?: string;
  };

  if (!body.caseData) {
    return NextResponse.json({ error: "Missing case payload" }, { status: 400 });
  }

  const customPrompt = body.customPrompt?.trim();
  const caseData = body.caseData;
  
  let userPrompt: string;
  let systemPrompt: string;
  
  // Check if we have docket entries data (Python-style or extracted_features format)
  const hasTextDescriptions = caseData.text_descriptions && caseData.text_descriptions.length > 0;
  const hasStructuredDocketEntries = caseData.docket_entries && caseData.docket_entries.length > 0;
  const hasExtractedEntries = caseData.entries && caseData.entries.length > 0;
  const hasPythonStyleData = hasTextDescriptions || hasStructuredDocketEntries || hasExtractedEntries;
  
  // If we have Python-style or extracted_features data, use the llm_summary.py prompt logic
  if (hasPythonStyleData) {
    // Build metadata from case_metadata (extracted format) or flat caseData
    const metadataLines: string[] = [];
    const caseNumber = caseData.case_metadata?.case_number ?? caseData.case_number ?? caseData.docketNumber;
    if (caseNumber) metadataLines.push(`Case Number: ${caseNumber}`);
    const caseName = caseData.case_metadata?.case_name ?? caseData.case_name ?? caseData.caseName;
    if (caseName) metadataLines.push(`Case Name: ${caseName}`);
    const dateFiled = caseData.case_metadata?.date_filed ?? caseData.date_filed ?? caseData.dateFiled;
    if (dateFiled) metadataLines.push(`Date Filed: ${dateFiled}`);
    const metadata = metadataLines.join("\n");
    
    // Build docket text from extracted_features.entries, docket_entries, text_descriptions, or plainText/snippet
    let docketText = "";
    
    if (hasTextDescriptions && caseData.text_descriptions) {
      docketText = caseData.text_descriptions;
    } else if (hasExtractedEntries && caseData.entries) {
      const entryTexts = caseData.entries.map((entry) => {
        const parts: string[] = [];
        if (entry.entry_number != null) parts.push(`Entry ${entry.entry_number}`);
        const filed = entry.date_filed ?? (entry as { filing_date?: string }).filing_date;
        if (filed) parts.push(`Filed ${filed}`);
        if (entry.document_number) parts.push(`Doc #${entry.document_number}`);
        const prefix = parts.length > 0 ? `[${parts.join(", ")}] ` : "";
        const desc = entry.description ?? "";
        const plain = entry.plain_text ?? "";
        return `${prefix}${desc}${plain ? " " + plain : ""}`.trim();
      });
      docketText = entryTexts.join("\n");
    } else if (hasStructuredDocketEntries && caseData.docket_entries) {
      const entryTexts = caseData.docket_entries.map((entry) => {
        const entryParts: string[] = [];
        if (entry.entry_number != null) entryParts.push(`Entry ${entry.entry_number}`);
        const filed = entry.filing_date ?? (entry as { date_filed?: string }).date_filed;
        if (filed) entryParts.push(`Filed ${filed}`);
        if (entry.document_number) entryParts.push(`Doc #${entry.document_number}`);
        if ((entry as { pacer_sequence_number?: string }).pacer_sequence_number) {
          entryParts.push(`PACER Seq ${(entry as { pacer_sequence_number: string }).pacer_sequence_number}`);
        }
        const entryPrefix = entryParts.length > 0 ? `[${entryParts.join(", ")}] ` : "";
        return `${entryPrefix}${entry.description}`;
      });
      docketText = entryTexts.join("\n");
    } else if (caseData.plainText) {
      docketText = caseData.plainText;
    } else if (caseData.snippet) {
      docketText = caseData.snippet;
    }
    
    // Truncate to 6000 characters like the Python code does
    const truncatedDocketText = docketText.slice(0, 6000);
    
    // Build the prompt exactly as in llm_summary.py
    userPrompt = `Summarize these federal court docket entries into a SHORT, SIMPLE, CHRONOLOGICAL timeline for a small sidebar in a web app.

CASE METADATA (include at the top of the output):
${metadata}

Docket entries:
${truncatedDocketText}

CRITICAL RULES:
- Order events by DATE (earliest --> latest).
- Use plain everyday English.
- Pretend the reader has ZERO legal knowledge.
- Avoid legal jargon and technical terms.
- Skip routine filings, extensions, attorney appearances, and administrative paperwork.
- Highlight major actions, decisions, deadlines, violations, or conflicts.

PERSON-FOCUSED RULES:
- Clearly identify the person.
- Focus on what is happening TO that person in each moment.
- Emphasize changes to their freedom, custody, or legal situation.
- If the court requires the government to act, explain what that could mean for the person (release, hearing, continued detention, etc.).
- If the judge finds something unlawful or unconstitutional, say so in simple language.
- Do NOT invent background details, emotions, family info, or reasons for detention.
- Only include facts that appear in the docket.

STYLE RULES:
- Each bullet must be one to two short sentences.
- Use active voice.
- Keep sentences direct and concrete.
- Avoid naming every government official unless necessary.
- If something is minor, repetitive, or procedural, omit it.

Output format:

[Case metadata shown first]

Date: Event
Date: Event
Date: Event

Keep the list brief and only include the most important moments.
Do not include any headers or explanations.
Start immediately with the metadata and timeline.`;
    
    // Add custom prompt if provided
    if (customPrompt) {
      userPrompt += `\n\nANALYST FOCUS: ${customPrompt}`;
    }
    
    // Use a minimal system prompt for Python-style (the instructions are in user prompt)
    systemPrompt = "You are a legal operations assistant that summarizes court docket entries.";
    
  } else {
    // FALLBACK: Use original prompt construction when no Python-style data
    userPrompt = [
      `Case: ${caseData.caseName ?? "Unknown"}`,
      `Court: ${caseData.court ?? "Unknown"}`,
      `Docket: ${caseData.docketNumber ?? "Unknown"}`,
      `Filed: ${caseData.dateFiled ?? "Unknown"}`,
      "",
      "Filing excerpt:",
      caseData.plainText ?? caseData.snippet ?? "No filing text provided.",
      "",
      customPrompt ? `Analyst focus: ${customPrompt}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    
    // Use the ORIGINAL system prompt exactly as in your provided code
    systemPrompt = "You are a legal operations assistant. Summarize federal court docket entries in plain English. Concise factual summary with sections: Core Issue, Procedural History, Court Orders, Deadlines & Dates, and Current Status.";
  }

  // 2. Point to Google's OpenAI-compatible Gemini endpoint
  const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      // 3. Use the same model as your backend
      model: "gemini-2.0-flash", 
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.3, // Match backend temperature
      max_tokens: 500,  // Match backend token limit
    }),
  });

  if (!upstream.ok) {
    const errorBody = await upstream.text();
    return NextResponse.json(
      { error: `Gemini API request failed: ${errorBody}` },
      { status: upstream.status },
    );
  }

  const data = await upstream.json();
  // Extract content from the standard OpenAI-compatible response structure
  const summary = data.choices?.[0]?.message?.content ?? "No summary returned.";

  return NextResponse.json({ summary });
}
