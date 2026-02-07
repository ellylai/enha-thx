import { NextRequest, NextResponse } from "next/server";

function printConfirmedDocketIdToTerminal(docketId: number): void {
  console.log(`[confirmed-docket-id] ${docketId}`);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { docketId?: number }
    | null;

  const docketId = body?.docketId;
  if (typeof docketId !== "number") {
    return NextResponse.json({ error: "docketId is required" }, { status: 400 });
  }

  printConfirmedDocketIdToTerminal(docketId);
  return NextResponse.json({ ok: true });
}
