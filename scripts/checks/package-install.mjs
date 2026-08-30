import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageNames = ["@thazhemadam/vim-state", "@thazhemadam/pi-vim"];
const temporaryDirectory = mkdtempSync(join(tmpdir(), "pi-vim-package-"));
const packDirectory = join(temporaryDirectory, "pack");
const installDirectory = join(temporaryDirectory, "install");

try {
  mkdirSync(packDirectory);
  mkdirSync(installDirectory);
  writeFileSync(
    join(installDirectory, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );

  const tarballs = packageNames.map((packageName) => {
    const packResult = run("npm", [
      "pack",
      "--json",
      "--workspace",
      packageName,
      "--pack-destination",
      packDirectory,
    ]);
    const [manifest] = JSON.parse(packResult.stdout);
    return join(packDirectory, manifest.filename);
  });

  run("npm", [
    "install",
    "--omit=dev",
    "--legacy-peer-deps",
    "--package-lock=false",
    "--prefix",
    installDirectory,
    ...tarballs,
  ]);

  const installedPackage = join(
    installDirectory,
    "node_modules",
    "@thazhemadam",
    "pi-vim",
  );
  const extensionEntry = join(installedPackage, "dist", "index.js");
  if (!existsSync(extensionEntry)) {
    throw new Error(
      `Installed extension entry point is missing: ${extensionEntry}`,
    );
  }

  const piBinary = resolve(
    "node_modules",
    ".bin",
    process.platform === "win32" ? "pi.cmd" : "pi",
  );
  run(piBinary, ["--no-extensions", "-e", installedPackage, "--list-models"]);

  console.log(
    `${packageNames.join(" and ")} tarballs install together with production dependencies; pi-vim loads in Pi`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}
