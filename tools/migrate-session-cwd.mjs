#!/usr/bin/env node
/**
 * Migrate one DSH session from an old workspace cwd to a new one.
 *
 * DSH stores the cwd in the first JSON line of session.v4.jsonl.zstd.
 * The workspace switcher updates workspace.json but does not rewrite
 * already-created sessions.
 *
 * Safety:
 * - dry-run by default;
 * - refuses to overwrite an existing destination;
 * - keeps the original session file as a backup;
 * - requires DSH to be closed (checked manually).
 *
 * Usage:
 *   node tools/migrate-session-cwd.mjs
 *   node tools/migrate-session-cwd.mjs --apply
 *   node tools/migrate-session-cwd.mjs --apply --session session-...
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
if (apply && process.env.DSH_SESSION_ID) {
  console.error(
    "检测到 DSH_SESSION_ID：请在完全退出 DSH 后，从普通 PowerShell 运行本脚本。",
  );
  process.exit(1);
}
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};

const home = process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
const sessionId =
  option("--session", process.env.DSH_SESSION_ID ?? "") || "";
const fromCwd = option("--from", "D:\\AI工作台");
const toCwd = option("--to", "D:\\dsh-ai-studio");
const targetDirName = option("--target-dir", "--D-dsh-ai-studio--");

if (sessionId === "") {
  console.error("缺少 --session 或 DSH_SESSION_ID");
  process.exit(1);
}

const sessionsRoot = path.join(home, "sessions");
if (!fs.existsSync(sessionsRoot)) {
  console.error(`sessions 目录不存在：${sessionsRoot}`);
  process.exit(1);
}

const candidates = [];
for (const root of fs.readdirSync(sessionsRoot)) {
  const file = path.join(
    sessionsRoot,
    root,
    sessionId,
    "session.v4.jsonl.zstd",
  );
  if (fs.existsSync(file)) candidates.push({ root, file });
}
if (candidates.length !== 1) {
  console.error(
    `期望找到 1 个会话文件，实际 ${String(candidates.length)} 个：${sessionId}`,
  );
  process.exit(1);
}
const source = candidates[0];
const targetDir = path.join(sessionsRoot, targetDirName);
const targetSessionDir = path.join(targetDir, sessionId);
const targetFile = path.join(targetSessionDir, "session.v4.jsonl.zstd");

const compressed = fs.readFileSync(source.file);
let text;
try {
  text = zlib.zstdDecompressSync(compressed).toString("utf8");
} catch (error) {
  console.error(`无法解压会话：${error.message}`);
  process.exit(1);
}
const lines = text.split("\n");
const header = JSON.parse(lines[0] ?? "{}");
if (header.type !== "session" || header.id !== sessionId) {
  console.error("会话头格式不符合预期");
  process.exit(1);
}
if (header.cwd !== fromCwd) {
  console.error(
    `会话 cwd 是 ${String(header.cwd)}，不是期望的 ${fromCwd}；未修改`,
  );
  process.exit(1);
}
if (fs.existsSync(targetSessionDir)) {
  console.error(`目标已存在，拒绝覆盖：${targetSessionDir}`);
  process.exit(1);
}

header.cwd = toCwd;
lines[0] = JSON.stringify(header);
const rewritten = zlib.zstdCompressSync(Buffer.from(lines.join("\n"), "utf8"));
const backupDir = path.join(home, "backups", "session-cwd-migration");
const backup = path.join(
  backupDir,
  `${sessionId}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.zstd`,
);

console.log(
  JSON.stringify(
    {
      sessionId,
      from: source.file,
      to: targetFile,
      cwd: `${fromCwd} -> ${toCwd}`,
      bytes: compressed.byteLength,
    },
    null,
    2,
  ),
);

if (!apply) {
  console.log("dry-run：未写入。确认 DSH 已完全退出后加 --apply。");
  process.exit(0);
}

fs.mkdirSync(targetSessionDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(source.file, backup);
fs.writeFileSync(targetFile, rewritten);
if (args.includes("--remove-old")) {
  fs.rmSync(path.dirname(source.file), { recursive: true, force: true });
  console.log("旧会话目录已删除（--remove-old）。");
} else {
  console.log("旧会话目录保留，确认新会话可打开后可手动删除。");
}

console.log(`已迁移。旧文件备份：${backup}`);
console.log("现在重新启动 DSH，并从工作区 D:\\dsh-ai-studio 打开该会话。");
