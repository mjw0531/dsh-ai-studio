import { writeFile } from "node:fs/promises";

const url = process.argv[2];
const screenshotPath = process.argv[3] ?? "studio-flow.png";
const cdpPort = Number(process.env.CDP_PORT ?? "9223");
if (url === undefined) {
  console.error("usage: node tools/cdp-flow.mjs <url> [screenshot]");
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

// Dismiss the first-run preview if it is visible.
await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '继续');
  if (button) { button.click(); return true; }
  return false;
})()`);
await sleep(500);

// Open Studio.
await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '工作台');
  if (button) { button.click(); return true; }
  return false;
})()`);
await sleep(1200);

const before = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('.studio-task-card')];
  const target = cards.find((el) => (el.textContent ?? '').includes('搭建 30Hz 固定 tick 骨架'));
  if (target) { target.click(); return { clicked: true, cards: cards.length }; }
  return { clicked: false, cards: cards.length };
})()`);
await sleep(800);

const drawer = await evaluate(`(() => {
  const drawer = document.querySelector('.studio-drawer');
  if (!drawer) return { open: false };
  const checks = [...drawer.querySelectorAll('input[type="checkbox"]')];
  const buttons = [...drawer.querySelectorAll('button')].map((el) => (el.textContent ?? '').trim());
  return {
    open: true,
    text: (drawer.textContent ?? '').slice(0, 1600),
    checkboxes: checks.length,
    checked: checks.filter((input) => input.checked).length,
    buttons,
  };
})()`);

console.log("before:", JSON.stringify(before));
console.log("drawer:", JSON.stringify(drawer, null, 2));

if (drawer.open === true) {
  const toggled = await evaluate(`(() => {
    const drawer = document.querySelector('.studio-drawer');
    const input = drawer ? [...drawer.querySelectorAll('input[type="checkbox"]')].find((el) => !el.checked) : undefined;
    if (input) { input.click(); return true; }
    return false;
  })()`);
  await sleep(900);
  const afterToggle = await evaluate(`(() => {
    const drawer = document.querySelector('.studio-drawer');
    const checks = drawer ? [...drawer.querySelectorAll('input[type="checkbox"]')] : [];
    const toast = document.querySelector('.studio-toast');
    return {
      checked: checks.filter((input) => input.checked).length,
      toast: toast ? toast.textContent : null,
      acceptButtonDisabled: (() => {
        const button = drawer ? [...drawer.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '验收通过') : undefined;
        return button ? button.disabled : null;
      })(),
    };
  })()`);
  console.log("toggle:", toggled, JSON.stringify(afterToggle, null, 2));

  const evidenceFilled = await evaluate(`(() => {
    const drawer = document.querySelector('.studio-drawer');
    const input = drawer ? [...drawer.querySelectorAll('input')].find((el) => (el.placeholder ?? '').includes('pnpm test')) : undefined;
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'pnpm test ability — 42 passed');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(300);
  const evidenceClicked = await evaluate(`(() => {
    const drawer = document.querySelector('.studio-drawer');
    const button = drawer ? [...drawer.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '记录') : undefined;
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await sleep(1000);

  const afterEvidence = await evaluate(`(() => {
    const drawer = document.querySelector('.studio-drawer');
    const toast = document.querySelector('.studio-toast');
    return {
      toast: toast ? toast.textContent : null,
      text: drawer ? (drawer.textContent ?? '').slice(0, 1200) : null,
      acceptButtonDisabled: (() => {
        const button = drawer ? [...drawer.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '验收通过') : undefined;
        return button ? button.disabled : null;
      })(),
    };
  })()`);
  console.log("evidence:", evidenceFilled, evidenceClicked, JSON.stringify(afterEvidence, null, 2));

  const accepted = await evaluate(`(() => {
    const drawer = document.querySelector('.studio-drawer');
    const button = drawer ? [...drawer.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '验收通过') : undefined;
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  await sleep(1200);
  const afterAccept = await evaluate(`(() => {
    const toast = document.querySelector('.studio-toast');
    const drawer = document.querySelector('.studio-drawer');
    return {
      accepted: ${JSON.stringify(true)},
      toast: toast ? toast.textContent : null,
      drawerText: drawer ? (drawer.textContent ?? '').slice(0, 300) : null,
    };
  })()`);
  console.log("accepted:", accepted, JSON.stringify(afterAccept, null, 2));
}

const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
await writeFile(screenshotPath, Buffer.from(shot.data, "base64"));
console.log("screenshot:", screenshotPath);
if (exceptions.length > 0) console.log("\nEXCEPTIONS:\n" + exceptions.join("\n"));
if (logs.length > 0) console.log("\nCONSOLE:\n" + logs.slice(-40).join("\n"));
ws.close();
