import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PI_CORE_PACKAGES = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "typebox",
];

const packages = [
  {
    name: "@thazhemadam/vim-state",
    directory: "packages/vim-state",
    required: ["LICENSE", "LICENSE.GPL", "dist/index.d.ts", "dist/index.js"],
  },
  {
    name: "@thazhemadam/pi-vim",
    directory: "packages/integrations/pi-vim",
    piPackage: true,
    requiredPeers: [
      "@earendil-works/pi-coding-agent",
      "@earendil-works/pi-tui",
    ],
    required: [
      "LICENSE",
      "LICENSE.GPL",
      "dist/index.d.ts",
      "dist/index.js",
      "dist/extension.js",
    ],
  },
];

const allowedFile =
  /^(?:LICENSE(?:\.GPL)?|README\.md|package\.json|dist\/.+\.(?:d\.ts|js))$/;

for (const packageSpec of packages) {
  const result = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--workspace", packageSpec.name],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const packageJson = JSON.parse(
    readFileSync(join(packageSpec.directory, "package.json"), "utf8"),
  );
  const [manifest] = JSON.parse(result.stdout);
  const files = manifest.files.map(({ path }) => path).sort();
  const errors = [];

  if (
    manifest.name !== packageSpec.name ||
    packageJson.name !== packageSpec.name
  ) {
    errors.push(`package name: ${manifest.name}`);
  }

  for (const file of files.filter((file) => !allowedFile.test(file))) {
    errors.push(`unexpected: ${file}`);
  }
  for (const file of packageSpec.required.filter(
    (file) => !files.includes(file),
  )) {
    errors.push(`missing: ${file}`);
  }

  validatePiDependencies(packageJson, packageSpec, errors);
  if (packageSpec.piPackage) {
    validatePiManifest(packageJson, files, errors);
  }

  if (errors.length > 0) {
    console.error(`Invalid package contents for ${packageSpec.name}`);
    for (const error of errors) console.error(`  ${error}`);
    process.exitCode = 1;
    continue;
  }

  console.log(`${manifest.name}@${manifest.version} (${files.length} files)`);
  for (const file of files) console.log(`  ${file}`);
}

function validatePiDependencies(packageJson, packageSpec, errors) {
  const dependencies = packageJson.dependencies ?? {};
  const peerDependencies = packageJson.peerDependencies ?? {};
  const bundledDependencies = new Set([
    ...(packageJson.bundledDependencies ?? []),
    ...(packageJson.bundleDependencies ?? []),
  ]);

  for (const dependency of PI_CORE_PACKAGES) {
    if (Object.hasOwn(dependencies, dependency)) {
      errors.push(`Pi core package must not be a dependency: ${dependency}`);
    }
    if (bundledDependencies.has(dependency)) {
      errors.push(`Pi core package must not be bundled: ${dependency}`);
    }
    if (
      Object.hasOwn(peerDependencies, dependency) &&
      peerDependencies[dependency] !== "*"
    ) {
      errors.push(`Pi core peer must use \"*\": ${dependency}`);
    }
  }

  for (const dependency of packageSpec.requiredPeers ?? []) {
    if (peerDependencies[dependency] !== "*") {
      errors.push(`missing Pi core peer with \"*\": ${dependency}`);
    }
  }
}

function validatePiManifest(packageJson, files, errors) {
  if (!packageJson.keywords?.includes("pi-package")) {
    errors.push('keywords must include "pi-package"');
  }

  const extensions = packageJson.pi?.extensions;
  if (!Array.isArray(extensions) || extensions.length === 0) {
    errors.push("pi.extensions must contain at least one entry point");
    return;
  }

  for (const extension of extensions) {
    if (typeof extension !== "string" || /[*?\[\]{}]/.test(extension)) {
      continue;
    }
    const path = extension.replace(/^\.\//, "");
    if (!files.includes(path)) {
      errors.push(`pi extension is absent from tarball: ${extension}`);
    }
  }
}
