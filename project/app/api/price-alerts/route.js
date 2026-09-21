import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ priceAlerts: [] });
}

export async function POST() {
  return NextResponse.json({ success: true, demo: true });
}

export async function PATCH() {
  return NextResponse.json({ success: true, demo: true });
}

export async function DELETE() {
  return NextResponse.json({ success: true, demo: true });
}
