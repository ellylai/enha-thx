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
      court?: string;
      docketNumber?: string;
      dateFiled?: string;
      plainText?: string;
      snippet?: string;
    };
    customPrompt?: string;
  };

  if (!body.caseData) {
    return NextResponse.json({ error: "Missing case payload" }, { status: 400 });
  }

  const customPrompt = body.customPrompt?.trim();

  // Construct prompt aligned with backend llm_summary.py
  const userPrompt = [
    `Case: ${body.caseData.caseName ?? "Unknown"}`,
    `Court: ${body.caseData.court ?? "Unknown"}`,
    `Docket: ${body.caseData.docketNumber ?? "Unknown"}`,
    `Filed: ${body.caseData.dateFiled ?? "Unknown"}`,
    "",
    "Filing excerpt:",
    body.caseData.plainText ?? body.caseData.snippet ?? "No filing text provided.",
    "",
    customPrompt ? `Analyst focus: ${customPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");

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
          content:
            "You are a legal operations assistant. Summarize federal court docket entries in plain English. Concise factual summary with sections: Core Issue, Procedural History, Court Orders, Deadlines & Dates, and Current Status.",
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