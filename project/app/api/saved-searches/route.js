import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ searches: [] });
}

export async function POST() {
  return NextResponse.json({ success: true, demo: true });
}

export async function DELETE() {
  return NextResponse.json({ success: true, demo: true });
}
