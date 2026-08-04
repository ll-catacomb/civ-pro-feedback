import { describe, expect, it } from "vitest";

import { retrieveCourseContext } from "@/lib/retrieval";
import type { IssueMap } from "@/lib/types";

const personalJurisdictionIssueMap: IssueMap = {
  examOverview: "Whether the forum may exercise authority over the out-of-state defendant.",
  criteria: [
    {
      id: "c1",
      label: "Personal jurisdiction over the nonresident defendant",
      weight: 40,
      expectedAnalysis: [
        "Apply minimum contacts and purposeful availment.",
        "Address whether the claim arises out of the defendant's forum contacts.",
      ],
      commonFailures: ["Treating mere foreseeability of harm as purposeful availment."],
      authoritySourceIds: [],
    },
  ],
  crossCuttingSkills: ["Applies rules to specific facts"],
  uncertaintyNotes: [],
};

const arisingUnderIssueMap: IssueMap = {
  examOverview: "Whether the district court has subject-matter jurisdiction.",
  criteria: [
    {
      id: "c1",
      label: "Arising-under jurisdiction",
      weight: 30,
      expectedAnalysis: ["Determine whether the plaintiff pleads a federally created cause of action."],
      commonFailures: ["Relying on a federal defense to establish jurisdiction."],
      authoritySourceIds: [],
    },
  ],
  crossCuttingSkills: [],
  uncertaintyNotes: [],
};

describe("course retrieval", () => {
  it("labels a run by whether the query-expansion stage supplied vocabulary", async () => {
    const withExpansion = await retrieveCourseContext(
      {
        issueMap: personalJurisdictionIssueMap,
        answer: "The defendant never entered the forum, so there is no jurisdiction.",
        expansionTerms: ["minimum contacts", "purposeful availment", "long-arm statute"],
      },
      12,
    );
    const withoutExpansion = await retrieveCourseContext(
      {
        issueMap: personalJurisdictionIssueMap,
        answer: "The defendant never entered the forum, so there is no jurisdiction.",
      },
      12,
    );

    expect(withExpansion.length).toBeGreaterThan(0);
    expect(withExpansion.every((source) => source.retrievalMethod === "expanded_lexical")).toBe(true);
    expect(withoutExpansion.every((source) => source.retrievalMethod === "lexical_fallback")).toBe(true);
  });

  it("retrieves only non-exam course material and respects the candidate limit", async () => {
    const sources = await retrieveCourseContext(
      { issueMap: personalJurisdictionIssueMap, answer: "Minimum contacts were absent." },
      10,
    );

    expect(sources.length).toBeLessThanOrEqual(10);
    expect(sources.every((source) => source.path.startsWith("content/course/"))).toBe(true);
    expect(sources.some((source) => source.path.includes("/exams/"))).toBe(false);
  });

  it("caps each document at two excerpts so one long outline cannot crowd out other issues", async () => {
    const sources = await retrieveCourseContext(
      {
        issueMap: personalJurisdictionIssueMap,
        answer: "Minimum contacts, purposeful availment, and relatedness are all contested.",
        expansionTerms: ["minimum contacts", "purposeful availment", "specific jurisdiction"],
      },
      48,
    );

    const perDocument = new Map<string, number>();
    for (const source of sources) {
      perDocument.set(source.path, (perDocument.get(source.path) ?? 0) + 1);
    }
    expect(Math.max(...perDocument.values())).toBeLessThanOrEqual(2);
  });

  it("scores descending and normalizes the top candidate to 1", async () => {
    const sources = await retrieveCourseContext(
      { issueMap: arisingUnderIssueMap, answer: "The complaint pleads only a state-law claim." },
      8,
    );

    expect(sources[0].score).toBeCloseTo(1);
    for (let index = 1; index < sources.length; index += 1) {
      expect(sources[index].score).toBeLessThanOrEqual(sources[index - 1].score);
    }
  });

  // Statute numbers are how Civil Procedure materials actually name the
  // doctrine, and the pre-v4.2.0 tokenizer dropped digit-led tokens entirely.
  it("indexes bare statute numbers so expansion terms like 1331 retrieve material", async () => {
    const sources = await retrieveCourseContext(
      {
        issueMap: arisingUnderIssueMap,
        answer: "The claim is a state-law claim with an embedded federal issue.",
        expansionTerms: ["1331", "§ 1331", "well-pleaded complaint rule"],
      },
      24,
    );

    const corpusText = sources.map((source) => source.excerpt).join("\n");
    expect(corpusText).toContain("1331");
  });

  it("lets expansion vocabulary change which material is retrieved", async () => {
    const baseline = await retrieveCourseContext(
      { issueMap: arisingUnderIssueMap, answer: "There is no basis for federal jurisdiction here." },
      24,
    );
    const expanded = await retrieveCourseContext(
      {
        issueMap: arisingUnderIssueMap,
        answer: "There is no basis for federal jurisdiction here.",
        expansionTerms: ["Erie doctrine", "supplemental jurisdiction", "1367", "removal", "1441"],
      },
      24,
    );

    const baselineIds = new Set(baseline.map((source) => source.id));
    expect(expanded.some((source) => !baselineIds.has(source.id))).toBe(true);
  });
});
