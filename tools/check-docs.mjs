import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relative) {
  return readFileSync(path.join(rootDir, relative), "utf8");
}

function fail(message) {
  console.error(`check-docs: ${message}`);
  process.exitCode = 1;
}

const root = JSON.parse(read("package.json"));
const pkg = JSON.parse(read("packages/dsh-studio/package.json"));
const types = read("packages/dsh-studio/src/shared/types.ts");
const readme = read("README.md");
const changelog = read("CHANGELOG.md");
const plan = read("docs/08-迭代计划.md");

const versionMatch = /STUDIO_PLUGIN_VERSION = "([^"]+)"/.exec(types);
const pluginVersion = versionMatch?.[1] ?? "";
if (pluginVersion === "") fail("types.ts 缺少 STUDIO_PLUGIN_VERSION");
if (root.version !== pkg.version) fail("根 package 与插件 package 版本不一致");
if (root.version !== pluginVersion) fail("package 与 STUDIO_PLUGIN_VERSION 不一致");
if (!readme.includes(`v${root.version}`)) fail("README 未声明当前版本");
if (!changelog.includes(`## [${root.version}]`)) fail("CHANGELOG 缺少当前版本");
if (!plan.includes(`**v${root.version}**`)) fail("docs/08 当前版本不一致");
if (/\\n/.test(readme) || /\\n/.test(plan)) fail("文档中存在字面量 \\n");

if (!process.exitCode) {
  console.log(`check-docs: ${root.version} ok`);
}
