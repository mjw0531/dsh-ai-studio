import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function fail(message) {
  console.error(`check-release: ${message}`);
  process.exitCode = 1;
}

const expected = (process.argv[2] ?? "").replace(/^v/, "");
const root = JSON.parse(read("package.json"));
const pkg = JSON.parse(read("packages/dsh-studio/package.json"));
const types = read("packages/dsh-studio/src/shared/types.ts");
const version = /STUDIO_PLUGIN_VERSION = "([^"]+)"/.exec(types)?.[1] ?? "";

if (root.version !== pkg.version || pkg.version !== version) {
  fail(
    `版本不一致：root=${root.version} pkg=${pkg.version} types=${version}`,
  );
}
if (expected !== "" && expected !== pkg.version) {
  fail(`tag=${expected} 与 package=${pkg.version} 不一致`);
}
if (!read("CHANGELOG.md").includes(`## [${pkg.version}]`)) {
  fail(`CHANGELOG 缺少 ${pkg.version}`);
}

if (!process.exitCode) {
  console.log(`check-release: ${pkg.version} ok`);
}
