import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  // Load after .env.local so the admin and model clients use the configured credentials.
  const { runNextIndexJob } = await import("../src/lib/indexing/jobs");
  const once = process.argv.includes("--once");
  let stopping = false;
  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });
  console.log("[IndexWorker] started", once ? "(one task)" : "(poll every 5s)");
  do {
    try {
      const worked = await runNextIndexJob();
      if (once) return;
      if (worked) continue;
    } catch (error) {
      console.error("[IndexWorker]", error instanceof Error ? error.message : error);
      if (once) { process.exitCode = 1; return; }
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (!stopping);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
