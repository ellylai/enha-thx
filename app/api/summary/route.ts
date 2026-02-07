import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is missing. Add it to your environment to enable AI summaries.",
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

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are a legal operations assistant. Explain filings in plain English for attorneys and legal ops teams. Keep output concise, factual, and neutral. Include sections: Core Issue, Procedural Posture, Obligations/Deadlines, Compliance Risk.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      max_output_tokens: 350,
    }),
  });

  if (!upstream.ok) {
    const errorBody = await upstream.text();
    return NextResponse.json(
      { error: `OpenAI request failed: ${errorBody}` },
      { status: upstream.status },
    );
  }

  const data = (await upstream.json()) as {
    output_text?: string;
  };

  return NextResponse.json({ summary: data.output_text ?? "No summary returned." });
}
