#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

// This project's production hostname is intentionally fixed. Do not let a CI
// environment override silently verify a preview or another site's deployment.
export const PRODUCTION_ORIGIN = "https://www.ycautousa.com";
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const retryDelays = [0, 5_000, 15_000];

type RunCommand = (
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
) => Promise<number>;

const runCommand: RunCommand = (args, env, timeoutMs) =>
  new Promise((resolveExit) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      env,
      stdio: "inherit",
      timeout: timeoutMs,
      killSignal: "SIGTERM",
    });
    child.once("error", (error) => {
      console.error(`Unable to run production command: ${error.message}`);
      resolveExit(1);
    });
    child.once("exit", (code, signal) => {
      if (signal) console.error(`Production command stopped (${signal}).`);
      resolveExit(code ?? 1);
    });
  });

export async function deployProduction(
  run: RunCommand = runCommand,
  wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const deployed = await run(
    [
      resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
      "deploy",
      "--env",
      "production",
    ],
    env,
    10 * 60_000,
  );
  if (deployed !== 0) return deployed;

  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt]) await wait(retryDelays[attempt]);
    console.log(
      `Checking ${PRODUCTION_ORIGIN} after deployment (${attempt + 1}/${retryDelays.length})…`,
    );
    const verified = await run(
      ["--import", "tsx", resolve(projectRoot, "scripts/verify-production.ts")],
      { ...env, APP_ORIGIN: PRODUCTION_ORIGIN },
      90_000,
    );
    if (verified === 0) {
      console.log("Production deployment and smoke checks passed.");
      return 0;
    }
  }
  console.error(
    "Deployment completed, but production smoke checks failed after 3 attempts. " +
      "The deployed version is still live. Inspect the check output and Cloudflare deployment history, " +
      "then fix or explicitly roll back the Worker. No automatic rollback or data changes were performed.",
  );
  return 1;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  process.exitCode = await deployProduction();
