import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const version = process.argv[2];
if (!version) {
  throw new Error("Usage: node set-pi-development-version.mjs <version>");
}

const packageJsonPath = resolve("packages/integrations/pi-vim/package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
for (const packageName of [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
]) {
  packageJson.devDependencies[packageName] = version;
}
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
