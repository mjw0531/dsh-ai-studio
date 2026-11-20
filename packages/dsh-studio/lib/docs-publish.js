// src/host/docs-publish.ts
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// src/host/store/core.ts
var StudioStoreError = class extends Error {
  code;
  status;
  constructor(code, message, status = 400) {
    super(message);
    this.name = "StudioStoreError";
    this.code = code;
    this.status = status;
  }
};

// src/host/docs-publish.ts
var SKELETON = [
  {
    path: "docs/PRD.md",
    content: `# PRD

> \u9700\u6C42\u6761\u76EE\u4EE5 \`R-\` \u7F16\u53F7\u5F00\u5934\uFF0C\u4F8B\u5982\uFF1A
- R-001 \u73A9\u5BB6\u53EF\u4EE5\u79FB\u52A8

## \u672A\u51B3\u95EE\u9898
`
  },
  {
    path: "docs/ARCHITECTURE.md",
    content: "# \u67B6\u6784\n\n## \u6A21\u5757\u8FB9\u754C\n\n## \u6570\u636E\u6D41\n\n## \u98CE\u9669\n"
  },
  {
    path: "docs/INVARIANTS.md",
    content: "# \u4E0D\u53D8\u91CF\n\n1. \u6240\u6709\u5199\u5165\u5FC5\u987B\u53EF\u6062\u590D\u3002\n"
  },
  {
    path: "docs/modules/.gitkeep",
    content: ""
  },
  {
    path: "docs/adr/.gitkeep",
    content: ""
  },
  {
    path: "docs/meetings/.gitkeep",
    content: ""
  },
  {
    path: "docs/plan/milestones/.gitkeep",
    content: ""
  },
  {
    path: "docs/plan/tasks/.gitkeep",
    content: ""
  }
];
var DocsPublisherService = class {
  store;
  constructor(store) {
    this.store = store;
  }
  async repo() {
    const data = await this.store.bootstrap();
    if (data.project === null || data.project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "\u9879\u76EE\u8FD8\u6CA1\u6709\u7ED1\u5B9A\u4ED3\u5E93\uFF0C\u4E0D\u80FD\u53D1\u5E03\u89C4\u5212\u6587\u6863",
        409
      );
    }
    return {
      root: path.resolve(data.project.repoPath),
      prdPath: data.project.prdPath ?? "docs/PRD.md"
    };
  }
  async initializeSkeleton() {
    const { root } = await this.repo();
    const files = [];
    for (const item of SKELETON) {
      const absolute = path.resolve(root, item.path);
      await mkdir(path.dirname(absolute), { recursive: true });
      try {
        await writeFile(absolute, item.content, { encoding: "utf8", flag: "wx" });
        files.push({ path: item.path, written: true });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        files.push({ path: item.path, written: false });
      }
    }
    const written = files.filter((item) => item.written).map((item) => item.path);
    const commit = written.length === 0 ? null : this.commit(root, written, "docs: initialize project planning skeleton");
    return { files, commit };
  }
  async publish(files) {
    const { root } = await this.repo();
    if (files.length === 0) {
      throw new StudioStoreError("invalid_input", "\u6CA1\u6709\u8981\u53D1\u5E03\u7684\u6587\u6863", 400);
    }
    const normalized = [];
    for (const file of files) {
      const relative = file.path.replaceAll("\\", "/").replace(/^\/+/u, "");
      if (!relative.startsWith("docs/") || relative.includes("..")) {
        throw new StudioStoreError(
          "invalid_doc_path",
          "\u53EA\u5141\u8BB8\u53D1\u5E03 docs/ \u4E0B\u7684\u6587\u6863",
          400
        );
      }
      const dirty = this.git(root, ["status", "--porcelain", "--", relative]);
      if (dirty !== "") {
        throw new StudioStoreError(
          "doc_dirty",
          `\u76EE\u6807\u6587\u6863\u6709\u672A\u63D0\u4EA4\u6539\u52A8\uFF1A${relative}\uFF1B\u8BF7\u5148\u5904\u7406\u672C\u5730\u6539\u52A8`,
          409
        );
      }
      normalized.push({ path: relative, content: file.content });
    }
    const written = [];
    for (const file of normalized) {
      const absolute = path.resolve(root, file.path);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, file.content, "utf8");
      written.push(file.path);
    }
    const commit = this.commit(root, written, "docs: publish planning documents");
    return {
      commit,
      files: written.map((file) => ({ path: file, written: true }))
    };
  }
  async syncModules() {
    const data = await this.store.bootstrap();
    if (data.modules.length === 0) {
      throw new StudioStoreError("modules_empty", "\u6CA1\u6709\u53EF\u540C\u6B65\u7684\u6A21\u5757", 409);
    }
    const files = data.modules.map((module) => {
      const slug = module.name.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/gu, "") || module.id;
      return {
        path: `docs/modules/${slug}.md`,
        content: [
          `# \u6A21\u5757\uFF1A${module.name}`,
          "",
          "> \u7531 Studio \u4ECE\u6A21\u5757\u5951\u7EA6\u751F\u6210\uFF1B\u4FEE\u6539\u5951\u7EA6\u8BF7\u901A\u8FC7 Studio\u3002",
          "",
          `## \u804C\u8D23

${module.responsibility || "\uFF08\u672A\u586B\u5199\uFF09"}`,
          "",
          `## \u4F9D\u8D56

${module.dependsOn.join("\u3001") || "\uFF08\u65E0\uFF09"}`,
          "",
          `## \u5141\u8BB8\u8DEF\u5F84

${module.allowedPaths.join("\n") || "\uFF08\u672A\u9650\u5236\uFF09"}`,
          "",
          `## \u7981\u6B62\u8DEF\u5F84

${module.forbiddenPaths.join("\n") || "\uFF08\u65E0\uFF09"}`,
          "",
          `## \u5951\u7EA6\u6587\u4EF6

${module.contractPath ?? "\uFF08\u672A\u7ED1\u5B9A\uFF09"}`
        ].join("\n")
      };
    });
    const published = await this.publish(files);
    return { commit: published.commit, files: published.files };
  }
  async syncMilestones() {
    const data = await this.store.bootstrap();
    if (data.milestones.length === 0) {
      throw new StudioStoreError("milestones_empty", "\u6CA1\u6709\u53EF\u540C\u6B65\u7684\u91CC\u7A0B\u7891", 409);
    }
    const files = data.milestones.map((milestone) => {
      const slug = milestone.title.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/gu, "") || milestone.id;
      const tasks = data.tasks.filter(
        (task) => task.milestoneId === milestone.id
      );
      const done = tasks.filter((task) => task.status === "done").length;
      const acceptanceTotal = tasks.reduce(
        (sum, task) => sum + task.acceptance.length,
        0
      );
      const acceptanceDone = tasks.reduce(
        (sum, task) => sum + task.acceptance.filter((item) => item.done).length,
        0
      );
      return {
        path: `docs/plan/milestones/${slug}.md`,
        content: [
          `# \u91CC\u7A0B\u7891\uFF1A${milestone.title}`,
          "",
          `- \u72B6\u6001\uFF1A${milestone.status}`,
          `- \u4EFB\u52A1\u8986\u76D6\uFF1A${done}/${tasks.length}`,
          `- \u9A8C\u6536\u8986\u76D6\uFF1A${acceptanceDone}/${acceptanceTotal}`,
          "",
          "## \u76EE\u6807",
          "",
          milestone.goal || "\uFF08\u672A\u586B\u5199\uFF09",
          "",
          "## \u4EFB\u52A1",
          "",
          tasks.length === 0 ? "\uFF08\u6682\u65E0\u4EFB\u52A1\uFF09" : tasks.map(
            (task) => `- [${task.status === "done" ? "x" : " "}] ${task.number} ${task.title}`
          ).join("\n")
        ].join("\n")
      };
    });
    const published = await this.publish(files);
    return { commit: published.commit, files: published.files };
  }
  async diff(relativePath) {
    const { root } = await this.repo();
    const relative = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
    if (!relative.startsWith("docs/") || relative.includes("..")) {
      throw new StudioStoreError("invalid_doc_path", "\u53EA\u5141\u8BB8\u67E5\u770B docs/ \u4E0B\u7684\u6587\u6863", 400);
    }
    const diff = this.git(root, ["diff", "--", relative]);
    const status = this.git(root, ["status", "--porcelain", "--", relative]);
    return {
      path: relative,
      dirty: diff !== "" || status !== "",
      diff: (diff || status).slice(0, 12e3)
    };
  }
  async requirements() {
    const { root, prdPath } = await this.repo();
    const relative = prdPath.replaceAll("\\", "/").replace(/^\/+/u, "");
    const content = await readFile(path.resolve(root, relative), "utf8").catch(
      () => ""
    );
    const items = [];
    content.split(/\r?\n/u).forEach((line, index) => {
      const match = /^\s*(?:[-*]\s*)?(R-\d+)\s*[:：-]?\s*(.*)$/u.exec(line);
      if (match !== null) {
        items.push({
          id: match[1] ?? "",
          title: (match[2] ?? "").trim(),
          line: index + 1
        });
      }
    });
    return { path: relative, items };
  }
  commit(root, paths, message) {
    this.git(root, ["add", "--", ...paths]);
    const staged = this.git(root, ["diff", "--cached", "--name-only", "--", ...paths]);
    if (staged === "") return null;
    this.git(root, ["commit", "-m", message, "--", ...paths]);
    return this.git(root, ["rev-parse", "HEAD"]) || null;
  }
  git(root, args) {
    try {
      return execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 2e4
      }).trim();
    } catch (error) {
      const stderr = error instanceof Error && "stderr" in error ? String(error.stderr ?? "") : String(error);
      throw new StudioStoreError(
        "git_failed",
        `git ${args.join(" ")} \u5931\u8D25\uFF1A${stderr.slice(0, 800)}`,
        500
      );
    }
  }
};
export {
  DocsPublisherService
};
