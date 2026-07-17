import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseCourseMarkdown } from "@/lib/course-markdown";

describe("course Markdown parsing", () => {
  it("recovers from the malformed quoted title that previously aborted retrieval", () => {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "content", "course", "slides-(pictures)", "sherman1-passing-on-defense.md"),
      "utf8",
    );
    const parsed = parseCourseMarkdown(raw, "fallback");
    expect(parsed.usedFallback).toBe(true);
    expect(parsed.title).toContain("Passing-On Defense");
    expect(parsed.content).toContain("Supply chain flow diagram");
  });

  it("continues to parse valid front matter normally", () => {
    const parsed = parseCourseMarkdown("---\ntitle: Valid title\n---\n\n# Body\n", "fallback");
    expect(parsed).toMatchObject({ title: "Valid title", usedFallback: false });
  });
});
