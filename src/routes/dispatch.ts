import type { NextRequest } from "next/server";

/**
 * Route tables for the two catch-all Route Handlers (app/auth/[action] and app/api/[...path]).
 *
 * Why not one route.ts per URL: Turbopack gives every Route Handler entry its own copy of the shared server code
 * (runtime, Neon, Stripe, zod), about 0.7 MB each, which put the Spacefast Functions bundle over its 8 MiB cap.
 * Two entries keep two copies. URLs, methods and handlers are unchanged; each handler lives in src/routes.
 */
export type Handler = (request: NextRequest, ...params: string[]) => Promise<Response>;
export interface Route {
  /** Path segments after the prefix; ":param" matches one segment and is passed to the handler. */
  pattern: string[];
  methods: Partial<Record<"GET" | "POST", Handler>>;
}

export function matchRoute(routes: Route[], segments: string[]): { route: Route; params: string[] } | null {
  for (const route of routes) {
    if (route.pattern.length !== segments.length) continue;
    const params: string[] = [];
    if (route.pattern.every((part, i) => (part.startsWith(":") ? (params.push(segments[i]), true) : part === segments[i]))) return { route, params };
  }
  return null;
}

/** 404 for an unknown path, 405 (with Allow) for a known path and another method: what per-file routes answered. */
export async function dispatch(routes: Route[], method: string, request: NextRequest, segments: string[]): Promise<Response> {
  const match = matchRoute(routes, segments);
  if (!match) return new Response("Not found", { status: 404 });
  const handler = Object.hasOwn(match.route.methods, method) ? match.route.methods[method as "GET" | "POST"] : undefined;
  if (!handler) return new Response("Method not allowed", { status: 405, headers: { allow: Object.keys(match.route.methods).join(", ") } });
  return handler(request, ...match.params);
}
