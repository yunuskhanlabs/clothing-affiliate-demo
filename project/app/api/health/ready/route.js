export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ready", mode: "standalone-demo" });
}
