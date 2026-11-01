import type { BootstrapResponse } from "../../shared/types.js";
import { IconSpark } from "../icons.js";
import { formatDate } from "../lib/format.js";

export function RecentEvents({ events }: { events: BootstrapResponse["events"] }) {
  return (
    <section className="studio-panel">
      <div className="studio-panel-head">
        <IconSpark width={14} height={14} />
        <h3>最近活动</h3>
        <span className="studio-muted">append-only 事件</span>
      </div>
      <div className="studio-panel-body">
        {events.length === 0 ? (
          <div className="studio-faint" style={{ fontSize: 11 }}>
            还没有事件。
          </div>
        ) : (
          <div className="studio-events">
            {events.slice(0, 8).map((event) => (
              <div key={event.id} className="studio-event">
                <span className="studio-event-dot" />
                <span>
                  <span className="studio-mono">{event.type}</span>
                  {event.taskId !== null ? (
                    <span className="studio-faint"> · {event.taskId}</span>
                  ) : null}
                </span>
                <span className="studio-event-time">{formatDate(event.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

