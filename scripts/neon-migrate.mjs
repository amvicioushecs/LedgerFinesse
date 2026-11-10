#!/usr/bin/env node
// Applies neon/migrations/*.sql in order, once each (tracked in public.lf_migrations), over the Neon WebSocket driver.
// Usage: DATABASE_URL=... NEON_BRANCH=<name> node scripts/neon-migrate.mjs [--production]
// Refuses the "production" branch unless --production is passed. Never prints the connection string.
import { readdir, readFile } from "node:fs/promises";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const branch = process.env.NEON_BRANCH;
if (!url || !branch) throw new Error("DATABASE_URL and NEON_BRANCH are required");
if (branch === "production" && !process.argv.includes("--production")) throw new Error("refusing production without --production");

const dir = new URL("../neon/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("create table if not exists public.lf_migrations (name text primary key, applied_at timestamptz not null default now())");
  await client.query("revoke all on public.lf_migrations from public, anonymous, authenticated").catch(() => {});
  const done = new Set((await client.query("select name from public.lf_migrations")).rows.map((r) => r.name));
  for (const name of files) {
    if (done.has(name)) { console.log(`skip  ${name}`); continue; }
    await client.query("begin");
    try {
      await client.query(await readFile(new URL(name, dir), "utf8"));
      await client.query("insert into public.lf_migrations (name) values ($1)", [name]);
      await client.query("commit");
      console.log(`apply ${name} (branch ${branch})`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`${name}: ${error.message}`);
    }
  }
} finally {
  client.release();
  await pool.end();
}
