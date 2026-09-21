import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";
import { isValidImageUrl } from "@/lib/security/url-validation";

const ProfileUpdateSchema = z
  .object({
    display_name: z.string().trim().max(100).optional(),
    avatar_url: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .refine((val) => !val || isValidImageUrl(val), {
        message: "Invalid avatar URL. Must be a valid HTTP or HTTPS URL.",
      }),
  })
  .strict();

export async function GET(request) {
  const limited = await rateLimitOr429Async(request, "profile", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, created_at, updated_at")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("/api/profile GET:", error.message);
    return NextResponse.json({ error: "Could not load profile." }, { status: 500 });
  }
  return NextResponse.json({ profile });
}

export async function PATCH(request) {
  const limited = await rateLimitOr429Async(request, "profile", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = ProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid profile fields. Only display_name and avatar_url can be updated." },
      { status: 400 }
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id)
    .select("id, display_name, avatar_url, created_at, updated_at")
    .single();

  if (error) {
    console.error("/api/profile PATCH:", error.message);
    return NextResponse.json({ error: "Could not update profile." }, { status: 400 });
  }

  return NextResponse.json({ profile });
}

export async function PUT(request) {
  return PATCH(request);
}

