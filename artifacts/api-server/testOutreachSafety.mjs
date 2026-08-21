import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const testBuildDir = path.join(artifactDir, ".test-build");
const outputFile = path.join(testBuildDir, "emailOutreachSafety.test.cjs");

try {
  await rm(testBuildDir, { recursive: true, force: true });
  await mkdir(testBuildDir, { recursive: true });
  await esbuild({
    entryPoints: [
      path.join(artifactDir, "src/routes/emailOutreachSafety.test.ts"),
    ],
    bundle: true,
    format: "cjs",
    outfile: outputFile,
    platform: "node",
    external: ["pino"],
  });

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", outputFile], {
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  await rm(testBuildDir, { recursive: true, force: true });
}