import { NextResponse } from "next/server";
import { generateDebug } from "@/lib/forcing/generator";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const openingId = params.id;

  if (!openingId) {
    return NextResponse.json({ error: "Missing opening id" }, { status: 400 });
  }

  try {
    const debugPayload = await generateDebug(openingId);
    return NextResponse.json(debugPayload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("DEBUG ERROR:", error);
    return NextResponse.json(
      {
        error: "Failed to build debug payload",
        message: error?.message,
        stack: error?.stack,
      },
      { status: 500 },
    );
  }
}