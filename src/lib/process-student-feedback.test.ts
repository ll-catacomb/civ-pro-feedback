import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { reportStudentFeedbackProgress } from "@/lib/process-student-feedback";

describe("student feedback progress reporting", () => {
  it("does not abort feedback when a display-only progress update fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const gate = { progress: vi.fn().mockRejectedValue(new Error("temporary Apps Script 404")) };
    const submissionId = randomUUID();

    await expect(reportStudentFeedbackProgress(submissionId, "retrieval_rerank", gate))
      .resolves.toBeUndefined();
    expect(gate.progress).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith("Student feedback progress update skipped", expect.objectContaining({
      submissionId,
      stage: "retrieval_rerank",
      error: "temporary Apps Script 404",
    }));
    warning.mockRestore();
  });
});
