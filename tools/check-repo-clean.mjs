import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const forbidden = [
  "AIgame",
  "MOBA",
  "2.5D",
  "replay-verify",
  "task-a559749c",
  "3e42d66",
  "AI 工作台",
];

const self = "tools/check-repo-clean.mjs";
const files = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
  windowsHide: true,
})
  .split("\0")
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => file !== self)
  .filter((file) => !/\.(png|jpg|jpeg|webp|gif|tgz|zip|ico)$/i.test(file));

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const word of forbidden) {
    if (text.includes(word)) {
      hits.push(`${file}: ${word}`);
    }
  }
}

if (hits.length > 0) {
  console.error("dsh-ai-studio 仓库包含不该共享的项目内容：");
  for (const hit of hits) console.error(`- ${hit}`);
  console.error("请删除或改成通用示例后重试。");
  process.exit(1);
}
console.log(`clean: ${String(files.length)} tracked text files have no project-specific markers`);
