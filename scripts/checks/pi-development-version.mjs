import { readFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const expectedVersion = process.env.EXPECTED_PI_VERSION;
if (!expectedVersion) {
  throw new Error("EXPECTED_PI_VERSION must be set");
}

const workspacePackageJson = pathToFileURL(
  resolve("packages/integrations/pi-vim/package.json"),
);
const packages = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"];

for (const packageName of packages) {
  const packageJson = findPackageJson(
    fileURLToPath(import.meta.resolve(packageName, workspacePackageJson)),
    packageName,
  );
  if (packageJson.version !== expectedVersion) {
    throw new Error(
      `Expected ${packageName}@${expectedVersion}, found ${packageJson.version}`,
    );
  }
  console.log(`${packageName}@${packageJson.version}`);
}

function findPackageJson(entryPoint, expectedName) {
  let directory = dirname(entryPoint);
  const root = parse(directory).root;

  while (directory !== root) {
    try {
      const packageJson = JSON.parse(
        readFileSync(join(directory, "package.json"), "utf8"),
      );
      if (packageJson.name === expectedName) {
        return packageJson;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    directory = dirname(directory);
  }

  throw new Error(`Cannot find package.json for ${expectedName}`);
}
