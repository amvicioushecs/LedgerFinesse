import type { NextRequest } from "next/server";
import { dispatch, type Route } from "@/routes/dispatch";
import { POST as code } from "@/routes/auth/code";
import { POST as password } from "@/routes/auth/password";
import { POST as reset } from "@/routes/auth/reset";
import { POST as resetCode } from "@/routes/auth/reset-code";
import { POST as signin } from "@/routes/auth/signin";
import { POST as signout } from "@/routes/auth/signout";
import { POST as updatePassword } from "@/routes/auth/update-password";

/** Every /auth/* form post, in one Route Handler entry (see src/routes/dispatch.ts for why). */
const routes: Route[] = [
  { pattern: ["code"], methods: { POST: code } },
  { pattern: ["password"], methods: { POST: password } },
  { pattern: ["reset"], methods: { POST: reset } },
  { pattern: ["reset-code"], methods: { POST: resetCode } },
  { pattern: ["signin"], methods: { POST: signin } },
  { pattern: ["signout"], methods: { POST: signout } },
  { pattern: ["update-password"], methods: { POST: updatePassword } },
];

export async function POST(request: NextRequest, { params }: RouteContext<"/auth/[action]">) {
  return dispatch(routes, "POST", request, [(await params).action]);
}

export async function GET(request: NextRequest, { params }: RouteContext<"/auth/[action]">) {
  return dispatch(routes, "GET", request, [(await params).action]);
}
