import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Decision } from "../shared/types.js";
import type { StudioStore } from "./store.js";
import { StudioStoreError } from "./store.js";

/**
 * Writes an approved ADR draft into docs/adr with the next available number.
 * The draft is only written when the Owner explicitly calls this endpoint.
 */
export class AdrService {
  private readonly store: StudioStore;

  constructor(store: StudioStore) {
    this.store = store;
  }

  async write(decisionId: string): Promise<Decision> {
    const { decision, project } = await this.store.getDecisionAdrContext(
      decisionId,
    );
    if (decision.adrPath !== null) return decision;
    if (decision.adrDraft === null) {
      throw new StudioStoreError(
        "adr_draft_required",
        "这条决策还没有 ADR 草稿；只有批准后的不可逆决策才会生成",
        409,
      );
    }
    if (project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "项目还没有绑定代码仓库，无法写入 ADR",
        409,
      );
    }
    const dir = path.join(project.repoPath, "docs", "adr");
    await mkdir(dir, { recursive: true });
    const files = await readdir(dir);
    let next = 1;
    for (const file of files) {
      const match = /^(\d{4})-/.exec(file);
      if (match !== null) {
        next = Math.max(next, Number(match[1]) + 1);
      }
    }
    const name = `${String(next).padStart(4, "0")}-${decision.id}.md`;
    const relative = `docs/adr/${name}`;
    await writeFile(path.join(dir, name), decision.adrDraft, "utf8");
    return this.store.setDecisionAdrPath(decision.id, relative);
  }
}
