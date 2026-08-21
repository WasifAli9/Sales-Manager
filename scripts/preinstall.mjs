import { unlink } from "node:fs/promises";

const ua = process.env.npm_config_user_agent || "";
if (!ua.includes("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}

for (const file of ["package-lock.json", "yarn.lock"]) {
  await unlink(file).catch(() => {});
}
