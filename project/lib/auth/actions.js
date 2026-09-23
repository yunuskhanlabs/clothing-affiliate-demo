"use server";

import { cookies } from "next/headers";
import crypto from "node:crypto";

// Fallback secret for demo mode auth signing
function getSecret() {
  return process.env.STEP_UP_SECRET || "demo-safe-step-up-secret-12345";
}

function signToken(email) {
  const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 1 day
  const signature = crypto.createHmac("sha256", getSecret()).update(`admin.${email}.${expiresAt}`).digest("hex");
  return `${expiresAt}.${signature}`;
}

export async function signUpWithPassword() {
  return { error: "Signups disabled in demo." };
}

export async function signInWithPassword({ email, password }) {
  const expectedEmail = process.env.DEMO_ADMIN_EMAIL || "admin@demo.com";
  const expectedPassword = process.env.DEMO_ADMIN_PASSWORD || "demo123";

  if (!email || !password) {
    console.log(`[AUTH] LOGIN_FAILED reason="missing_credentials"`);
    return { error: "Credentials required" };
  }
  if (email !== expectedEmail || password !== expectedPassword) {
    console.log(`[AUTH] LOGIN_FAILED email="${email}" reason="invalid_credentials"`);
    return { error: "Invalid demo credentials" };
  }

  const token = signToken(email);
  cookies().set("demo_admin_auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  });

  console.log(`[AUTH] LOGIN_SUCCESS email="${email}"`);
  return { error: null };
}

export async function signOut() {
  cookies().delete("demo_admin_auth");
  console.log(`[AUTH] LOGOUT`);
  return { error: null };
}

export async function requestPasswordReset() {
  return { error: "Not available in demo." };
}

export async function updatePassword() {
  return { error: "Not available in demo." };
}
