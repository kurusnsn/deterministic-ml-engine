import { NextResponse } from "next/server";
import { openings } from "@/data/openings";

export async function GET() {
  return NextResponse.json({ openings });
}
