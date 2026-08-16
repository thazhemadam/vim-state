import { spawnSync } from "node:child_process";

const packages = [
  {
    name: "@thazhemadam/vim-state",
    required: ["LICENSE", "LICENSE.GPL", "dist/index.d.ts", "dist/index.js"],
  },
  {
    name: "@thazhemadam/pi-vim",
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

  const [manifest] = JSON.parse(result.stdout);
  const files = manifest.files.map(({ path }) => path).sort();
  const unexpected = files.filter((file) => !allowedFile.test(file));
  const missing = packageSpec.required.filter((file) => !files.includes(file));

  if (
    manifest.name !== packageSpec.name ||
    unexpected.length ||
    missing.length
  ) {
    console.error(`Invalid package contents for ${packageSpec.name}`);
    if (manifest.name !== packageSpec.name) {
      console.error(`  package name: ${manifest.name}`);
    }
    for (const file of unexpected) console.error(`  unexpected: ${file}`);
    for (const file of missing) console.error(`  missing: ${file}`);
    process.exitCode = 1;
    continue;
  }

  console.log(`${manifest.name}@${manifest.version} (${files.length} files)`);
  for (const file of files) console.log(`  ${file}`);
}
