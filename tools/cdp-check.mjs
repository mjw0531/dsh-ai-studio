import { writeFile } from "node:fs/promises";

const url = process.argv[2];
const screenshotPath = process.argv[3] ?? "studio-shot.png";
const waitMs = Number(process.argv[4] ?? "9000");
const cdpPort = Number(process.env.CDP_PORT ?? "9223");

if (url === undefined) {
  console.error("usage: node tools/cdp-check.mjs <url> [screenshot] [waitMs]");
  process.exit(2);
}

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const target = targets.find((item) => item.type === "page");
if (target === undefined) {
  console.error("no page target");
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const logs = [];
const exceptions = [];

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (typeof message.id === "number") {
    const entry = pending.get(message.id);
    if (entry !== undefined) {
      pending.delete(message.id);
      if (message.error !== undefined) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    }
    return;
  }
  if (message.method === "Runtime.consoleAPICalled") {
    const text = message.params.args
      .map((arg) => arg.value ?? arg.description ?? "")
      .join(" ");
    logs.push(`[${message.params.type}] ${text}`);
  }
  if (message.method === "Runtime.exceptionThrown") {
    exceptions.push(JSON.stringify(message.params.exceptionDetails, null, 2));
  }
  if (message.method === "Log.entryAdded") {
    logs.push(`[log:${message.params.entry.level}] ${message.params.entry.text}`);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, waitMs));

const dismissText = process.env.DISMISS_TEXT ?? "继续";
if (dismissText !== "") {
  await send("Runtime.evaluate", {
    expression: `(() => {
      const button = [...document.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === ${JSON.stringify(dismissText)});
      if (button) { button.click(); return true; }
      return false;
    })()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
}

const clickTexts = (process.env.CLICK_TEXTS ?? process.env.CLICK_TEXT ?? "")
  .split("|")
  .map((text) => text.trim())
  .filter(Boolean);
for (const clickText of clickTexts) {
  const clicked = await send("Runtime.evaluate", {
    expression: `(() => {
      const candidates = [...document.querySelectorAll('button, a, [role="button"]')];
      const target = candidates.find((el) => (el.textContent ?? '').trim().startsWith(${JSON.stringify(clickText)}));
      if (target === undefined) return false;
      target.click();
      return true;
    })()`,
    returnByValue: true,
  });
  console.log(`click "${clickText}": ${String(clicked.result.value)}`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

const openTask = process.env.OPEN_TASK;
if (openTask !== undefined && openTask !== "") {
  const opened = await send("Runtime.evaluate", {
    expression: `(() => {
      const cards = [...document.querySelectorAll('.studio-task-card')];
      const target = cards.find((el) => (el.textContent ?? '').includes(${JSON.stringify(openTask)}));
      if (target === undefined) return false;
      target.click();
      return true;
    })()`,
    returnByValue: true,
  });
  console.log(`open task "${openTask}": ${String(opened.result.value)}`);
  await new Promise((resolve) => setTimeout(resolve, 900));
}

const taskActionText = process.env.TASK_ACTION_TEXT;
if (taskActionText !== undefined && taskActionText !== "") {
  const clicked = await send("Runtime.evaluate", {
    expression: `(() => {
      const candidates = [...document.querySelectorAll('button, a, [role="button"]')];
      const target = candidates.find((el) => (el.textContent ?? '').trim().startsWith(${JSON.stringify(taskActionText)}));
      if (target === undefined) return false;
      target.click();
      return true;
    })()`,
    returnByValue: true,
  });
  console.log(`task action "${taskActionText}": ${String(clicked.result.value)}`);
  await new Promise((resolve) => setTimeout(resolve, 4000));
}

const evaluated = await send("Runtime.evaluate", {
  expression: `(() => {
    const root = document.querySelector('.studio-root');
    const title = document.querySelector('.studio-title');
    const bodyText = document.body.innerText ?? '';
    return {
      href: location.href,
      title: document.title,
      hasStudioRoot: root !== null,
      studioTitle: title?.textContent ?? null,
      bodyText: bodyText.slice(0, 4000),
      boot: window.__DSH_STUDIO__ ?? null,
    };
  })()`,
  returnByValue: true,
  awaitPromise: true,
});

console.log(JSON.stringify(evaluated.result.value, null, 2));
if (exceptions.length > 0) {
  console.log("\nEXCEPTIONS:\n" + exceptions.join("\n"));
}
if (logs.length > 0) {
  console.log("\nCONSOLE:\n" + logs.slice(-80).join("\n"));
}

const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
await writeFile(screenshotPath, Buffer.from(shot.data, "base64"));
console.log(`\nscreenshot: ${screenshotPath}`);

ws.close();
