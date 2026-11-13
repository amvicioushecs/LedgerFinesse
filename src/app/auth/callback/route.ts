import { NextResponse, type NextRequest } from "next/server";
import { handleAuthCallback } from "@/lib/auth/callback";
import { callbackDeps } from "@/lib/server/runtime";

/**
 * Landing for Supabase email links. Magic link and sign-up confirmation are PKCE only (`code`); a token_hash link is
 * accepted only for password recovery, and only behind a "Continue as <email>?" step (see lib/auth/callback.ts).
 */
export async function GET(request: NextRequest) {
  const to = await handleAuthCallback(await callbackDeps(), request.nextUrl.searchParams);
  return NextResponse.redirect(new URL(to, request.url), 303);
}
