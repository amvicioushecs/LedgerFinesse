import { neon } from "@neondatabase/serverless";

export type Row = Record<string, unknown>;
/** One parameterized statement over Neon's HTTP driver (works on Node and workerd). Multi-step writes are SQL functions. */
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

export function neonQuery(databaseUrl: string): Query {
  const sql = neon(databaseUrl);
  return (text, params = []) => sql.query(text, params) as Promise<Row[]>;
}

/** timestamptz arrives as a Date (or a string from some drivers); the app keeps ISO strings. */
export function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
