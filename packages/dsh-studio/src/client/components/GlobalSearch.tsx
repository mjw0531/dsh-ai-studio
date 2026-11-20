import { useState } from "react";

import type { BootstrapResponse } from "../../shared/types.js";
import { searchStudio } from "../../shared/search.js";
import type { SearchHit, SearchKind } from "../../shared/search.js";
import { ModalShell } from "./ModalShell.js";

const KIND_LABELS: Record<SearchKind, string> = {
  task: "任务",
  meeting: "会议",
  decision: "决策",
  module: "模块",
  milestone: "里程碑",
  doc: "文档",
};

export function GlobalSearch({
  data,
  onClose,
  onPick,
}: {
  data: BootstrapResponse;
  onClose: () => void;
  onPick: (hit: SearchHit) => void;
}) {
  const [query, setQuery] = useState("");
  const hits = searchStudio(data, query);
  return (
    <ModalShell
      title="全局搜索"
      subtitle="搜索任务、会议、决策、模块、里程碑和文档路径。"
      onClose={onClose}
      footer={null}
    >
      <div className="studio-modal-body">
        <div className="studio-field">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入编号、标题或关键词"
            autoFocus
            aria-label="全局搜索"
          />
        </div>
        {query.trim() === "" ? (
          <div className="studio-faint">输入关键词开始搜索。</div>
        ) : hits.length === 0 ? (
          <div className="studio-faint">没有匹配结果。</div>
        ) : (
          <div className="studio-search-results">
            {hits.map((hit) => (
              <button
                className="studio-search-hit"
                type="button"
                key={`${hit.kind}:${hit.id}`}
                onClick={() => onPick(hit)}
              >
                <span className="studio-pill">{KIND_LABELS[hit.kind]}</span>
                <span>
                  <span className="studio-search-title">{hit.title}</span>
                  <span className="studio-faint">{hit.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
