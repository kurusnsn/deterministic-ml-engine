import { NextResponse } from "next/server";
import { generateForcingLinesWithOpening, loadCachedLines } from "@/lib/forcing/generator";

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
    const cached = loadCachedLines(openingId);
    if (cached) {
      return NextResponse.json(
        {
          opening: cached.name ?? cached.opening ?? openingId,
          lines: cached.lines ?? [],
          generatedAt: cached.generatedAt,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { opening, lines } = await generateForcingLinesWithOpening(openingId);
    return NextResponse.json(
      {
        opening: opening.name ?? openingId,
        lines,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to generate forcing lines", error);
    return NextResponse.json({ error: "Failed to generate forcing lines" }, { status: 500 });
  }
}