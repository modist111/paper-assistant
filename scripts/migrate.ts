import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Client } from "pg";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("请先在 .env.local 设置 DATABASE_URL；不要在聊天中发送连接串");
  const connection = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(connection.protocol)) throw new Error("DATABASE_URL 必须是 PostgreSQL URI");
  if (connection.password.includes("YOUR-PASSWORD")) throw new Error("请在本机替换数据库密码占位符");
  // pg's sslmode parser can replace ssl options. Keep certificate verification explicit.
  connection.searchParams.delete("sslmode");
  const ca = await readFile(process.env.DATABASE_SSL_CA_FILE || "supabase/certs/prod-ca-2021.crt", "utf8");
  const client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) }, connectionTimeoutMillis: 15_000, statement_timeout: 30_000 });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(53821492)");
    const source = await readFile("supabase/migrations/002_auth_and_index_jobs.sql", "utf8");
    const digest = createHash("sha256").update(source).digest("hex");
    await client.query(`CREATE TABLE IF NOT EXISTS public.paper_assistant_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE public.paper_assistant_migrations ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON public.paper_assistant_migrations FROM anon, authenticated;`);
    const { rows } = await client.query("SELECT checksum FROM public.paper_assistant_migrations WHERE name=$1", ["002_auth_and_index_jobs.sql"]);
    if (rows[0]) {
      if (rows[0].checksum !== digest) throw new Error("迁移已执行但文件内容发生变化；请创建后续迁移，不能覆盖历史记录");
      console.log("002 已执行，跳过");
      return;
    }
    await client.query(source);
    await client.query("INSERT INTO public.paper_assistant_migrations(name,checksum) VALUES ($1,$2)", ["002_auth_and_index_jobs.sql",digest]);
    console.log("002 迁移执行完成；旧论文与文本块保留");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.query("SELECT pg_advisory_unlock(53821492)").catch(() => {});
    await client.end();
  }
}

main().catch((error: unknown) => {
  // Avoid printing a Client, config object, or connection URI containing a password.
  const raw = error instanceof Error ? error.message : "数据库迁移失败";
  const message = process.env.DATABASE_URL ? raw.replaceAll(process.env.DATABASE_URL, "[DATABASE_URL]") : raw;
  console.error(message);
  process.exitCode = 1;
});
