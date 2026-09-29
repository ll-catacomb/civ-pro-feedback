import { describe, expect, it } from "vitest";

import { assessSubmissionPreflight } from "@/lib/submission-preflight";

const prompt = `Podrick sued Daario after ordering flowers from the Pennsylvania office.
The complaint alleges negligence and seeks two hundred thousand dollars. Discuss
subject matter jurisdiction, personal jurisdiction, Erie, and the motion to dismiss.`;

const base = {
  examPrompt: prompt,
  mode: "full_draft" as const,
  scope: "full_exam" as const,
  examQuestionCount: 4,
};

describe("submission preflight", () => {
  it("rejects an exam-question paste before an attempt is reserved", () => {
    expect(assessSubmissionPreflight({ ...base, answer: prompt })).toMatchObject({
      ok: false,
      reason: "copied_prompt",
    });
  });

  it("rejects a copied fragment of the exam prompt", () => {
    const answer = "The complaint alleges negligence and seeks two hundred thousand dollars. Discuss subject matter jurisdiction, personal jurisdiction, Erie, and the motion to dismiss.";
    expect(assessSubmissionPreflight({ ...base, answer })).toMatchObject({
      ok: false,
      reason: "copied_prompt",
    });
  });

  it("rejects an accidental fragment of a whole-exam prose answer", () => {
    const answer = "There is diversity jurisdiction because the parties are diverse and the amount in controversy exceeds seventy five thousand dollars. The court should therefore hear the claim, but I still need to paste the rest";
    expect(assessSubmissionPreflight({ ...base, answer })).toMatchObject({
      ok: false,
      reason: "too_brief",
    });
  });

  it("allows a concise single-question answer", () => {
    const answer = "The court likely has specific personal jurisdiction because Daario purposefully availed itself of Pennsylvania through its office and sale there. The claim arises from that contact, and exercising jurisdiction appears fair given the forum evidence and state interest.";
    expect(assessSubmissionPreflight({
      ...base,
      answer,
      scope: "single_question",
      examQuestionCount: 4,
    })).toEqual({ ok: true });
  });

  it("allows a compact bullet outline", () => {
    const answer = `SMJ: complete diversity; amount in controversy exceeds $75,000.
PJ: purposeful availment through Pennsylvania office; claim arises from contact.
Erie: compare federal timing rule with state rule; analyze collision and validity.
Pleading: identify duty, breach, causation, and damages facts.`;
    expect(assessSubmissionPreflight({ ...base, answer, mode: "bullet_points" }))
      .toEqual({ ok: true });
  });

  it("allows a substantive answer that naturally repeats exam facts", () => {
    const answer = `There is diversity jurisdiction because Podrick and Daario are citizens of different states and the amount in controversy is two hundred thousand dollars. Personal jurisdiction is likely because Daario purposefully operated a Pennsylvania office and the flower claim arises from that contact. The forum is reasonable given the evidence and Pennsylvania's regulatory interest. Under Erie, the court must determine whether the federal timing rule controls and whether it is valid. The negligence allegations also plausibly identify duty, breach, causation, and damages, so dismissal is unlikely.`;
    expect(assessSubmissionPreflight({ ...base, answer })).toEqual({ ok: true });
  });

  it("rejects repeated placeholder text", () => {
    expect(assessSubmissionPreflight({ ...base, answer: "test answer ".repeat(40) }))
      .toMatchObject({ ok: false, reason: "repetitive" });
  });
});
