// src/shared/dispatch-readiness.ts
function diagnoseDispatch(input) {
  const { task, project, roles, tasks } = input;
  const owner = roles.find((role) => role.id === task.ownerRoleId);
  const blockers = task.dependsOn.map((id) => tasks.find((item) => item.id === id)).filter((item) => item !== void 0 && item.status !== "done");
  const codeMode = project?.repoPath != null;
  const stageOk = !codeMode || project?.stage === "prototype" || project?.stage === "development";
  const checks = [
    {
      id: "status",
      label: "\u4EFB\u52A1\u5904\u4E8E\u5F85\u89C4\u5212\u6216\u53EF\u5F00\u59CB",
      ok: task.status === "backlog" || task.status === "ready",
      hint: "\u4ECE\u4EFB\u52A1\u72B6\u6001\u680F\u628A\u4EFB\u52A1\u63A8\u8FDB\u5230\u300C\u53EF\u5F00\u59CB\u300D\u3002"
    },
    {
      id: "owner",
      label: "\u5DF2\u6307\u5B9A\u8D1F\u8D23\u4EBA\u89D2\u8272",
      ok: task.ownerRoleId !== null && owner !== void 0,
      hint: "\u5728\u4EFB\u52A1\u7F16\u8F91\u91CC\u9009\u62E9\u8D1F\u8D23\u4EBA\u89D2\u8272\u3002"
    },
    {
      id: "dependencies",
      label: "\u524D\u7F6E\u4EFB\u52A1\u5DF2\u5B8C\u6210",
      ok: blockers.length === 0,
      hint: blockers.length === 0 ? "" : `\u5148\u5B8C\u6210\uFF1A${blockers.map((item) => `${item.number} ${item.title}`).join("\uFF1B")}`
    },
    {
      id: "fix-plan",
      label: "\u6539\u4FEE\u7968\u6709\u8BCA\u65AD\u548C\u4FEE\u6539\u8BA1\u5212",
      ok: task.kind !== "fix" || task.integration || task.diagnosis.trim() !== "" && task.plan.trim() !== "",
      hint: "\u6539\u4FEE\u7968\u5FC5\u987B\u5199\u6E05\u6839\u56E0\u3001\u4FEE\u6539\u8BA1\u5212\u3002"
    },
    {
      id: "stage",
      label: "\u4EE3\u7801\u9879\u76EE\u9636\u6BB5\u5141\u8BB8\u6D3E\u5355",
      ok: stageOk,
      hint: "\u53EA\u6709\u539F\u578B\u6216\u5F00\u53D1\u9636\u6BB5\u80FD\u6D3E\u5355\uFF1B\u5148\u901A\u8FC7\u9636\u6BB5\u95E8\u7981\u3002"
    }
  ];
  return { ready: checks.every((check) => check.ok), checks };
}
export {
  diagnoseDispatch
};
