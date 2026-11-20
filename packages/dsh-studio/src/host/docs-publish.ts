import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StudioStore } from "./store.js";
import { StudioStoreError } from "./store.js";

const SKELETON: Array<{ path: string; content: string }> = [
  {
    path: "docs/PRD.md",
    content: `# PRD\n\n> 需求条目以 \`R-\` 编号开头，例如：\n- R-001 玩家可以移动\n\n## 未决问题\n`,
  },
  {
    path: "docs/ARCHITECTURE.md",
    content: "# 架构\n\n## 模块边界\n\n## 数据流\n\n## 风险\n",
  },
  {
    path: "docs/INVARIANTS.md",
    content: "# 不变量\n\n1. 所有写入必须可恢复。\n",
  },
  {
    path: "docs/modules/.gitkeep",
    content: "",
  },
  {
    path: "docs/adr/.gitkeep",
    content: "",
  },
  {
    path: "docs/meetings/.gitkeep",
    content: "",
  },
  {
    path: "docs/plan/milestones/.gitkeep",
    content: "",
  },
  {
    path: "docs/plan/tasks/.gitkeep",
    content: "",
  },
];

export interface PublishedDoc {
  path: string;
  written: boolean;
}

export interface RequirementsIndex {
  path: string;
  items: Array<{ id: string; title: string; line: number }>;
}

export class DocsPublisherService {
  private readonly store: StudioStore;

  constructor(store: StudioStore) {
    this.store = store;
  }

  private async repo(): Promise<{ root: string; prdPath: string }> {
    const data = await this.store.bootstrap();
    if (data.project === null || data.project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "项目还没有绑定仓库，不能发布规划文档",
        409,
      );
    }
    return {
      root: path.resolve(data.project.repoPath),
      prdPath: data.project.prdPath ?? "docs/PRD.md",
    };
  }

  async initializeSkeleton(): Promise<{
    files: PublishedDoc[];
    commit: string | null;
  }> {
    const { root } = await this.repo();
    const files: PublishedDoc[] = [];
    for (const item of SKELETON) {
      const absolute = path.resolve(root, item.path);
      await mkdir(path.dirname(absolute), { recursive: true });
      try {
        await writeFile(absolute, item.content, { encoding: "utf8", flag: "wx" });
        files.push({ path: item.path, written: true });
      } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") throw error;
        files.push({ path: item.path, written: false });
      }
    }
    const written = files.filter((item) => item.written).map((item) => item.path);
    const commit = written.length === 0 ? null : this.commit(root, written, "docs: initialize project planning skeleton");
    return { files, commit };
  }

  async publish(
    files: Array<{ path: string; content: string }>,
  ): Promise<{ commit: string | null; files: PublishedDoc[] }> {
    const { root } = await this.repo();
    if (files.length === 0) {
      throw new StudioStoreError("invalid_input", "没有要发布的文档", 400);
    }
    const normalized: Array<{ path: string; content: string }> = [];
    for (const file of files) {
      const relative = file.path.replaceAll("\\", "/").replace(/^\/+/u, "");
      if (!relative.startsWith("docs/") || relative.includes("..")) {
        throw new StudioStoreError(
          "invalid_doc_path",
          "只允许发布 docs/ 下的文档",
          400,
        );
      }
      const dirty = this.git(root, ["status", "--porcelain", "--", relative]);
      if (dirty !== "") {
        throw new StudioStoreError(
          "doc_dirty",
          `目标文档有未提交改动：${relative}；请先处理本地改动`,
          409,
        );
      }
      normalized.push({ path: relative, content: file.content });
    }
    const written: string[] = [];
    for (const file of normalized) {
      const absolute = path.resolve(root, file.path);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, file.content, "utf8");
      written.push(file.path);
    }
    const commit = this.commit(root, written, "docs: publish planning documents");
    return {
      commit,
      files: written.map((file) => ({ path: file, written: true })),
    };
  }

  async syncModules(): Promise<{ commit: string | null; files: PublishedDoc[] }> {
    const data = await this.store.bootstrap();
    if (data.modules.length === 0) {
      throw new StudioStoreError("modules_empty", "没有可同步的模块", 409);
    }
    const files = data.modules.map((module) => {
      const slug = module.name
        .trim()
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/^-+|-+$/gu, "") || module.id;
      return {
        path: `docs/modules/${slug}.md`,
        content: [
          `# 模块：${module.name}`,
          "",
          "> 由 Studio 从模块契约生成；修改契约请通过 Studio。",
          "",
          `## 职责

${module.responsibility || "（未填写）"}`,
          "",
          `## 依赖

${module.dependsOn.join("、") || "（无）"}`,
          "",
          `## 允许路径

${module.allowedPaths.join("\n") || "（未限制）"}`,
          "",
          `## 禁止路径

${module.forbiddenPaths.join("\n") || "（无）"}`,
          "",
          `## 契约文件

${module.contractPath ?? "（未绑定）"}`,
        ].join("\n"),
      };
    });
    const published = await this.publish(files);
    return { commit: published.commit, files: published.files };
  }

  async syncMilestones(): Promise<{ commit: string | null; files: PublishedDoc[] }> {
    const data = await this.store.bootstrap();
    if (data.milestones.length === 0) {
      throw new StudioStoreError("milestones_empty", "没有可同步的里程碑", 409);
    }
    const files = data.milestones.map((milestone) => {
      const slug = milestone.title
        .trim()
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/^-+|-+$/gu, "") || milestone.id;
      const tasks = data.tasks.filter(
        (task) => task.milestoneId === milestone.id,
      );
      const done = tasks.filter((task) => task.status === "done").length;
      const acceptanceTotal = tasks.reduce(
        (sum, task) => sum + task.acceptance.length,
        0,
      );
      const acceptanceDone = tasks.reduce(
        (sum, task) => sum + task.acceptance.filter((item) => item.done).length,
        0,
      );
      return {
        path: `docs/plan/milestones/${slug}.md`,
        content: [
          `# 里程碑：${milestone.title}`,
          "",
          `- 状态：${milestone.status}`,
          `- 任务覆盖：${done}/${tasks.length}`,
          `- 验收覆盖：${acceptanceDone}/${acceptanceTotal}`,
          "",
          "## 目标",
          "",
          milestone.goal || "（未填写）",
          "",
          "## 任务",
          "",
          tasks.length === 0
            ? "（暂无任务）"
            : tasks
                .map(
                  (task) =>
                    `- [${task.status === "done" ? "x" : " "}] ${task.number} ${task.title}`,
                )
                .join("\n"),
        ].join("\n"),
      };
    });
    const published = await this.publish(files);
    return { commit: published.commit, files: published.files };
  }

  async diff(relativePath: string): Promise<{
    path: string;
    dirty: boolean;
    diff: string;
  }> {
    const { root } = await this.repo();
    const relative = relativePath
      .replaceAll("\\", "/")
      .replace(/^\/+/, "");
    if (!relative.startsWith("docs/") || relative.includes("..")) {
      throw new StudioStoreError("invalid_doc_path", "只允许查看 docs/ 下的文档", 400);
    }
    const diff = this.git(root, ["diff", "--", relative]);
    const status = this.git(root, ["status", "--porcelain", "--", relative]);
    return {
      path: relative,
      dirty: diff !== "" || status !== "",
      diff: (diff || status).slice(0, 12_000),
    };
  }

  async history(
    relativePath: string,
    limit = 10,
  ): Promise<
    Array<{ sha: string; shortSha: string; date: string; subject: string }>
  > {
    const { root } = await this.repo();
    const relative = this.docPath(relativePath);
    const output = this.git(root, [
      "log",
      `--max-count=${String(Math.max(1, Math.min(limit, 20)))}`,
      "--format=%H%x09%h%x09%cI%x09%s",
      "--",
      relative,
    ]);
    if (output === "") return [];
    return output.split(/\r?\n/u).map((line) => {
      const [sha = "", shortSha = "", date = "", ...subject] = line.split("\t");
      return { sha, shortSha, date, subject: subject.join("\t") };
    });
  }

  async compare(
    relativePath: string,
    from: string,
    to: string,
  ): Promise<{ path: string; from: string; to: string; diff: string }> {
    const { root } = await this.repo();
    const relative = this.docPath(relativePath);
    for (const ref of [from, to]) {
      if (!/^[a-f0-9]{7,40}$/u.test(ref)) {
        throw new StudioStoreError("invalid_commit", "commit 必须是 sha", 400);
      }
    }
    const diff = this.git(root, ["diff", from, to, "--", relative]);
    return { path: relative, from, to, diff: diff.slice(0, 12_000) };
  }

  private docPath(relativePath: string): string {
    const relative = relativePath
      .replaceAll("\\", "/")
      .replace(/^\/+/, "");
    if (!relative.startsWith("docs/") || relative.includes("..")) {
      throw new StudioStoreError("invalid_doc_path", "只允许查看 docs/ 下的文档", 400);
    }
    return relative;
  }

  async requirements(): Promise<RequirementsIndex> {
    const { root, prdPath } = await this.repo();
    const relative = prdPath.replaceAll("\\", "/").replace(/^\/+/u, "");
    const content = await readFile(path.resolve(root, relative), "utf8").catch(
      () => "",
    );
    const items: RequirementsIndex["items"] = [];
    content.split(/\r?\n/u).forEach((line, index) => {
      const match = /^\s*(?:[-*]\s*)?(R-\d+)\s*[:：-]?\s*(.*)$/u.exec(line);
      if (match !== null) {
        items.push({
          id: match[1] ?? "",
          title: (match[2] ?? "").trim(),
          line: index + 1,
        });
      }
    });
    return { path: relative, items };
  }

  private commit(root: string, paths: string[], message: string): string | null {
    this.git(root, ["add", "--", ...paths]);
    const staged = this.git(root, ["diff", "--cached", "--name-only", "--", ...paths]);
    if (staged === "") return null;
    this.git(root, ["commit", "-m", message, "--", ...paths]);
    return this.git(root, ["rev-parse", "HEAD"]) || null;
  }

  private git(root: string, args: string[]): string {
    try {
      return execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20_000,
      }).trim();
    } catch (error) {
      const stderr =
        error instanceof Error && "stderr" in error
          ? String((error as { stderr?: unknown }).stderr ?? "")
          : String(error);
      throw new StudioStoreError(
        "git_failed",
        `git ${args.join(" ")} 失败：${stderr.slice(0, 800)}`,
        500,
      );
    }
  }
}
