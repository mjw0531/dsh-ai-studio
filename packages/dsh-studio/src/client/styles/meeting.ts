export const meeting = `
.studio-meeting-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.studio-meeting-main {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.studio-meeting-list .studio-panel-body {
  display: grid;
  gap: 6px;
}
.studio-meeting-list-row {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--st-border);
  border-radius: 9px;
  background: transparent;
  color: var(--st-text);
  text-align: left;
  cursor: pointer;
}
.studio-meeting-list-row:hover,
.studio-meeting-list-row[data-active="true"] {
  border-color: var(--st-accent);
  background: var(--st-accent-soft);
}
.studio-meeting-list-row strong {
  font-size: 12px;
  font-weight: 600;
}
.studio-meeting-topic {
  margin: 0 0 10px;
  color: var(--st-muted);
  line-height: 1.6;
}
.studio-meeting-agenda {
  display: grid;
  gap: 6px;
  margin: 10px 0;
}
.studio-meeting-agenda-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--st-panel-2);
  font-size: 12px;
}
.studio-meeting-agenda-row > span:nth-child(2) {
  flex: 1;
  min-width: 160px;
}
.studio-meeting-participants {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.studio-meeting-messages {
  display: grid;
  gap: 9px;
  max-height: 460px;
  overflow: auto;
  padding-right: 4px;
}
.studio-meeting-message {
  border: 1px solid var(--st-border);
  border-radius: 9px;
  background: var(--st-panel-2);
  padding: 9px 11px;
}
.studio-meeting-message[data-kind="owner"] {
  border-color: var(--st-accent);
  background: var(--st-accent-soft);
}
.studio-meeting-message-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 5px;
  font-size: 11px;
}
.studio-meeting-message-content {
  white-space: pre-wrap;
  line-height: 1.65;
  font-size: 12px;
}
.studio-meeting-message textarea {
  width: 100%;
  min-height: 76px;
  margin-top: 6px;
}
.studio-meeting-message-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 6px;
}
.studio-meeting-original summary {
  cursor: pointer;
  color: var(--st-muted);
  font-size: 11px;
}
.studio-meeting-original pre {
  white-space: pre-wrap;
  font-size: 11px;
  color: var(--st-muted);
}
.studio-meeting-speak {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.studio-meeting-speak textarea,
.studio-meeting-side-messages + textarea {
  width: 100%;
  min-height: 78px;
}
.studio-meeting-speak-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.studio-meeting-speak-actions select {
  min-width: 180px;
}
.studio-meeting-side-messages {
  display: grid;
  gap: 6px;
  max-height: 230px;
  overflow: auto;
  margin: 8px 0;
}
.studio-meeting-side-message {
  display: grid;
  gap: 3px;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--st-panel-2);
  font-size: 12px;
}
.studio-meeting-side-message span {
  white-space: pre-wrap;
  color: var(--st-muted);
}
.studio-meeting-settlement {
  display: grid;
  gap: 10px;
}
.studio-meeting-minutes {
  display: grid;
  gap: 10px;
}
.studio-meeting-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.studio-check-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px;
}
@media (max-width: 900px) {
  .studio-meeting-layout {
    grid-template-columns: 1fr;
  }
}
`;
