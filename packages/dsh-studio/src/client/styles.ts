export const studioCss = `
.studio-root {
  --st-bg: #0b0d12;
  --st-bg-soft: #0f1219;
  --st-panel: #141821;
  --st-panel-2: #1a1f2b;
  --st-panel-3: #202635;
  --st-border: rgba(255, 255, 255, 0.08);
  --st-border-strong: rgba(255, 255, 255, 0.16);
  --st-text: #e9ecf3;
  --st-muted: #929aab;
  --st-faint: #626b7d;
  --st-accent: #7f9dff;
  --st-accent-soft: rgba(127, 157, 255, 0.14);
  --st-accent-2: #a78bfa;
  --st-ok: #5bd6a2;
  --st-ok-soft: rgba(91, 214, 162, 0.12);
  --st-warn: #f0b45f;
  --st-warn-soft: rgba(240, 180, 95, 0.12);
  --st-danger: #ff7585;
  --st-danger-soft: rgba(255, 117, 133, 0.12);
  --st-radius: 14px;
  --st-radius-sm: 9px;
  --st-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
  color-scheme: dark;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background:
    radial-gradient(1100px 500px at 12% -8%, rgba(127, 157, 255, 0.13), transparent 60%),
    radial-gradient(900px 420px at 88% -12%, rgba(167, 139, 250, 0.1), transparent 60%),
    var(--st-bg);
  color: var(--st-text);
  font-family: var(--dsh-font-family-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  font-size: 13px;
  line-height: 1.5;
  overflow: hidden;
}

.studio-root[data-theme="light"] {
  --st-bg: #f5f6fa;
  --st-bg-soft: #eef0f6;
  --st-panel: #ffffff;
  --st-panel-2: #f7f8fc;
  --st-panel-3: #eceffa;
  --st-border: rgba(18, 24, 40, 0.09);
  --st-border-strong: rgba(18, 24, 40, 0.18);
  --st-text: #171b26;
  --st-muted: #5d6678;
  --st-faint: #8a92a3;
  --st-accent: #4c6fff;
  --st-accent-soft: rgba(76, 111, 255, 0.1);
  --st-accent-2: #7c5cff;
  --st-ok: #0f9d6e;
  --st-ok-soft: rgba(15, 157, 110, 0.1);
  --st-warn: #b47611;
  --st-warn-soft: rgba(180, 118, 17, 0.1);
  --st-danger: #d93b4d;
  --st-danger-soft: rgba(217, 59, 77, 0.1);
  --st-shadow: 0 18px 48px rgba(28, 36, 58, 0.16);
  color-scheme: light;
}

.studio-root *,
.studio-root *::before,
.studio-root *::after { box-sizing: border-box; }

.studio-root button,
.studio-root input,
.studio-root textarea,
.studio-root select {
  font: inherit;
  color: inherit;
}

.studio-root button { cursor: pointer; }
.studio-root button:disabled { cursor: not-allowed; opacity: 0.55; }

.studio-header {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 62px;
  padding: 0 20px;
  border-bottom: 1px solid var(--st-border);
  background: color-mix(in srgb, var(--st-bg-soft) 88%, transparent);
  backdrop-filter: blur(16px);
  flex: none;
}

.studio-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 148px;
}

.studio-mark {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: linear-gradient(140deg, var(--st-accent), var(--st-accent-2));
  color: #0b0d12;
  font-weight: 800;
  font-size: 15px;
  letter-spacing: -0.03em;
  box-shadow: 0 6px 18px rgba(127, 157, 255, 0.28);
}

.studio-brand-name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.studio-brand-sub {
  margin-top: 1px;
  font-size: 10px;
  color: var(--st-faint);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.studio-project-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.studio-select {
  height: 32px;
  max-width: 240px;
  padding: 0 30px 0 10px;
  border-radius: 8px;
  border: 1px solid var(--st-border);
  background: var(--st-panel);
  color: var(--st-text);
  outline: none;
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--st-muted) 50%),
    linear-gradient(135deg, var(--st-muted) 50%, transparent 50%);
  background-position:
    calc(100% - 14px) 14px,
    calc(100% - 9px) 14px;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}

.studio-select:focus { border-color: var(--st-accent); }

.studio-header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.studio-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--st-ok);
  box-shadow: 0 0 0 3px var(--st-ok-soft);
}

.studio-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--st-muted);
  font-size: 11px;
  white-space: nowrap;
}

.studio-body {
  display: flex;
  min-height: 0;
  flex: 1;
}

.studio-nav {
  width: 204px;
  flex: none;
  padding: 16px 12px;
  border-right: 1px solid var(--st-border);
  background: color-mix(in srgb, var(--st-bg-soft) 55%, transparent);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.studio-nav-label {
  padding: 8px 10px 6px;
  color: var(--st-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.studio-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--st-muted);
  text-align: left;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.studio-nav-item:hover {
  color: var(--st-text);
  background: var(--st-panel-2);
}

.studio-nav-item[data-active="true"] {
  color: var(--st-text);
  background: var(--st-accent-soft);
  border-color: rgba(127, 157, 255, 0.25);
}

.studio-nav-item svg { flex: none; opacity: 0.9; }

.studio-nav-count {
  margin-left: auto;
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--st-panel-3);
  color: var(--st-muted);
  font-size: 10px;
  text-align: center;
}

.studio-nav-footer {
  margin-top: auto;
  padding: 10px;
  border: 1px solid var(--st-border);
  border-radius: var(--st-radius-sm);
  background: var(--st-panel);
  color: var(--st-muted);
  font-size: 11px;
}

.studio-nav-footer strong { color: var(--st-text); display: block; margin-bottom: 3px; }

.studio-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 24px 26px 40px;
}

.studio-main-inner { max-width: 1380px; margin: 0 auto; }

.studio-page-head {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 22px;
}

.studio-eyebrow {
  color: var(--st-accent);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.studio-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: -0.025em;
}

.studio-subtitle {
  margin: 7px 0 0;
  max-width: 720px;
  color: var(--st-muted);
  font-size: 12px;
}

.studio-head-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex: none;
}

.studio-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--st-border);
  background: var(--st-panel);
  color: var(--st-text);
  font-weight: 600;
  font-size: 12px;
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
}

.studio-btn:hover:not(:disabled) { background: var(--st-panel-2); border-color: var(--st-border-strong); }
.studio-btn:active:not(:disabled) { transform: translateY(1px); }

.studio-btn[data-variant="primary"] {
  background: linear-gradient(135deg, var(--st-accent), var(--st-accent-2));
  border-color: transparent;
  color: #0b0d12;
}

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

.studio-needs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.studio-need {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--st-border);
  border-radius: 10px;
  background: var(--st-panel-2);
  text-align: left;
  transition: border-color 120ms ease, background 120ms ease;
}

.studio-need:hover { border-color: var(--st-border-strong); background: var(--st-panel-3); }
.studio-need-mark { width: 4px; align-self: stretch; border-radius: 999px; background: var(--st-warn); flex: none; }
.studio-need-mark[data-tone="danger"] { background: var(--st-danger); }
.studio-need-mark[data-tone="accent"] { background: var(--st-accent); }
.studio-need-mark[data-tone="info"] { background: var(--st-muted); }
.studio-need-title { display: block; font-weight: 650; font-size: 12px; }
.studio-need-meta { display: block; margin-top: 2px; color: var(--st-muted); font-size: 11px; }
.studio-need-arrow { margin-left: auto; color: var(--st-faint); align-self: center; }

.studio-roster { display: flex; flex-direction: column; gap: 8px; }

.studio-person {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--st-border);
}

.studio-person:last-child { border-bottom: 0; padding-bottom: 0; }
.studio-person:first-child { padding-top: 0; }

.studio-avatar {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--st-panel-3);
  border: 1px solid var(--st-border);
  color: var(--st-accent);
  font-size: 11px;
  font-weight: 800;
}

.studio-person-name { font-weight: 650; font-size: 12px; }
.studio-person-title { color: var(--st-muted); font-size: 10px; }
.studio-person-load { margin-left: auto; text-align: right; color: var(--st-muted); font-size: 10px; }
.studio-person-load strong { display: block; color: var(--st-text); font-size: 12px; }

.studio-board-wrap { overflow-x: auto; padding-bottom: 4px; }
.studio-board {
  display: grid;
  grid-template-columns: repeat(6, minmax(210px, 1fr));
  gap: 10px;
  min-width: 1320px;
}

.studio-column {
  min-width: 0;
  border: 1px solid var(--st-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--st-bg-soft) 70%, transparent);
  display: flex;
  flex-direction: column;
  min-height: 220px;
}

.studio-column-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 11px;
  border-bottom: 1px solid var(--st-border);
  color: var(--st-muted);
  font-size: 11px;
  font-weight: 700;
}

.studio-column-head .studio-count {
  margin-left: auto;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--st-panel-3);
  color: var(--st-muted);
  font-size: 10px;
  text-align: center;
}

.studio-column-body { display: flex; flex-direction: column; gap: 8px; padding: 8px; }

.studio-task-card {
  display: block;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--st-border);
  border-radius: 10px;
  background: var(--st-panel);
  text-align: left;
  transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
}

.studio-task-card:hover {
  border-color: rgba(127, 157, 255, 0.45);
  background: var(--st-panel-2);
  transform: translateY(-1px);
}

.studio-task-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.studio-task-title { font-weight: 650; font-size: 12px; line-height: 1.4; }
.studio-task-goal {
  margin-top: 4px;
  color: var(--st-muted);
  font-size: 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.studio-task-foot { display: flex; align-items: center; gap: 6px; margin-top: 9px; }
.studio-task-owner { color: var(--st-muted); font-size: 10px; }
.studio-task-progress { margin-left: auto; color: var(--st-faint); font-size: 10px; }
.studio-progress {
  margin-top: 7px;
  height: 3px;
  border-radius: 999px;
  background: var(--st-panel-3);
  overflow: hidden;
}
.studio-progress > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--st-accent), var(--st-accent-2)); }

.studio-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 19px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--st-border);
  color: var(--st-muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.studio-pill[data-tone="p0"] { color: var(--st-danger); background: var(--st-danger-soft); border-color: rgba(255, 117, 133, 0.22); }
.studio-pill[data-tone="p1"] { color: var(--st-warn); background: var(--st-warn-soft); border-color: rgba(240, 180, 95, 0.22); }
.studio-pill[data-tone="p2"] { color: var(--st-muted); }
.studio-pill[data-tone="ok"] { color: var(--st-ok); background: var(--st-ok-soft); border-color: rgba(91, 214, 162, 0.22); }
.studio-pill[data-tone="accent"] { color: var(--st-accent); background: var(--st-accent-soft); border-color: rgba(127, 157, 255, 0.22); }

.studio-muted { color: var(--st-muted); }
.studio-faint { color: var(--st-faint); }
.studio-mono { font-family: var(--dsh-font-family-mono, ui-monospace, SFMono-Regular, Consolas, monospace); font-size: 10px; }

.studio-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.studio-toolbar .studio-muted { font-size: 11px; }
.studio-toolbar-spacer { flex: 1; }

.studio-tabs { display: flex; gap: 4px; padding: 3px; border: 1px solid var(--st-border); border-radius: 9px; background: var(--st-bg-soft); }
.studio-tab { height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--st-muted); font-size: 11px; font-weight: 600; }
.studio-tab[data-active="true"] { background: var(--st-panel); color: var(--st-text); box-shadow: 0 1px 3px rgba(0,0,0,.18); }

.studio-role-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.studio-role-card { padding: 16px; border: 1px solid var(--st-border); border-radius: var(--st-radius); background: var(--st-panel); }
.studio-role-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.studio-role-card h3 { margin: 0; font-size: 14px; }
.studio-role-card .studio-role-title { color: var(--st-muted); font-size: 11px; }
.studio-role-mission { color: var(--st-muted); font-size: 11px; line-height: 1.6; }
.studio-role-section { margin-top: 10px; }
.studio-role-section-label { color: var(--st-faint); font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 4px; }
.studio-role-list { margin: 0; padding-left: 15px; color: var(--st-muted); font-size: 11px; line-height: 1.7; }

.studio-empty {
  padding: 26px 16px;
  border: 1px dashed var(--st-border-strong);
  border-radius: 12px;
  text-align: center;
  color: var(--st-muted);
  font-size: 11px;
}
.studio-empty strong { display: block; color: var(--st-text); font-size: 12px; margin-bottom: 4px; }

.studio-drawer-overlay,
.studio-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(2, 4, 9, 0.6);
  backdrop-filter: blur(3px);
}

.studio-drawer-overlay { display: flex; justify-content: flex-end; }
.studio-drawer {
  width: min(520px, 100vw);
  height: 100%;
  overflow: auto;
  border-left: 1px solid var(--st-border-strong);
  background: var(--st-bg-soft);
  box-shadow: var(--st-shadow);
  animation: studio-slide-in 160ms ease-out;
}
@keyframes studio-slide-in { from { transform: translateX(18px); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }

.studio-drawer-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--st-border);
  background: color-mix(in srgb, var(--st-bg-soft) 92%, transparent);
  backdrop-filter: blur(12px);
}
.studio-drawer-head h2 { margin: 0; font-size: 17px; line-height: 1.3; letter-spacing: -0.02em; }
.studio-drawer-head .studio-muted { margin-top: 4px; font-size: 11px; }
.studio-drawer-close { margin-left: auto; flex: none; }
.studio-drawer-body { padding: 18px 20px 30px; display: flex; flex-direction: column; gap: 18px; }

.studio-section-label { color: var(--st-faint); font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 6px; }
.studio-section-text { color: var(--st-text); font-size: 12px; line-height: 1.65; white-space: pre-wrap; }
.studio-kv { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 7px 10px; font-size: 11px; }
.studio-kv dt { color: var(--st-muted); }
.studio-kv dd { margin: 0; color: var(--st-text); overflow-wrap: anywhere; }

.studio-acceptance { display: flex; flex-direction: column; gap: 6px; }
.studio-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 9px;
  border: 1px solid var(--st-border);
  border-radius: 8px;
  background: var(--st-panel);
  font-size: 11px;
  line-height: 1.5;
}
.studio-check input { margin: 2px 0 0; accent-color: var(--st-accent); }
.studio-check[data-done="true"] span { color: var(--st-muted); text-decoration: line-through; }

.studio-evidence { display: flex; flex-direction: column; gap: 6px; }
.studio-evidence-item { padding: 8px 9px; border-left: 2px solid var(--st-ok); background: var(--st-ok-soft); border-radius: 0 8px 8px 0; font-size: 11px; }
.studio-evidence-item .studio-faint { margin-top: 3px; font-size: 9px; }

.studio-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.studio-action-note { color: var(--st-faint); font-size: 10px; margin-top: 6px; }

.studio-merge-list { display: flex; flex-direction: column; gap: 10px; }
.studio-merge-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 10px;
  font-size: 13px;
  font-weight: 650;
  flex-wrap: wrap;
}
.studio-merge-title button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--st-text);
  font-weight: 650;
  text-align: left;
}
.studio-merge-title button:hover { color: var(--st-accent); }
.studio-merge-title .studio-mono { color: var(--st-faint); font-weight: 400; }
.studio-merge-card[data-status="approved"] { border-color: rgba(240, 180, 95, 0.28); }
.studio-merge-card[data-status="merged"] { border-color: rgba(91, 214, 162, 0.25); }
.studio-branch-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}
.studio-branch-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px;
  border: 1px solid var(--st-border);
  border-radius: 9px;
  background: var(--st-panel-2);
}
.studio-branch-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.studio-branch-head .studio-mono { overflow: hidden; color: var(--st-text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.studio-branch-head .studio-faint { font-size: 9px; }
.studio-branch-goal { color: var(--st-muted); font-size: 11px; line-height: 1.55; }
.studio-branch-meta { color: var(--st-faint); font-size: 10px; }
.studio-branch-changes { display: flex; flex-direction: column; gap: 4px; padding-top: 6px; border-top: 1px solid var(--st-border); font-size: 10px; }
.studio-branch-changes > div { display: flex; gap: 6px; color: var(--st-muted); }
.studio-branch-changes .studio-mono { color: var(--st-accent); flex: none; }

.studio-decision-list { display: flex; flex-direction: column; gap: 10px; }
.studio-decision-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 13px;
  border: 1px solid var(--st-border);
  border-radius: 10px;
  background: var(--st-panel-2);
}
.studio-decision-card[data-status="pending"] { border-color: rgba(240, 180, 95, 0.24); }
.studio-decision-card[data-status="approved"] { border-color: rgba(91, 214, 162, 0.22); }
.studio-decision-head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.studio-decision-head strong { color: var(--st-text); font-size: 13px; }
.studio-decision-meta { color: var(--st-faint); font-size: 10px; }
.studio-decision-context { color: var(--st-muted); font-size: 11px; line-height: 1.6; white-space: pre-wrap; }
.studio-decision-rec {
  padding: 9px 10px;
  border-left: 2px solid var(--st-accent);
  border-radius: 0 7px 7px 0;
  background: var(--st-accent-soft);
  color: var(--st-muted);
  font-size: 11px;
  line-height: 1.55;
}
.studio-decision-rec span { display: block; margin-bottom: 3px; color: var(--st-accent); font-size: 9px; font-weight: 700; letter-spacing: 0.08em; }
.studio-decision-options { margin: 0; padding-left: 16px; color: var(--st-muted); font-size: 11px; line-height: 1.6; }
.studio-decision-form { display: flex; flex-direction: column; gap: 8px; padding-top: 9px; border-top: 1px solid var(--st-border); }
.studio-decision-form .studio-field textarea { min-height: 58px; }

.studio-role-salary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 9px;
  color: var(--st-muted);
  font-size: 10px;
}
.studio-role-salary .studio-mono { color: var(--st-accent); }

.studio-knowledge-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 14px;
  align-items: start;
}
.studio-doc-view {
  margin-top: 12px;
  border: 1px solid var(--st-border);
  border-radius: 9px;
  background: var(--st-panel-2);
  overflow: hidden;
}
.studio-doc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--st-border);
  font-size: 10px;
}
.studio-doc-head .studio-pill { margin-left: auto; }
.studio-doc-view pre {
  max-height: 420px;
  margin: 0;
  padding: 10px;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--st-muted);
  font-size: 10px;
  line-height: 1.6;
}
.studio-module-list { display: flex; flex-direction: column; gap: 8px; margin-top: 9px; }
.studio-module-card {
  padding: 10px;
  border: 1px solid var(--st-border);
  border-radius: 9px;
  background: var(--st-panel-2);
}
.studio-module-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}
.studio-module-card p { margin: 6px 0; color: var(--st-muted); font-size: 11px; line-height: 1.55; }
.studio-module-contract {
  max-height: 120px;
  margin: 7px 0 0;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--st-faint);
  font-size: 10px;
  line-height: 1.5;
}
.studio-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--st-accent);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
  overflow-wrap: anywhere;
}

.studio-diff {
  max-height: 180px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--st-muted);
  font-size: 10px;
  line-height: 1.5;
}

.studio-verify-form { display: flex; gap: 7px; margin-top: 9px; }
.studio-verify-form input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--st-border);
  border-radius: 7px;
  background: var(--st-panel-2);
  color: var(--st-text);
  font-family: var(--dsh-font-family-mono, ui-monospace, Consolas, monospace);
  font-size: 10px;
}
.studio-verification {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 8px;
  padding: 9px;
  border: 1px solid var(--st-border);
  border-radius: 8px;
  background: var(--st-panel-2);
}
.studio-verification[data-passed="false"] { border-color: rgba(255, 117, 133, 0.25); }
.studio-verification-head { display: flex; align-items: center; gap: 7px; font-size: 10px; }
.studio-verification-head code { color: var(--st-accent); overflow-wrap: anywhere; }
.studio-verification-head .studio-faint { margin-left: auto; }
.studio-verification pre {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--st-muted);
  font-size: 10px;
  line-height: 1.5;
}

.studio-run-list { display: flex; flex-direction: column; gap: 6px; margin-top: 9px; }
.studio-run-card {
  border: 1px solid var(--st-border);
  border-radius: 9px;
  background: var(--st-panel);
  overflow: hidden;
}
.studio-run-card > summary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 9px;
  color: var(--st-muted);
  font-size: 10px;
  cursor: pointer;
  list-style: none;
}
.studio-run-card > summary::-webkit-details-marker { display: none; }
.studio-run-card > summary:hover { background: var(--st-panel-2); }
.studio-run-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 9px;
  border-top: 1px solid var(--st-border);
  background: var(--st-bg-soft);
}
.studio-run-output {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--st-muted);
  font-family: var(--dsh-font-family-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 10px;
  line-height: 1.55;
}
.studio-run-workspace {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--st-border);
  border-radius: 7px;
  background: var(--st-panel-2);
  font-size: 10px;
}
.studio-run-workspace > div { display: flex; gap: 8px; }
.studio-run-workspace span { color: var(--st-faint); flex: none; }
.studio-run-workspace code { color: var(--st-accent); overflow-wrap: anywhere; }
.studio-run-workspace pre { margin: 4px 0 0; white-space: pre-wrap; color: var(--st-muted); }

.studio-receipt { display: flex; flex-direction: column; gap: 8px; }
.studio-receipt-list { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 6px; font-size: 10px; }
.studio-receipt-list > span { color: var(--st-faint); }
.studio-receipt-list ul { margin: 0; padding-left: 14px; color: var(--st-muted); line-height: 1.55; }

.studio-merge-form { display: flex; flex-direction: column; gap: 10px; }
.studio-merge-card {
  padding: 12px;
  border: 1px solid var(--st-border);
  border-radius: 10px;
  background: var(--st-panel);
}
.studio-merge-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.studio-merge-command {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding: 8px 9px;
  border: 1px solid var(--st-border);
  border-radius: 8px;
  background: var(--st-bg-soft);
  overflow-wrap: anywhere;
}
.studio-merge-command code {
  color: var(--st-accent);
  font-family: var(--dsh-font-family-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 10px;
}
.studio-merge-actions {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 10px;
}
.studio-merge-actions > input {
  width: 100%;
  border: 1px solid var(--st-border);
  border-radius: 8px;
  background: var(--st-panel);
  color: var(--st-text);
  padding: 7px 9px;
  outline: none;
  font-size: 11px;
}
.studio-merge-actions > input:focus { border-color: var(--st-accent); box-shadow: 0 0 0 3px var(--st-accent-soft); }

.studio-modal-overlay { display: grid; place-items: center; padding: 20px; }
.studio-modal {
  width: min(560px, 100%);
  max-height: min(760px, 92vh);
  overflow: auto;
  border: 1px solid var(--st-border-strong);
  border-radius: 16px;
  background: var(--st-bg-soft);
  box-shadow: var(--st-shadow);
  animation: studio-pop 140ms ease-out;
}
@keyframes studio-pop { from { transform: translateY(6px) scale(0.99); opacity: 0.7; } to { transform: none; opacity: 1; } }
.studio-modal-head { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid var(--st-border); }
.studio-modal-head h2 { margin: 0; font-size: 16px; }
.studio-modal-head .studio-muted { margin-top: 3px; font-size: 11px; }
.studio-modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 13px; }
.studio-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px 18px; border-top: 1px solid var(--st-border); }

.studio-field { display: flex; flex-direction: column; gap: 5px; }
.studio-field label { color: var(--st-muted); font-size: 10px; font-weight: 650; letter-spacing: 0.03em; }
.studio-field input,
.studio-field textarea,
.studio-field select {
  width: 100%;
  border: 1px solid var(--st-border);
  border-radius: 8px;
  background: var(--st-panel);
  color: var(--st-text);
  padding: 8px 10px;
  outline: none;
  font-size: 12px;
}
.studio-field textarea { min-height: 76px; resize: vertical; line-height: 1.55; }
.studio-field input:focus,
.studio-field textarea:focus,
.studio-field select:focus { border-color: var(--st-accent); box-shadow: 0 0 0 3px var(--st-accent-soft); }
.studio-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.studio-hint { color: var(--st-faint); font-size: 10px; }

.studio-alert {
  padding: 10px 12px;
  border: 1px solid rgba(255, 117, 133, 0.25);
  border-radius: 9px;
  background: var(--st-danger-soft);
  color: var(--st-danger);
  font-size: 11px;
  line-height: 1.5;
}
.studio-alert[data-tone="warn"] { color: var(--st-warn); border-color: rgba(240, 180, 95, 0.25); background: var(--st-warn-soft); }
.studio-alert[data-tone="info"] { color: var(--st-accent); border-color: rgba(127, 157, 255, 0.25); background: var(--st-accent-soft); }

.studio-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
  color: var(--st-muted);
  font-size: 12px;
}
.studio-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--st-border-strong);
  border-top-color: var(--st-accent);
  border-radius: 50%;
  animation: studio-spin 0.8s linear infinite;
}
@keyframes studio-spin { to { transform: rotate(360deg); } }

.studio-company-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.studio-table-wrap { overflow-x: auto; }
.studio-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 860px;
  font-size: 11px;
}
.studio-table th {
  padding: 10px 12px;
  color: var(--st-faint);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
  border-bottom: 1px solid var(--st-border);
}
.studio-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--st-border);
  color: var(--st-muted);
  vertical-align: top;
  white-space: nowrap;
}
.studio-table tr:last-child td { border-bottom: 0; }
.studio-table tbody tr:hover td { background: var(--st-panel-2); }
.studio-table-project { color: var(--st-text); font-weight: 650; font-size: 12px; }
.studio-table-sub {
  max-width: 260px;
  margin-top: 3px;
  overflow: hidden;
  color: var(--st-faint);
  font-size: 10px;
  text-overflow: ellipsis;
}
.studio-table-time { color: var(--st-faint); font-size: 10px; }

.studio-health {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--st-border);
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}
.studio-health-steady { color: var(--st-ok); background: var(--st-ok-soft); border-color: rgba(91, 214, 162, 0.2); }
.studio-health-attention { color: var(--st-warn); background: var(--st-warn-soft); border-color: rgba(240, 180, 95, 0.2); }
.studio-health-critical { color: var(--st-danger); background: var(--st-danger-soft); border-color: rgba(255, 117, 133, 0.2); }

.studio-company-placeholder {
  padding: 11px 12px;
  border: 1px dashed var(--st-border-strong);
  border-radius: 10px;
  background: var(--st-bg-soft);
}
.studio-company-placeholder strong {
  display: block;
  margin-top: 3px;
  color: var(--st-warn);
  font-size: 14px;
}
.studio-company-placeholder p {
  margin: 4px 0 0;
  color: var(--st-muted);
  font-size: 10px;
  line-height: 1.55;
}

.studio-role-load { display: flex; flex-direction: column; gap: 10px; margin-top: 13px; }
.studio-role-load-row { display: flex; flex-direction: column; gap: 5px; }
.studio-role-load-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--st-text);
  font-size: 11px;
}
.studio-role-load-head .studio-faint { font-size: 9px; }
.studio-role-load-head strong { margin-left: auto; color: var(--st-text); font-size: 12px; }
.studio-role-load-state {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--st-panel-3);
  color: var(--st-muted);
  font-size: 9px;
}
.studio-role-load-state[data-state="busy"] { color: var(--st-accent); background: var(--st-accent-soft); }
.studio-role-load-state[data-state="overloaded"] { color: var(--st-warn); background: var(--st-warn-soft); }
.studio-role-load-track {
  height: 3px;
  border-radius: 999px;
  background: var(--st-panel-3);
  overflow: hidden;
}
.studio-role-load-track > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--st-accent), var(--st-accent-2));
}

.studio-risk-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.studio-risk-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--st-border);
  border-radius: 9px;
  background: var(--st-panel-2);
}
.studio-risk-item span { color: var(--st-faint); font-size: 9px; }
.studio-risk-item strong { color: var(--st-text); font-size: 18px; line-height: 1; }
.studio-risk-item[data-active="true"] { border-color: rgba(240, 180, 95, 0.25); }
.studio-risk-item[data-active="true"] strong { color: var(--st-warn); }

.studio-toast {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 13px;
  border: 1px solid var(--st-border-strong);
  border-radius: 10px;
  background: var(--st-panel-2);
  color: var(--st-text);
  box-shadow: var(--st-shadow);
  font-size: 11px;
  animation: studio-toast-in 160ms ease-out;
}
.studio-toast[data-kind="ok"] { border-color: rgba(91, 214, 162, 0.3); }
.studio-toast[data-kind="ok"] svg { color: var(--st-ok); }
.studio-toast[data-kind="error"] { border-color: rgba(255, 117, 133, 0.3); }
.studio-toast[data-kind="error"] svg { color: var(--st-danger); }
@keyframes studio-toast-in { from { transform: translateY(6px); opacity: 0; } to { transform: none; opacity: 1; } }

.studio-settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.studio-settings-card { padding: 16px; border: 1px solid var(--st-border); border-radius: var(--st-radius); background: var(--st-panel); }
.studio-settings-card h3 { margin: 0 0 10px; font-size: 13px; }

.studio-events { display: flex; flex-direction: column; gap: 7px; }
.studio-event { display: flex; align-items: flex-start; gap: 8px; font-size: 11px; }
.studio-event-dot { width: 6px; height: 6px; margin-top: 5px; border-radius: 50%; background: var(--st-accent); flex: none; }
.studio-event-time { color: var(--st-faint); font-size: 9px; white-space: nowrap; margin-left: auto; }

@media (max-width: 1180px) {
  .studio-split { grid-template-columns: 1fr; }
  .studio-company-bottom { grid-template-columns: 1fr; }
  .studio-grid-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .studio-risk-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 860px) {
  .studio-header { flex-wrap: wrap; padding: 10px 14px; gap: 10px; }
  .studio-brand { min-width: 0; }
  .studio-project-picker { order: 3; width: 100%; }
  .studio-select { max-width: none; flex: 1; }
  .studio-body { flex-direction: column; }
  .studio-nav { width: 100%; flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--st-border); padding: 8px 10px; }
  .studio-nav-label, .studio-nav-footer { display: none; }
  .studio-nav-item { width: auto; white-space: nowrap; }
  .studio-main { padding: 16px 14px 30px; }
  .studio-page-head { flex-direction: column; }
  .studio-head-actions { margin-left: 0; }
  .studio-field-row { grid-template-columns: 1fr; }
  .studio-title { font-size: 20px; }
  .studio-risk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;
