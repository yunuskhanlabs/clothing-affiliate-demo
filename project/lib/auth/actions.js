"use client";

/**
 * Demo Auth Actions — Standalone Demo Mode
 */

export async function signUpWithPassword() {
  return { error: null };
}

export async function signInWithPassword({ email, password }) {
  if (typeof window !== "undefined") {
    localStorage.setItem("demo_user", JSON.stringify({ email, role: "admin" }));
    document.cookie = "demo_admin_auth=true; path=/; max-age=86400";
  }
  return { error: null };
}

export async function signOut() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("demo_user");
    document.cookie = "demo_admin_auth=; path=/; max-age=0";
  }
  return { error: null };
}

export async function requestPasswordReset() {
  return { error: null };
}

export async function updatePassword() {
  return { error: null };
}
