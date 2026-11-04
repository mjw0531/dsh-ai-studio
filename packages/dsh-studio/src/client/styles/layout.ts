export const layout = `

.studio-btn[data-variant="primary"]:hover:not(:disabled) { filter: brightness(1.06); }

.studio-btn[data-variant="ghost"] { background: transparent; }
.studio-btn[data-variant="danger"] { color: var(--st-danger); border-color: rgba(255, 117, 133, 0.25); background: var(--st-danger-soft); }
.studio-btn[data-size="sm"] { height: 28px; padding: 0 9px; font-size: 11px; }
.studio-btn[data-size="icon"] { width: 32px; padding: 0; }

.studio-grid-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.studio-stat {
  position: relative;
  padding: 14px 16px;
  border: 1px solid var(--st-border);
  border-radius: var(--st-radius);
  background: linear-gradient(180deg, var(--st-panel), var(--st-panel-2));
  overflow: hidden;
}

.studio-stat::after {
  content: "";
  position: absolute;
  inset: auto -30px -46px auto;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: var(--st-accent-soft);
  filter: blur(4px);
}

.studio-stat-label { color: var(--st-muted); font-size: 11px; }
.studio-stat-value { margin-top: 4px; font-size: 26px; font-weight: 750; letter-spacing: -0.04em; line-height: 1.1; }
.studio-stat-note { margin-top: 5px; color: var(--st-faint); font-size: 10px; }
.studio-stat[data-tone="warn"] .studio-stat-value { color: var(--st-warn); }
.studio-stat[data-tone="ok"] .studio-stat-value { color: var(--st-ok); }
.studio-stat[data-tone="danger"] .studio-stat-value { color: var(--st-danger); }

.studio-split {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  gap: 16px;
  align-items: start;
  margin-bottom: 20px;
}

.studio-panel {
  border: 1px solid var(--st-border);
  border-radius: var(--st-radius);
  background: color-mix(in srgb, var(--st-panel) 92%, transparent);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.02) inset;
}

.studio-panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--st-border);
}

.studio-panel-head h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.studio-panel-head .studio-muted { margin-left: auto; font-size: 11px; }

.studio-panel-body { padding: 14px 16px; }

.studio-stage-panel { margin-bottom: 12px; }
.studio-stage-track {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}
.studio-stage-step {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 9px;
  border: 1px solid var(--st-border);
  border-radius: 8px;
  color: var(--st-muted);
  background: var(--st-panel-2);
}
.studio-stage-step[data-state="done"] {
  color: var(--st-ok);
  border-color: rgba(91, 214, 162, 0.22);
  background: var(--st-ok-soft);
}
.studio-stage-step[data-state="current"] {
  color: var(--st-accent);
  border-color: rgba(127, 157, 255, 0.35);
  background: var(--st-accent-soft);
}
.studio-stage-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 999px;
  border: 1px solid currentColor;
  font-size: 10px;
  font-weight: 700;
}
.studio-stage-step strong { display: block; font-size: 11px; }
.studio-stage-step small { display: block; color: var(--st-faint); font-size: 9px; }
.studio-stage-empty,
.studio-stage-complete {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px dashed var(--st-border);
  border-radius: 8px;
  color: var(--st-muted);
  font-size: 11px;
}
.studio-stage-empty { justify-content: space-between; }
.studio-stage-empty p { margin: 0; }
.studio-stage-gate {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.studio-stage-gate-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.studio-stage-gate-head strong { font-size: 12px; }
.studio-stage-checklist {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 14px;
}
.studio-stage-check {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--st-muted);
  font-size: 11px;
  line-height: 1.45;
}
.studio-stage-check input { margin-top: 2px; accent-color: var(--st-accent); }
.studio-stage-artifacts {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.studio-stage-subhead {
  color: var(--st-muted);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.03em;
}
.studio-stage-artifact {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border: 1px solid var(--st-border);
  border-radius: 7px;
  background: var(--st-panel-2);
  font-size: 11px;
}
.studio-stage-artifact code {
  overflow: hidden;
  color: var(--st-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.studio-stage-artifact .studio-icon-btn { margin-left: auto; }
.studio-stage-artifact-form {
  display: grid;
  grid-template-columns: 110px 1fr 1.2fr auto;
  gap: 6px;
}
.studio-stage-artifact-form select,
.studio-stage-artifact-form input {
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--st-border);
  border-radius: 6px;
  color: var(--st-text);
  background: var(--st-panel);
  font: inherit;
  font-size: 11px;
}
.studio-stage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.studio-stage-approved {
  padding: 9px 11px;
  border: 1px solid rgba(91, 214, 162, 0.22);
  border-radius: 7px;
  color: var(--st-ok);
  background: var(--st-ok-soft);
  font-size: 11px;
}

.studio-trigger-panel { margin-bottom: 12px; }
.studio-webhook-rules {
  margin: 8px 0;
  border: 1px solid var(--st-border);
  border-radius: 7px;
  background: var(--st-panel-2);
  font-size: 11px;
}
.studio-webhook-rules summary {
  padding: 8px 10px;
  cursor: pointer;
  color: var(--st-muted);
}
.studio-webhook-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 10px 10px;
}
.studio-trigger-form {
  display: grid;
  grid-template-columns: 110px 1fr 180px auto;
  gap: 6px;
  margin-bottom: 7px;
}
.studio-trigger-form select,
.studio-trigger-form input,
.studio-trigger-body {
  min-width: 0;
  width: 100%;
  border: 1px solid var(--st-border);
  border-radius: 6px;
  color: var(--st-text);
  background: var(--st-panel);
  font: inherit;
  font-size: 11px;
}
.studio-trigger-form select,
.studio-trigger-form input { height: 30px; padding: 0 8px; }
.studio-trigger-body {
  min-height: 52px;
  margin-bottom: 6px;
  padding: 7px 8px;
  resize: vertical;
}
.studio-trigger-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 10px;
}
.studio-trigger-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--st-border);
  border-radius: 8px;
  background: var(--st-panel-2);
}
.studio-trigger-main { min-width: 0; flex: 1; }
.studio-trigger-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
}
.studio-trigger-copy {
  margin-top: 4px;
  color: var(--st-muted);
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
}
.studio-trigger-meta {
  margin-top: 4px;
  color: var(--st-faint);
  font-size: 10px;
}
.studio-trigger-meta code { font-size: 10px; }
.studio-trigger-actions {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: none;
}

.studio-workshop-panel { margin-bottom: 12px; }
.studio-workshop-create,
.studio-workshop-room {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.studio-workshop-participants {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.studio-workshop-notes {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.studio-workshop-note {
  padding: 8px 10px;
  border: 1px solid var(--st-border);
  border-radius: 8px;
  background: var(--st-panel-2);
  font-size: 11px;
}
.studio-workshop-note p { margin: 4px 0; color: var(--st-muted); line-height: 1.45; }
.studio-workshop-list { margin-top: 3px; color: var(--st-faint); font-size: 10px; }
.studio-workshop-note-form {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 9px;
  border-top: 1px solid var(--st-border);
}
.studio-workshop-decision {
  padding: 9px 11px;
  border: 1px solid rgba(91, 214, 162, 0.22);
  border-radius: 7px;
  color: var(--st-ok);
  background: var(--st-ok-soft);
  font-size: 11px;
}
.studio-workshop-summary {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border: 1px dashed var(--st-border);
  border-radius: 7px;
  color: var(--st-muted);
  background: var(--st-panel-2);
  font-size: 11px;
  line-height: 1.45;
}

.studio-provider-panel { margin-bottom: 12px; }
.studio-provider-form {
  display: grid;
  grid-template-columns: 1.2fr 130px 1fr 1fr auto;
  gap: 6px;
  margin: 8px 0;
}
.studio-provider-form input,
.studio-provider-form select {
  min-width: 0;
  height: 30px;
  width: 100%;
  padding: 0 8px;
  border: 1px solid var(--st-border);
  border-radius: 6px;
  color: var(--st-text);
  background: var(--st-panel);
  font: inherit;
  font-size: 11px;
}
.studio-provider-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.studio-provider-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 7px 9px;
  border: 1px solid var(--st-border);
  border-radius: 7px;
  background: var(--st-panel-2);
  font-size: 11px;
}
.studio-provider-probe {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
  padding-top: 5px;
  border-top: 1px solid var(--st-border);
}

.studio-company-portfolio {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.studio-priority-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.studio-priority-row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 7px;
  border: 1px solid var(--st-border);
  border-radius: 6px;
  color: var(--st-text);
  background: var(--st-panel-2);
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}
.studio-priority-row:hover { border-color: var(--st-accent); }

.studio-onboarding { margin-bottom: 12px; }
.studio-onboarding-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 7px;
  margin-bottom: 10px;
}
.studio-onboarding-step {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 9px;
  border: 1px solid var(--st-border);
  border-radius: 7px;
  color: var(--st-muted);
  background: var(--st-panel-2);
  font-size: 11px;
}
.studio-onboarding-step[data-done="true"] {
  color: var(--st-ok);
  border-color: rgba(91, 214, 162, 0.22);
  background: var(--st-ok-soft);
}

.studio-demo-panel { margin-bottom: 12px; }
.studio-demo-form {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.studio-demo-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 10px;
}
.studio-demo-row {
  padding: 8px 10px;
  border: 1px solid var(--st-border);
  border-radius: 8px;
  background: var(--st-panel-2);
  font-size: 11px;
}
.studio-demo-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}
.studio-demo-command {
  margin-top: 4px;
  color: var(--st-warn);
  font-size: 10px;
}
.studio-demo-copy {
  margin-top: 4px;
  color: var(--st-muted);
  line-height: 1.45;
  white-space: pre-wrap;
}
`;
