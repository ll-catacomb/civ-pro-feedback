import { describe, expect, it } from "vitest";

import { calibrationAnalysisDeveloperPrompt } from "@/lib/prompts";

describe("post-hoc calibration discipline", () => {
  it("does not treat a grade as invented narrative feedback", () => {
    expect(calibrationAnalysisDeveloperPrompt).toContain("not proof of any particular doctrinal claim");
    expect(calibrationAnalysisDeveloperPrompt).toContain("Never invent");
    expect(calibrationAnalysisDeveloperPrompt).toContain("grade_only");
    expect(calibrationAnalysisDeveloperPrompt).toContain("band_calibration");
  });
});
