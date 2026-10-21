const url = process.argv[2];
const cdpPort = Number(process.env.CDP_PORT ?? "9225");
if (url === undefined) {
  console.error("usage: node tools/cdp-text.mjs <url>");
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
    logs.push(`[exception] ${message.params.exceptionDetails.text}`);
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
await send("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 10000));
const result = await send("Runtime.evaluate", {
  expression: `({
    href: location.href,
    title: document.title,
    text: (document.body.innerText ?? '').slice(0, 30000),
  })`,
  returnByValue: true,
});
console.log(JSON.stringify(result.result.value, null, 2));
if (logs.length > 0) console.log("\nLOGS:\n" + logs.slice(-30).join("\n"));
ws.close();
