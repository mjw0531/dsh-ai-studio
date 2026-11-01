import type { ChangeEvent } from "react";

import type { StudioClient } from "./api.js";
import { StudioClientError } from "./api.js";
import type {
  AddWorkshopNoteInput,
  AgentExecutor,
  ApproveStageGateInput,
  BootstrapResponse,
  CreateDecisionInput,
  CreateMergeProposalInput,
  CreateModuleInput,
  CreateProjectFromTemplateInput,
  CreateProjectInput,
  CreatePrototypeDemoInput,
  CreateProviderProfileInput,
  CreateRoleInput,
  CreateTaskInput,
  CreateTriggerInput,
  CreateWorkshopInput,
  DecideDecisionInput,
  MergeProposal,
  Decision,
  ProjectDoc,
  ProjectStage,
  PrototypeDemo,
  ProviderProbeResult,
  ProviderProfile,
  Role,
  StageGate,
  Task,
  TaskStatus,
  Trigger,
  UpdateProjectInput,
  UpdatePrototypeDemoInput,
  UpdateProviderProfileInput,
  UpdateStageGateInput,
  UpdateTriggerRulesInput,
  Workshop,
} from "../shared/types.js";
import { TASK_STATUS_LABELS } from "../shared/types.js";

export type ModalState =
  | { kind: "task" }
  | { kind: "role" }
  | { kind: "project" }
  | { kind: "decision" }
  | { kind: "module" }
  | { kind: "repo" }
  | null;

export type ToastState = { kind: "ok" | "error"; text: string } | null;

export interface StudioActionsContext {
  client: StudioClient | null;
  data: BootstrapResponse | null;
  load: (projectId?: string, silent?: boolean) => Promise<void>;
  run: (action: () => Promise<unknown>, successMessage: string) => Promise<boolean>;
  setModal: (state: ModalState) => void;
  setToast: (state: ToastState) => void;
  setError: (message: string | null) => void;
}

export function createStudioActions({
  client,
  data,
  load,
  run,
  setModal,
  setToast,
  setError,
}: StudioActionsContext) {
  const project = data?.project ?? null;
  const createTask = async (input: CreateTaskInput): Promise<void> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createTask(input);
      },
      "任务已创建",
    );
    if (ok) setModal(null);
  };

  const createRole = async (input: CreateRoleInput): Promise<void> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createRole(input);
      },
      "角色已创建",
    );
    if (ok) setModal(null);
  };

  const updateRoleExecutor = async (
    roleId: string,
    executor: AgentExecutor,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.updateRole(roleId, { executor });
      },
      "执行器已更新",
    );
  };

  const updateRoleProvider = async (
    roleId: string,
    providerProfileId: string | null,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.updateRole(roleId, { providerProfileId });
      },
      "Provider Profile 已更新",
    );
  };

  const createProviderProfile = async (
    input: CreateProviderProfileInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.createProviderProfile(input);
      },
      "Provider Profile 已创建",
    );
  };

  const updateProviderProfile = async (
    profileId: string,
    input: UpdateProviderProfileInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.updateProviderProfile(profileId, input);
      },
      "Provider Profile 已更新",
    );
  };

  const deleteProviderProfile = async (
    profileId: string,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.deleteProviderProfile(profileId);
      },
      "Provider Profile 已删除",
    );
  };

  const probeProviderProfile = async (
    profileId: string,
  ): Promise<ProviderProbeResult> => {
    if (client === null) throw new Error("插件尚未连接");
    return client.probeProviderProfile(profileId);
  };

  const reassignProviderProfile = async (
    fromProfileId: string,
    toProfileId: string,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.reassignProviderProfile(fromProfileId, toProfileId);
      },
      "角色已改绑到备用 Profile",
    );
  };

  const createProject = async (input: CreateProjectInput): Promise<void> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createProject(input);
      },
      "项目已创建",
    );
    if (ok) setModal(null);
  };

  const createProjectFromTemplate = async (
    input: CreateProjectFromTemplateInput,
  ): Promise<void> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createProjectFromTemplate(input);
      },
      "项目已从模板创建",
    );
    if (ok) setModal(null);
  };

  const updateProjectRepo = async (repoPath: string): Promise<void> => {
    const ok = await run(
      async () => {
        if (client === null || data === null || data.project === null) return;
        await client.updateProject(data.project.id, {
          repoPath: repoPath.trim() || null,
        });
      },
      "项目仓库已更新",
    );
    if (ok) setModal(null);
  };

  const updateProjectDocs = async (
    docs: {
      prdPath: string | null;
      invariantsPath: string | null;
      modulesPath: string | null;
    },
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null || data === null || data.project === null) return;
        await client.updateProject(data.project.id, docs);
      },
      "项目文档路径已更新",
    );
  };

  const loadStageGate = async (stage: ProjectStage): Promise<void> => {
    await run(
      async () => {
        if (client === null || data === null || data.project === null) return;
        await client.getStageGate(data.project.id, stage);
      },
      "阶段门禁已准备",
    );
  };

  const saveStageGate = async (
    stage: ProjectStage,
    input: UpdateStageGateInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null || data === null || data.project === null) return;
        await client.updateStageGate(data.project.id, stage, input);
      },
      "阶段门禁草稿已保存",
    );
  };

  const approveStageGate = async (
    stage: ProjectStage,
    waiverReason: string,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null || data === null || data.project === null) return;
        await client.approveStageGate(data.project.id, stage, {
          waiverReason: waiverReason.trim() || undefined,
        });
      },
      "阶段已批准，项目进入下一阶段",
    );
  };

  const rejectStageGate = async (
    stage: ProjectStage,
    note: string,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null || data === null || data.project === null) return;
        await client.rejectStageGate(data.project.id, stage, note);
      },
      "阶段门禁已拒绝",
    );
  };

  const ingestTrigger = async (
    input: CreateTriggerInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.ingestTrigger(input);
      },
      "事件已进入收件箱",
    );
  };

  const acceptTrigger = async (trigger: Trigger): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.acceptTrigger(trigger.id, {
          acceptance: ["人工确认触发内容与验收标准"],
        });
      },
      "触发事件已转为任务",
    );
  };

  const ignoreTrigger = async (trigger: Trigger): Promise<void> => {
    const note = window.prompt("忽略理由（可选）：", "");
    if (note === null) return;
    await run(
      async () => {
        if (client === null) return;
        await client.ignoreTrigger(trigger.id, note);
      },
      "触发事件已忽略",
    );
  };

  const updateTriggerRules = async (
    projectId: string,
    input: UpdateTriggerRulesInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.updateTriggerRules(projectId, input);
      },
      "Webhook 规则已更新",
    );
  };

  const createPrototypeDemo = async (
    input: CreatePrototypeDemoInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null || data?.project === null || data?.project === undefined) return;
        await client.createPrototypeDemo(data.project.id, input);
      },
      "Demo 记录已保存",
    );
  };

  const updatePrototypeDemo = async (
    demoId: string,
    input: UpdatePrototypeDemoInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null || data?.project === null || data?.project === undefined) return;
        await client.updatePrototypeDemo(data.project.id, demoId, input);
      },
      "Demo 记录已更新",
    );
  };

  const createWorkshop = async (
    input: CreateWorkshopInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.createWorkshop(input);
      },
      "研讨会已创建",
    );
  };

  const addWorkshopNote = async (
    workshopId: string,
    input: AddWorkshopNoteInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.addWorkshopNote(workshopId, input);
      },
      "研讨会意见已记录",
    );
  };

  const synthesizeWorkshop = async (
    workshopId: string,
    synthesis: string,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.synthesizeWorkshop(workshopId, synthesis);
      },
      "研讨会已汇总",
    );
  };

  const decideWorkshop = async (
    workshopId: string,
    decision: string,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.decideWorkshop(workshopId, decision);
      },
      "Owner 决策已记录",
    );
  };

  const runWorkshop = async (workshopId: string): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.runWorkshop(workshopId);
      },
      "AI 独立评审已完成",
    );
  };

  const summarizeWorkshopAi = async (
    workshopId: string,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.summarizeWorkshop(workshopId);
      },
      "AI 汇总草稿已生成",
    );
  };

  const readProjectDoc = async (
    docPath: string,
  ): Promise<ProjectDoc | null> => {
    if (client === null) return null;
    try {
      return await client.readProjectDoc(docPath);
    } catch (error) {
      setToast({
        kind: "error",
        text:
          error instanceof StudioClientError
            ? error.message
            : "文档读取失败",
      });
      return null;
    }
  };

  const createModule = async (
    input: CreateModuleInput,
  ): Promise<boolean> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createModule(input);
      },
      "模块已创建",
    );
    if (ok) setModal(null);
    return ok;
  };

  const transitionTask = async (
    task: Task,
    status: TaskStatus,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.transitionTask(task.id, status);
      },
      status === "done" ? "任务已验收完成" : `任务已切换到「${TASK_STATUS_LABELS[status]}」`,
    );
  };

  const toggleAcceptance = async (
    task: Task,
    acceptanceId: string,
  ): Promise<void> => {
    const acceptance = task.acceptance.map((item) =>
      item.id === acceptanceId ? { ...item, done: !item.done } : item,
    );
    await run(
      async () => {
        if (client === null) return;
        await client.updateTask(task.id, { acceptance });
      },
      "验收项已更新",
    );
  };

  const toggleDocsSynced = async (task: Task): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.updateTask(task.id, {
          docsSynced: !task.docsSynced,
        });
      },
      task.docsSynced ? "已取消文档同步标记" : "已标记文档同步",
    );
  };

  const addEvidence = async (task: Task, text: string): Promise<boolean> => {
    const evidence = [
      ...task.evidence,
      {
        id: "",
        text,
        createdAt: new Date().toISOString(),
      },
    ];
    return run(
      async () => {
        if (client === null) return;
        await client.updateTask(task.id, { evidence });
      },
      "证据已记录",
    );
  };

  const dispatchTask = async (task: Task): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.dispatchTask(task.id);
      },
      "已派单，Agent 开始分析；完成后会自动刷回执",
    );
  };

  const verifyTask = async (
    task: Task,
    command: string,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.verifyTask(task.id, command);
      },
      "验证命令已执行",
    );
  };

  const reviewTask = async (task: Task): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.reviewTask(task.id);
      },
      "独立评审已完成",
    );
  };

  const createDecision = async (
    input: CreateDecisionInput,
  ): Promise<boolean> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createDecision(input);
      },
      "决策已进入决策台",
    );
    if (ok) setModal(null);
    return ok;
  };

  const decideDecision = async (
    decision: Decision,
    input: DecideDecisionInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.decideDecision(decision.id, input);
      },
      input.status === "approved" ? "决策已批准" : "决策已拒绝",
    );
  };

  const createMerge = async (
    task: Task,
    input: CreateMergeProposalInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.createMergeProposal(task.id, input);
      },
      "合并提案已提交",
    );
  };

  const approveMerge = async (
    proposal: MergeProposal,
    note?: string,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.approveMergeProposal(proposal.id, note);
      },
      "合并提案已批准",
    );
  };

  const rejectMerge = async (
    proposal: MergeProposal,
    note: string,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.rejectMergeProposal(proposal.id, note);
      },
      "合并提案已打回",
    );
  };

  const completeMerge = async (
    proposal: MergeProposal,
    mergeCommit?: string,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.completeMergeProposal(proposal.id, mergeCommit);
      },
      "已记录合并完成",
    );
  };

  const executeMerge = async (
    proposal: MergeProposal,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.executeMerge(proposal.id);
      },
      "Git 合并完成，已记录 merge commit",
    );
  };

  const rollbackMerge = async (
    proposal: MergeProposal,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.rollbackMerge(proposal.id);
      },
      "已回滚合并并记录 revert commit",
    );
  };

  const exportData = async (): Promise<void> => {
    if (client === null) return;
    const data = await client.exportState();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studio-backup-${data.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined || client === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError("导入失败：文件不是合法 JSON");
      return;
    }
    const envelope =
      typeof parsed === "object" && parsed !== null && "state" in parsed
        ? (parsed as { state: unknown }).state
        : parsed;
    if (
      !window.confirm(
        "导入会覆盖当前 Studio 数据；Host 会先把原文件备份到 studio.json.pre-import-*。确定继续吗？",
      )
    ) {
      return;
    }
    await run(
      async () => {
        await client.importState(envelope);
        await load(undefined, true);
      },
      "数据已导入；原文件已备份",
    );
  };

  const exportBundle = async (): Promise<void> => {
    if (client === null || data?.project === null || data?.project === undefined)
      return;
    const { filename, blob } = await client.exportProjectBundle(
      data.project.id,
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBundle = async (): Promise<void> => {
    if (client === null) return;
    const archivePath = window.prompt(
      "输入项目包 tar.gz 的绝对路径：",
      "",
    );
    if (archivePath === null || archivePath.trim() === "") return;
    const targetPath = window.prompt(
      "输入新仓库目录（必须为空或不存在）：",
      "",
    );
    if (targetPath === null || targetPath.trim() === "") return;
    await run(
      async () => {
        await client.importProjectBundle(
          archivePath.trim(),
          targetPath.trim(),
        );
        await load(undefined, true);
      },
      "项目包已导入并重绑仓库",
    );
  };

  const saveCompany = async (name: string): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.updateCompanyName(name);
        await load(undefined, true);
      },
      "工作室名称已更新",
    );
  };

  const writeAdr = async (decision: Decision): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.writeAdr(decision.id);
      },
      "ADR 已写入 docs/adr",
    );
  };

  return {
    createTask,
    createRole,
    updateRoleExecutor,
    updateRoleProvider,
    createProviderProfile,
    updateProviderProfile,
    deleteProviderProfile,
    probeProviderProfile,
    reassignProviderProfile,
    createProject,
    createProjectFromTemplate,
    updateProjectRepo,
    updateProjectDocs,
    loadStageGate,
    saveStageGate,
    approveStageGate,
    rejectStageGate,
    ingestTrigger,
    acceptTrigger,
    ignoreTrigger,
    updateTriggerRules,
    createPrototypeDemo,
    updatePrototypeDemo,
    createWorkshop,
    addWorkshopNote,
    synthesizeWorkshop,
    decideWorkshop,
    runWorkshop,
    summarizeWorkshopAi,
    readProjectDoc,
    createModule,
    transitionTask,
    toggleAcceptance,
    toggleDocsSynced,
    addEvidence,
    dispatchTask,
    verifyTask,
    reviewTask,
    createDecision,
    decideDecision,
    createMerge,
    approveMerge,
    rejectMerge,
    completeMerge,
    executeMerge,
    rollbackMerge,
    exportData,
    importData,
    exportBundle,
    importBundle,
    saveCompany,
    writeAdr,
  };
}
