import {
  MERGE_STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "../../shared/types.js";
import type {
  MergeProposal,
  TaskPriority,
  TaskStatus,
} from "../../shared/types.js";
import {
  IconBook,
  IconBuilding,
  IconGitMerge,
  IconGrid,
  IconKanban,
  IconSettings,
  IconSpark,
  IconUsers,
} from "../icons.js";

export type Tab =
  | "company"
  | "boardroom"
  | "knowledge"
  | "meeting"
  | "mission"
  | "tasks"
  | "merges"
  | "team"
  | "settings";

export function NavIcon({ tab }: { tab: Tab }) {
  switch (tab) {
    case "company":
      return <IconBuilding width={15} height={15} />;
    case "boardroom":
      return <IconSpark width={15} height={15} />;
    case "knowledge":
      return <IconBook width={15} height={15} />;
    case "meeting":
      return <IconUsers width={15} height={15} />;
    case "mission":
      return <IconGrid width={15} height={15} />;
    case "tasks":
      return <IconKanban width={15} height={15} />;
    case "merges":
      return <IconGitMerge width={15} height={15} />;
    case "team":
      return <IconUsers width={15} height={15} />;
    case "settings":
      return <IconSettings width={15} height={15} />;
  }
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const tone =
    status === "done"
      ? "ok"
      : status === "review"
        ? "accent"
        : status === "blocked"
          ? "p0"
          : "p2";
  return (
    <span className="studio-pill" data-tone={tone}>
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  return (
    <span className="studio-pill" data-tone={priority.toLowerCase()}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function MergePill({ proposal }: { proposal: MergeProposal }) {
  const tone =
    proposal.status === "merged"
      ? "ok"
      : proposal.status === "approved"
        ? "p1"
        : proposal.status === "rejected"
          ? "p0"
          : "accent";
  return (
    <span className="studio-pill" data-tone={tone}>
      <IconGitMerge width={10} height={10} />
      {MERGE_STATUS_LABELS[proposal.status]}
    </span>
  );
}

export function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "warn" | "ok" | "danger";
}) {
  return (
    <div className="studio-stat" data-tone={tone}>
      <div className="studio-stat-label">{label}</div>
      <div className="studio-stat-value">{value}</div>
      <div className="studio-stat-note">{note}</div>
    </div>
  );
}
