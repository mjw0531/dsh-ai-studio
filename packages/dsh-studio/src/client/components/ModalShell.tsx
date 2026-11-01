import type { ReactNode } from "react";
import { IconX } from "../icons.js";

export function ModalShell({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="studio-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="studio-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="studio-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle !== undefined ? (
              <div className="studio-muted">{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="studio-btn"
            data-size="icon"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
            aria-label="关闭"
          >
            <IconX width={15} height={15} />
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

