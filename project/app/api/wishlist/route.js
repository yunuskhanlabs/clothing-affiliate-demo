import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ items: [] });
}

export async function POST(request) {
  return NextResponse.json({ success: true, demo: true });
}

export async function DELETE(request) {
  return NextResponse.json({ success: true, demo: true });
}
