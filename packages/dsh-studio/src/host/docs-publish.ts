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
