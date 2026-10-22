// src/host/adr.ts
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

// src/host/store.ts
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

// src/host/adr.ts
var AdrService = class {
  store;
  constructor(store) {
    this.store = store;
  }
  async write(decisionId) {
    const { decision, project } = await this.store.getDecisionAdrContext(
      decisionId
    );
    if (decision.adrPath !== null) return decision;
    if (decision.adrDraft === null) {
      throw new StudioStoreError(
        "adr_draft_required",
        "\u8FD9\u6761\u51B3\u7B56\u8FD8\u6CA1\u6709 ADR \u8349\u7A3F\uFF1B\u53EA\u6709\u6279\u51C6\u540E\u7684\u4E0D\u53EF\u9006\u51B3\u7B56\u624D\u4F1A\u751F\u6210",
        409
      );
    }
    if (project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "\u9879\u76EE\u8FD8\u6CA1\u6709\u7ED1\u5B9A\u4EE3\u7801\u4ED3\u5E93\uFF0C\u65E0\u6CD5\u5199\u5165 ADR",
        409
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
};
export {
  AdrService
};
