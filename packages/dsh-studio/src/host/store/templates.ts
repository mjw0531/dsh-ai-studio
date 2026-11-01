import type { ProjectTemplateId, TaskPriority } from "../../shared/types.js";

    export const projectTemplates: Record<
      ProjectTemplateId,
      {
        roles: Array<{
          name: string;
          title: string;
          mission: string;
          responsibilities: string[];
          decisionRights: string[];
        }>;
        tasks: Array<{
          title: string;
          goal: string;
          owner: string;
          reviewer: string;
          acceptance: string[];
          priority: TaskPriority;
        }>;
      }
    > = {
      web: {
        roles: [
          {
            name: "Lead",
            title: "产品 / 调度",
            mission: "定义范围并保持交付节奏。",
            responsibilities: ["写 PRD", "拆任务", "派单"],
            decisionRights: ["优先级"],
          },
          {
            name: "Builder",
            title: "全栈工程师",
            mission: "交付可运行的 Web 垂直切片。",
            responsibilities: ["实现功能", "补测试"],
            decisionRights: ["实现方案"],
          },
          {
            name: "Verifier",
            title: "QA / 验收",
            mission: "独立验证可运行性和验收标准。",
            responsibilities: ["跑测试", "记录证据"],
            decisionRights: ["验收结论"],
          },
        ],
        tasks: [
          {
            title: "写 PRD 和范围",
            goal: "明确这一版做什么、不做什么。",
            owner: "Lead",
            reviewer: "Verifier",
            acceptance: ["目标与非目标已写明", "验收标准可观察"],
            priority: "P1",
          },
          {
            title: "搭可运行骨架",
            goal: "建立最小可运行结构和测试命令。",
            owner: "Builder",
            reviewer: "Verifier",
            acceptance: ["项目可启动", "测试命令可运行"],
            priority: "P0",
          },
        ],
      },
      game: {
        roles: [
          {
            name: "Lead",
            title: "制作人",
            mission: "守住核心循环和交付节奏。",
            responsibilities: ["定义核心循环", "排优先级"],
            decisionRights: ["范围", "优先级"],
          },
          {
            name: "Architect",
            title: "技术架构",
            mission: "守住模块边界和可玩性技术风险。",
            responsibilities: ["定架构", "评审高风险变更"],
            decisionRights: ["技术方案"],
          },
          {
            name: "Builder",
            title: "游戏开发",
            mission: "交付可玩的垂直切片。",
            responsibilities: ["实现玩法", "补测试"],
            decisionRights: ["实现方案"],
          },
          {
            name: "Verifier",
            title: "QA / 验收",
            mission: "独立验证可玩性和稳定性。",
            responsibilities: ["跑 playtest", "记录证据"],
            decisionRights: ["验收结论"],
          },
        ],
        tasks: [
          {
            title: "定义核心循环",
            goal: "写清楚玩家重复做什么、为什么有趣。",
            owner: "Lead",
            reviewer: "Architect",
            acceptance: ["核心循环一句话说清", "有可验证的 playtest 场景"],
            priority: "P0",
          },
          {
            title: "搭可玩骨架",
            goal: "建立最小可运行场景和输入。",
            owner: "Builder",
            reviewer: "Verifier",
            acceptance: ["场景可启动", "基本输入可用", "测试命令可运行"],
            priority: "P0",
          },
        ],
      },
      tool: {
        roles: [
          {
            name: "Lead",
            title: "工具负责人",
            mission: "定义工具边界和使用者。",
            responsibilities: ["写需求", "定验收"],
            decisionRights: ["范围"],
          },
          {
            name: "Builder",
            title: "工具开发",
            mission: "交付可执行的工具。",
            responsibilities: ["实现 CLI", "补测试"],
            decisionRights: ["实现方案"],
          },
          {
            name: "Verifier",
            title: "QA / 验收",
            mission: "独立验证输入输出和错误路径。",
            responsibilities: ["跑测试", "记录证据"],
            decisionRights: ["验收结论"],
          },
        ],
        tasks: [
          {
            title: "定义 CLI 契约",
            goal: "写清楚输入、输出和错误行为。",
            owner: "Lead",
            reviewer: "Verifier",
            acceptance: ["输入输出已写明", "错误路径有验收"],
            priority: "P1",
          },
          {
            title: "搭可执行骨架",
            goal: "建立最小命令和测试。",
            owner: "Builder",
            reviewer: "Verifier",
            acceptance: ["命令可运行", "测试命令可运行"],
            priority: "P0",
          },
        ],
      },
    };