import type { ComponentType } from "react";

import { StudioPage } from "./StudioPage.js";
import { studioCss } from "./styles.js";

export const name = "dsh-studio-client";

/** Browser services this plugin needs. */
export const inject = ["slots", "layout"];

interface SlotRegistrationOptions {
  name: string;
  key?: string;
  id?: string;
  order?: number;
  label?: () => string;
}

interface ClientSlotsLike {
  inject(
    name: string,
    factory: () => Generator<unknown, void, unknown> | (() => unknown),
  ): void;
  register(
    options: SlotRegistrationOptions,
    component: ComponentType,
  ): () => void;
}

interface ClientContext {
  slots: ClientSlotsLike;
  effect(execute: () => () => void, label?: string): void;
  logger?: {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
  };
}

function StudioIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5Z" />
      <path d="M8 10.5v4M12 8.5v7M16 10.5v4" />
    </svg>
  );
}

/**
 * Install the Studio page into the DSH Web shell.
 *
 * The page is an ordinary `main` panel plus one sidebar entry, so it participates
 * in the host's normal navigation instead of opening a second browser surface.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.dshStudio = "true";
    style.textContent = studioCss;
    document.head.append(style);
    return () => {
      style.remove();
    };
  }, "dsh-studio: styles");

  ctx.slots.inject("main", function* () {
    yield ctx.slots.register(
      {
        name: "main",
        key: "studio",
      },
      StudioPage,
    );
  });

  ctx.slots.inject("sidebar.panellist", () =>
    ctx.slots.register(
      {
        name: "sidebar.panellist",
        id: "studio",
        order: 12,
        label: () => "AI 工作室",
      },
      StudioIcon,
    ),
  );

  ctx.logger?.info("dsh-studio client mounted");
}
