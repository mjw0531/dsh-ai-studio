import { useState } from "react";

import type {
  CreatePrototypeDemoInput,
  Project,
  PrototypeDemo,
  UpdatePrototypeDemoInput,
} from "../../shared/types.js";
import { IconCheck, IconPlus, IconSpark } from "../icons.js";

export function PrototypeDemoPanel({
  project,
  demos,
  busy,
  onCreate,
  onUpdate,
}: {
  project: Project;
  demos: PrototypeDemo[];
  busy: boolean;
  onCreate: (input: CreatePrototypeDemoInput) => Promise<boolean>;
  onUpdate: (
    demoId: string,
    input: UpdatePrototypeDemoInput,
  ) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [entry, setEntry] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [steps, setSteps] = useState("");
  const [result, setResult] = useState<"passed" | "failed">("passed");
  const [screenshotPath, setScreenshotPath] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <section className="studio-panel studio-demo-panel">
      <div className="studio-panel-head">
        <IconSpark width={14} height={14} />
        <h3>原型 Demo 记录 / Prototype Demo</h3>
        <span className="studio-muted">
          {demos.length === 0 ? "还没有记录" : `${String(demos.length)} 条`}
        </span>
      </div>
      <div className="studio-panel-body">
        <div className="studio-hint">
          这是<b>手动记录</b>：Studio 不启动命令、不检测端口、不自动截图。记录会作为进入持续开发的 demo 证据。
        </div>
        <form
          className="studio-demo-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim() === "") return;
            void onCreate({
              title: title.trim(),
              entry: entry.trim(),
              startCommand: startCommand.trim(),
              steps: steps.trim(),
              result,
              screenshotPath: screenshotPath.trim(),
              notes: notes.trim(),
            }).then((ok) => {
              if (ok) {
                setTitle("");
                setEntry("");
                setStartCommand("");
                setSteps("");
                setScreenshotPath("");
                setNotes("");
              }
            });
          }}
        >
          <div className="studio-field-row">
            <div className="studio-field">
              <label>标题</label>
              <input
                value={title}
                disabled={busy}
                placeholder="例如：登录流程 Demo"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="studio-field">
              <label>结果</label>
              <select
                value={result}
                disabled={busy}
                onChange={(event) =>
                  setResult(event.target.value as "passed" | "failed")
                }
              >
                <option value="passed">通过</option>
                <option value="failed">失败</option>
              </select>
            </div>
          </div>
          <div className="studio-field-row">
            <div className="studio-field">
              <label>入口 URL / 路径</label>
              <input
                value={entry}
                disabled={busy}
                placeholder="http://localhost:5173 或 dist/demo"
                onChange={(event) => setEntry(event.target.value)}
              />
            </div>
            <div className="studio-field">
              <label>启动命令（只记录，不执行）</label>
              <input
                value={startCommand}
                disabled={busy}
                placeholder="pnpm dev"
                onChange={(event) => setStartCommand(event.target.value)}
              />
            </div>
          </div>
          <div className="studio-field">
            <label>验证步骤</label>
            <textarea
              value={steps}
              disabled={busy}
              onChange={(event) => setSteps(event.target.value)}
            />
          </div>
          <div className="studio-field-row">
            <div className="studio-field">
              <label>截图 / 录像路径</label>
              <input
                value={screenshotPath}
                disabled={busy}
                onChange={(event) => setScreenshotPath(event.target.value)}
              />
            </div>
            <div className="studio-field">
              <label>已知限制 / 备注</label>
              <input
                value={notes}
                disabled={busy}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            disabled={busy || title.trim() === ""}
          >
            保存 Demo 记录
          </button>
        </form>

        {demos.length > 0 ? (
          <div className="studio-demo-list">
            {demos.map((demo) => (
              <div key={demo.id} className="studio-demo-row">
                <div className="studio-demo-head">
                  <strong>{demo.title}</strong>
                  <span className="studio-pill">
                    {demo.result === "passed" ? "通过" : "失败"}
                  </span>
                  <span className="studio-muted">{demo.recordedBy}</span>
                </div>
                {demo.entry ? (
                  <div className="studio-mono">{demo.entry}</div>
                ) : null}
                {demo.startCommand ? (
                  <div className="studio-demo-command">
                    命令（未执行）：{demo.startCommand}
                  </div>
                ) : null}
                {demo.steps ? (
                  <div className="studio-demo-copy">{demo.steps}</div>
                ) : null}
                {demo.screenshotPath ? (
                  <div className="studio-demo-copy">
                    截图：{demo.screenshotPath}
                  </div>
                ) : null}
                {demo.notes ? (
                  <div className="studio-demo-copy">备注：{demo.notes}</div>
                ) : null}
                <button
                  className="studio-btn"
                  data-size="sm"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onUpdate(demo.id, {
                      result:
                        demo.result === "passed" ? "failed" : "passed",
                    })
                  }
                >
                  标记为{demo.result === "passed" ? "失败" : "通过"}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

