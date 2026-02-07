import { NextRequest, NextResponse } from "next/server";

function printConfirmedDocketIdToTerminal(docketId: string): void {
  console.log(`[confirmed-docket-id] ${docketId}`);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { docketId?: string }
    | null;

  const docketId = body?.docketId?.trim();
  if (!docketId) {
    return NextResponse.json({ error: "docketId is required" }, { status: 400 });
  }

  printConfirmedDocketIdToTerminal(docketId);
  return NextResponse.json({ ok: true });
}

