export const base = `
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
`;
