export function parseMeetingTaskLines(text: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(/^\s*(?:[-*]|\d+[.)])\s*/u, "").trim();
    if (line === "" || seen.has(line)) continue;
    seen.add(line);
    lines.push(line.slice(0, 160));
    if (lines.length >= 10) break;
  }
  return lines;
}
