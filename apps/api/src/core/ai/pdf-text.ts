import { inflateSync } from "node:zlib";

const STREAM = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
const TEXT_OP = /\((?:\\[\s\S]|[^\\)])*\)\s*(?:Tj|'|")|\[((?:\((?:\\[\s\S]|[^\\)])*\)|[^\]])*)\]\s*TJ/g;
const LITERAL = /\(((?:\\[\s\S]|[^\\)])*)\)/g;

function unescapeLiteral(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, c: string) => {
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    if (c === "n") return "\n";
    if (c === "r") return "\r";
    if (c === "t") return "\t";
    if (c === "b" || c === "f") return "";
    if (c.startsWith("\n") || c.startsWith("\r")) return "";
    return c;
  });
}

function decodeBytes(latin1: string): string {
  if (latin1.startsWith("\xfe\xff")) {
    let out = "";
    for (let i = 2; i + 1 < latin1.length; i += 2) out += String.fromCharCode((latin1.charCodeAt(i) << 8) | latin1.charCodeAt(i + 1));
    return out;
  }
  const buf = Buffer.from(latin1, "latin1");
  const utf8 = buf.toString("utf8");
  return utf8.includes("�") ? latin1 : utf8;
}

function textFromContent(content: string): string[] {
  const lines: string[] = [];
  for (const m of content.matchAll(TEXT_OP)) {
    const chunk = m[1] ?? m[0];
    const parts: string[] = [];
    for (const lit of chunk.matchAll(LITERAL)) parts.push(decodeBytes(unescapeLiteral(lit[1]!)));
    const line = parts.join("").trim();
    if (line) lines.push(line);
  }
  return lines;
}

export function extractPdfText(data: Buffer, maxChars = 20000): string {
  const raw = data.toString("latin1");
  if (!raw.startsWith("%PDF")) return "";
  const lines: string[] = [];
  for (const m of raw.matchAll(STREAM)) {
    const body = m[1]!;
    let content = body;
    try {
      content = inflateSync(Buffer.from(body, "latin1")).toString("latin1");
    } catch {
      content = body;
    }
    lines.push(...textFromContent(content));
    if (lines.join("\n").length > maxChars) break;
  }
  return lines.join("\n").slice(0, maxChars);
}
