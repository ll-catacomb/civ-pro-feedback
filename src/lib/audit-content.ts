import {
  coachDeveloperPrompt,
  evaluationDeveloperPrompt,
  judgeDeveloperPrompt,
  rubricDeveloperPrompt,
  sourceRerankDeveloperPrompt,
  submissionFitDeveloperPrompt,
  submissionFitJudgeDeveloperPrompt,
} from "@/lib/prompts";
import type { GradeBand } from "@/lib/types";

import auditExamplesData from "@/lib/audit-examples-data.json";

// Curated, frozen artifact for external (lawyer) review of prompt version
// civpro-feedback-v4.1.1. The two worked examples are verbatim outputs of the
// eight-fixture calibration benchmark; they are embedded here rather than read
// from the mutable run store so this page stays stable while QA continues.

export const AUDIT_PROMPT_VERSION = "civpro-feedback-v4.1.1";

export type ChainStage = {
  step: string;
  name: string;
  engine: string;
  prompt?: string;
  promptText?: string;
  what: string;
  gate?: boolean;
};

/** The chain in execution order, as implemented in src/lib/feedback-chain.ts. */
export const CHAIN_STAGES: ChainStage[] = [
  {
    step: "0a",
    name: "Exam-responsiveness assessment",
    engine: "Claude · high reasoning",
    prompt: "submissionFitDeveloperPrompt",
    promptText: submissionFitDeveloperPrompt,
    what: "Reads the submission against the selected exam and decides only whether it genuinely attempts that exam. Weak or wrong legal analysis is not penalized here; answering a different exam is.",
  },
  {
    step: "0b",
    name: "Independent responsiveness judge",
    engine: "Claude · high reasoning",
    prompt: "submissionFitJudgeDeveloperPrompt",
    promptText: submissionFitJudgeDeveloperPrompt,
    gate: true,
    what: "A second, conservative pass plus a deterministic local exam-fingerprint signal. If both passes independently score the answer as a different exam with high confidence, the run stops here with zero credit and no substantive grade. A disagreement is flagged for manual review.",
  },
  {
    step: "1",
    name: "Weighted issue map",
    engine: "Claude · medium reasoning",
    prompt: "rubricDeveloperPrompt",
    promptText: rubricDeveloperPrompt,
    what: "Builds a point-aware map of every scored question and subpart from the exam and the instructor model answer, preserving the exam's stated point allocations exactly (never normalized to 100).",
  },
  {
    step: "2",
    name: "Course-material retrieval",
    engine: "Hybrid search · no model",
    what: "Retrieves 48 candidate excerpts from 451 course files by fusing semantic similarity (OpenAI text-embedding-3-large) with lexical ranking. Falls back to lexical-only if embeddings are unavailable. Historical exams are excluded so unrelated exams cannot contaminate feedback.",
  },
  {
    step: "3",
    name: "Evidence rerank",
    engine: "Claude · low reasoning",
    prompt: "sourceRerankDeveloperPrompt",
    promptText: sourceRerankDeveloperPrompt,
    what: "Curates the 48 candidates down to the ≤24 most doctrinally relevant excerpts, covering every high-weight issue before adding secondary material.",
  },
  {
    step: "4",
    name: "Blind evaluation (assigns the band)",
    engine: "Claude · high reasoning",
    prompt: "evaluationDeveloperPrompt",
    promptText: evaluationDeveloperPrompt,
    what: "Grades the answer criterion by criterion, then bands it comparatively against instructor-graded reference answers (stronger / comparable / weaker, question by question) and records a within-band lean. This stage owns the grade; it never sees the answer's real grade.",
  },
  {
    step: "5",
    name: "Coaching draft",
    engine: "Claude · medium reasoning",
    prompt: "coachDeveloperPrompt",
    promptText: coachDeveloperPrompt,
    what: "Turns the evaluation into at most five prioritized, answer-specific improvements a student can act on, with a concrete example of a stronger move.",
  },
  {
    step: "6",
    name: "Skeptical judge",
    engine: "Claude · high reasoning",
    prompt: "judgeDeveloperPrompt",
    promptText: judgeDeveloperPrompt,
    what: "Verifies every claim, quotation, and citation in the draft against the answer and sources, and returns a corrected, publication-ready version. This is the safety net that catches doctrinal errors before a student ever sees them.",
  },
];

export type AuditFeedbackBlock = {
  headline: string;
  overview: string;
  strengths: { label: string; detail: string; answerExcerpt: string; sources: string[] }[];
  improvements: { priority: "high" | "medium" | "low"; label: string; whatHappened: string; whyItMatters: string; howToImprove: string; sources: string[] }[];
  revisionPlan: string[];
  exampleRevision: string;
  closing: string;
};

export type AuditExample = {
  key: "accurate" | "wrong";
  tabLabel: string;
  tabHint: string;
  examTitle: string;
  actual: GradeBand;
  predicted: GradeBand;
  lean: "low" | "solid" | "high";
  distance: number;
  qualityScore: number;
  editorial: string;
  bandRationale: string;
  whyNotHigher: string;
  whyNotLower: string;
  feedback: AuditFeedbackBlock;
  judgeFindings: { severity: "note" | "warning" | "critical"; problem: string; correction: string }[];
};

// Verbatim, complete system output for the two worked examples, generated from
// the calibration runs (full student-facing feedback, source IDs resolved to
// course-material titles). Curated framing fields are merged in at build time.
export const AUDIT_EXAMPLES = auditExamplesData as AuditExample[];

export type ChangeSurface = {
  title: string;
  path: string;
  blurb: string;
  items: { name: string; detail: string }[];
};

/** The two places a reviewer can direct changes, per the review brief. */
export const CHANGE_SURFACES: ChangeSurface[] = [
  {
    title: "1 · How the chain is constructed",
    path: "src/lib/feedback-chain.ts",
    blurb:
      "The order, presence, and configuration of the stages above all live in one file. Each stage is a single call; a stage can be reordered, removed, or added by moving or copying one block. Model choice and reasoning effort per stage are set here, and the model names are overridable in .env.local without touching code.",
    items: [
      { name: "Stage order & gating", detail: "The sequence of stages and the zero-credit gate logic (both responsiveness passes must independently agree) are in runFeedbackChain / runFeedbackIntake." },
      { name: "Model & reasoning effort", detail: "WORK_MODEL and JUDGE_MODEL (default claude-opus-4-8) and each stage's reasoning effort (low / medium / high) are set at the top of the file and per call." },
      { name: "Retrieval breadth", detail: "RETRIEVAL_CANDIDATE_LIMIT (48) and FINAL_SOURCE_LIMIT (24) control how much course material is searched and how much reaches the evaluator." },
    ],
  },
  {
    title: "2 · The prompts & context in the chain",
    path: "src/lib/prompts.ts · src/lib/anchors.ts · content/",
    blurb:
      "What each stage is told to do, and the material it is given, are edited separately from the wiring. Every instruction is plain English in one file; the graded reference answers that anchor the band are assembled in a second; and the course corpus and exams live as Markdown on disk.",
    items: [
      { name: "Stage instructions", detail: "prompts.ts holds every developer prompt by name — e.g. evaluationDeveloperPrompt is the grading rubric and banding rules, judgeDeveloperPrompt is the skeptical-verifier instruction. Editing the band definitions or the shoulder-flag rule happens here." },
      { name: "Grading reference answers", detail: "anchors.ts assembles the instructor-graded reference answers (one per band) the evaluation compares against. Which answers anchor which band, and the leave-one-out rule, are set here." },
      { name: "Course corpus, exams & model answers", detail: "content/ holds the 451 course files, the three exams and instructor model answers, and the eight graded calibration answers. Adding or correcting course material changes what the system can cite." },
    ],
  },
];
