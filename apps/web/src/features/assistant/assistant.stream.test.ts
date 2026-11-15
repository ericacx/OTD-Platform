import { describe, expect, it } from "vitest";

import { parseSseBuffer } from "./assistant.stream";

describe("parseSseBuffer", () => {
  it("splits complete events and keeps the unfinished tail", () => {
    const { events, rest } = parseSseBuffer('event: delta\ndata: {"text":"在手"}\n\n: ping\n\nevent: done\ndata: {"a"');
    expect(events).toEqual([{ event: "delta", data: '{"text":"在手"}' }]);
    expect(rest).toBe('event: done\ndata: {"a"');
  });

  it("joins multi-line data, ignores comments and accepts CRLF", () => {
    const { events, rest } = parseSseBuffer("event: error\r\ndata: line1\r\ndata: line2\r\n\r\ndata: plain\n\n");
    expect(events).toEqual([
      { event: "error", data: "line1\nline2" },
      { event: "message", data: "plain" },
    ]);
    expect(rest).toBe("");
  });
});
