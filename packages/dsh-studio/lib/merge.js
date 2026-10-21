// src/host/merge.ts
import { execFile } from "node:child_process";

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

// src/host/merge.ts
function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: 12e4,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          const failure = error;
          reject(
            new StudioStoreError(
              "git_failed",
              [
                `git ${args.join(" ")} \u5931\u8D25`,
                (failure.stderr ?? stderr ?? "").trim(),
                (failure.stdout ?? stdout ?? "").trim()
              ].filter(Boolean).join("\uFF1A"),
              409
            )
          );
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}
var GitMergeService = class {
  store;
  constructor(store) {
    this.store = store;
  }
  async execute(proposalId) {
    const { proposal, project } = await this.store.getMergeContext(
      proposalId
    );
    if (proposal.status !== "approved") {
      throw new StudioStoreError(
        "merge_not_approved",
        "\u53EA\u6709\u5DF2\u6279\u51C6\u7684\u5408\u5E76\u63D0\u6848\u53EF\u4EE5\u6267\u884C Git \u5408\u5E76",
        409
      );
    }
    if (project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "\u9879\u76EE\u8FD8\u6CA1\u6709\u7ED1\u5B9A\u4EE3\u7801\u4ED3\u5E93",
        409
      );
    }
    const repo = project.repoPath;
    const current = (await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
    if (current !== proposal.base) {
      throw new StudioStoreError(
        "merge_wrong_branch",
        `\u5F53\u524D\u5206\u652F\u662F\u300C${current}\u300D\uFF0C\u8BF7\u5148\u5207\u5230\u57FA\u7840\u5206\u652F\u300C${proposal.base}\u300D\u518D\u6267\u884C\u5408\u5E76`,
        409
      );
    }
    const dirty = (await git(repo, ["status", "--porcelain"])).stdout.trim();
    if (dirty !== "") {
      throw new StudioStoreError(
        "merge_dirty",
        "\u5DE5\u4F5C\u533A\u4E0D\u5E72\u51C0\uFF1B\u8BF7\u5148\u63D0\u4EA4\u6216\u6E05\u7406\u6539\u52A8\u518D\u5408\u5E76",
        409
      );
    }
    try {
      await git(repo, ["rev-parse", "--verify", proposal.branch]);
    } catch {
      throw new StudioStoreError(
        "merge_branch_missing",
        `\u627E\u4E0D\u5230\u4EFB\u52A1\u5206\u652F\u300C${proposal.branch}\u300D`,
        409
      );
    }
    const inProgress = await git(repo, [
      "rev-parse",
      "-q",
      "--verify",
      "MERGE_HEAD"
    ]).then(
      () => true,
      () => false
    );
    if (inProgress) {
      throw new StudioStoreError(
        "merge_in_progress",
        "\u4ED3\u5E93\u91CC\u5DF2\u6709\u672A\u5B8C\u6210\u7684\u5408\u5E76\uFF1B\u8BF7\u5148\u5904\u7406\u6216 abort",
        409
      );
    }
    try {
      await git(repo, [
        "merge",
        "--no-ff",
        proposal.branch,
        "-m",
        `Merge ${proposal.branch} into ${proposal.base} (Studio ${proposal.id})`
      ]);
    } catch (error) {
      try {
        await git(repo, ["merge", "--abort"]);
      } catch {
      }
      throw error;
    }
    const commit = (await git(repo, ["rev-parse", "HEAD"])).stdout.trim();
    return this.store.completeMergeProposal(proposalId, commit);
  }
};
export {
  GitMergeService
};
