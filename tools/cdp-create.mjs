import { writeFile } from "node:fs/promises";

const url = process.argv[2];
const screenshotPath = process.argv[3] ?? "studio-create.png";
const cdpPort = Number(process.env.CDP_PORT ?? "9223");
if (url === undefined) {
  console.error("usage: node tools/cdp-create.mjs <url> [screenshot]");
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
    logs.push(
      `[${message.params.type}] ${message.params.args
        .map((arg) => arg.value ?? arg.description ?? "")
        .join(" ")}`,
    );
  }
  if (message.method === "Runtime.exceptionThrown") {
    exceptions.push(JSON.stringify(message.params.exceptionDetails, null, 2));
  }
});
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails !== undefined) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url });
await sleep(6500);
await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '继续');
  if (button) button.click();
  return true;
})()`);
await sleep(400);
await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '工作台');
  if (button) button.click();
  return true;
})()`);
await sleep(1000);

const opened = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '新建任务');
  if (!button) return false;
  button.click();
  return true;
})()`);
await sleep(400);

const filled = await evaluate(`(() => {
  const fill = (selector, value) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  return {
    title: fill('#task-title', 'UI 创建的任务'),
    goal: fill('#task-goal', '验证表单创建链路和持久化。'),
    acceptance: fill('#task-acceptance', '任务卡片出现在看板\\n刷新后仍然存在'),
    branch: fill('#task-branch', 'task/ui-create'),
  };
})()`);
await sleep(300);

const submitted = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '创建任务');
  if (!button) return false;
  button.click();
  return true;
})()`);
await sleep(1600);

const result = await evaluate(`(() => {
  const toast = document.querySelector('.studio-toast');
  const modal = document.querySelector('.studio-modal');
  const cards = [...document.querySelectorAll('.studio-task-card')];
  return {
    toast: toast ? toast.textContent : null,
    modalStillOpen: modal !== null,
    cardCount: cards.length,
    hasCreated: cards.some((el) => (el.textContent ?? '').includes('UI 创建的任务')),
    cardText: cards.map((el) => (el.textContent ?? '').replace(/\\s+/g, ' ').trim()).find((text) => text.includes('UI 创建的任务')) ?? null,
  };
})()`);
console.log("opened:", opened);
console.log("filled:", JSON.stringify(filled));
console.log("submitted:", submitted);
console.log("result:", JSON.stringify(result, null, 2));

const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
await writeFile(screenshotPath, Buffer.from(shot.data, "base64"));
console.log("screenshot:", screenshotPath);
if (exceptions.length > 0) console.log("\nEXCEPTIONS:\n" + exceptions.join("\n"));
if (logs.length > 0) console.log("\nCONSOLE:\n" + logs.slice(-30).join("\n"));
ws.close();
