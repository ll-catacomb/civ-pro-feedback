import { z } from "zod";

export const GradeBandSchema = z.enum(["DS", "H", "P", "LP"]);
export type GradeBand = z.infer<typeof GradeBandSchema>;

export const SubmissionFitAssessmentSchema = z.object({
  status: z.enum(["responsive", "nonresponsive", "uncertain"]),
  responsivenessScore: z.number().int().min(0).max(100),
  questionCoverage: z.array(z.object({
    questionLabel: z.string(),
    addressed: z.boolean(),
    answerEvidence: z.string(),
  })),
  selectedExamEvidence: z.array(z.string()),
  mismatchEvidence: z.array(z.string()),
  likelyOtherExam: z.string(),
  recommendation: z.enum(["full_evaluation", "zero_credit", "manual_review"]),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});
export type SubmissionFitAssessment = z.infer<typeof SubmissionFitAssessmentSchema>;

export const SubmissionFitJudgeSchema = z.object({
  status: z.enum(["responsive", "nonresponsive", "uncertain"]),
  responsivenessScore: z.number().int().min(0).max(100),
  recommendation: z.enum(["full_evaluation", "zero_credit", "manual_review"]),
  agreesWithFirstPass: z.boolean(),
  controllingEvidence: z.array(z.string()),
  likelyOtherExam: z.string(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});
export type SubmissionFitJudge = z.infer<typeof SubmissionFitJudgeSchema>;

export const AssessmentOutcomeSchema = z.object({
  creditStatus: z.enum(["evaluated", "zero_nonresponsive", "manual_review"]),
  score: z.number().int().min(0).max(100).nullable(),
  rationale: z.string(),
});
export type AssessmentOutcome = z.infer<typeof AssessmentOutcomeSchema>;

export const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string(),
  excerpt: z.string(),
  score: z.number(),
  retrievalMethod: z.enum(["hybrid", "lexical_fallback"]).optional(),
  semanticScore: z.number().optional(),
  lexicalScore: z.number().optional(),
  rerankRelevance: z.number().int().min(1).max(4).optional(),
  rerankReason: z.string().optional(),
});
export type RetrievedSource = z.infer<typeof SourceSchema>;

export const SourceRerankSchema = z.object({
  selections: z.array(z.object({
    sourceId: z.string(),
    relevance: z.number().int().min(1).max(4),
    reason: z.string(),
  })).min(1).max(24),
  uncoveredRisks: z.array(z.string()),
});
export type SourceRerank = z.infer<typeof SourceRerankSchema>;

export const HistoricalFeedbackSchema = z.object({
  author: z.string(),
  date: z.string().optional(),
  text: z.string(),
  anchor: z.string(),
});
export type HistoricalFeedback = z.infer<typeof HistoricalFeedbackSchema>;

export const CalibrationAnalysisSchema = z.object({
  evidenceBasis: z.enum(["narrative_feedback", "grade_only"]),
  gradeAgreement: z.enum(["exact", "adjacent", "material_miss", "not_applicable"]),
  summary: z.string(),
  alignedFindings: z.array(z.object({
    chainFinding: z.string(),
    benchmarkEvidence: z.string(),
    assessment: z.string(),
  })),
  missedFindings: z.array(z.object({
    benchmarkEvidence: z.string(),
    chainCoverage: z.string(),
    severity: z.enum(["low", "medium", "high"]),
  })),
  unsupportedOrOverstatedFindings: z.array(z.object({
    chainFinding: z.string(),
    problem: z.string(),
    severity: z.enum(["low", "medium", "high"]),
  })),
  promptRecommendations: z.array(z.object({
    targetStage: z.enum(["submission_fit", "issue_map", "retrieval", "evaluation", "feedback_draft", "judge", "band_calibration", "claude_chain", "cross_judge", "feedback_merge", "final_decision"]),
    problem: z.string(),
    proposedChange: z.string(),
    evidence: z.string(),
  })),
});
export type CalibrationAnalysis = z.infer<typeof CalibrationAnalysisSchema>;

export const CriterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  // The exam's stated point value for this scored question/subpart. Null when
  // the exam supplies no allocation. This is deliberately not normalized.
  weight: z.number().nonnegative().nullable(),
  expectedAnalysis: z.array(z.string()),
  commonFailures: z.array(z.string()),
  authoritySourceIds: z.array(z.string()),
});

export const IssueMapSchema = z.object({
  examOverview: z.string(),
  criteria: z.array(CriterionSchema).min(1),
  crossCuttingSkills: z.array(z.string()),
  uncertaintyNotes: z.array(z.string()),
});
export type IssueMap = z.infer<typeof IssueMapSchema>;

export const EvaluationSchema = z.object({
  criteria: z.array(
    z.object({
      criterionId: z.string(),
      coverage: z.number().int().min(0).max(4),
      finding: z.string(),
      answerEvidence: z.string(),
      sourceIds: z.array(z.string()),
      errorType: z.enum([
        "none",
        "omission",
        "rule_error",
        "application_gap",
        "counterargument_gap",
        "organization",
        "unsupported_assertion",
      ]),
    }),
  ),
  strengths: z.array(z.string()),
  priorityGaps: z.array(z.string()),
  provisionalBand: GradeBandSchema,
  // Where the answer sits inside its band; "high" renders as a shoulder flag
  // (e.g. H+). Optional so runs persisted before v4.1.0 still validate.
  bandLean: z.enum(["low", "solid", "high"]).optional(),
  bandRationale: z.string(),
  whyNotHigher: z.string(),
  whyNotLower: z.string(),
  confidence: z.number().min(0).max(1),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;

export const BandAssessmentSchema = z.object({
  recommendedBand: GradeBandSchema,
  dimensions: z.object({
    issueCoverage: z.number().int().min(0).max(4),
    doctrinalAccuracy: z.number().int().min(0).max(4),
    applicationDepth: z.number().int().min(0).max(4),
    prioritization: z.number().int().min(0).max(4),
    examExecution: z.number().int().min(0).max(4),
  }),
  decisiveStrengths: z.array(z.string()),
  decisiveWeaknesses: z.array(z.string()),
  evaluatorCorrections: z.array(z.string()),
  whyNotHigher: z.string(),
  whyNotLower: z.string(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});
export type BandAssessment = z.infer<typeof BandAssessmentSchema>;

export const FeedbackSchema = z.object({
  headline: z.string(),
  overview: z.string(),
  strengths: z.array(
    z.object({
      label: z.string(),
      detail: z.string(),
      answerExcerpt: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
  improvements: z.array(
    z.object({
      priority: z.enum(["high", "medium", "low"]),
      label: z.string(),
      whatHappened: z.string(),
      whyItMatters: z.string(),
      howToImprove: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
  revisionPlan: z.array(z.string()),
  exampleRevision: z.string(),
  closing: z.string(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const JudgeSchema = z.object({
  approved: z.boolean(),
  qualityScore: z.number().int().min(0).max(100),
  checks: z.object({
    doctrinalGrounding: z.number().int().min(0).max(4),
    answerSpecificity: z.number().int().min(0).max(4),
    pedagogicalUsefulness: z.number().int().min(0).max(4),
    internalConsistency: z.number().int().min(0).max(4),
    calibrationDiscipline: z.number().int().min(0).max(4),
  }),
  findings: z.array(
    z.object({
      severity: z.enum(["note", "warning", "critical"]),
      claim: z.string(),
      problem: z.string(),
      correction: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
  feedback: FeedbackSchema,
});
export type JudgeResult = z.infer<typeof JudgeSchema>;

export const ChainArtifactsSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  issueMap: IssueMapSchema,
  evaluation: EvaluationSchema,
  draftFeedback: FeedbackSchema,
  judge: JudgeSchema,
  // Only present on runs from versions with a separate band-calibration stage.
  bandAssessment: BandAssessmentSchema.optional(),
  sources: z.array(SourceSchema),
});
export type ChainArtifacts = z.infer<typeof ChainArtifactsSchema>;

export const CrossJudgeSchema = z.object({
  reviewedFeedbackAccepted: z.boolean(),
  findings: z.array(
    z.object({
      severity: z.enum(["note", "warning", "critical"]),
      claim: z.string(),
      problem: z.string(),
      correction: z.string(),
    }),
  ),
  bandComparison: z.enum(["agree", "prefer_higher", "prefer_lower"]),
  finalBand: GradeBandSchema,
  finalFeedback: FeedbackSchema,
  whyNotHigher: z.string(),
  whyNotLower: z.string(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});
export type CrossJudge = z.infer<typeof CrossJudgeSchema>;

export const DualDecisionSchema = z.object({
  finalBand: GradeBandSchema,
  bandsAgreed: z.boolean(),
  feedbackSource: z.enum(["claude_judge", "openai_judge", "merged"]),
  finalFeedback: FeedbackSchema,
  // Optional so runs persisted before hedged scoring still validate.
  bandScore: z.number().min(1).max(4).optional(),
  hedgedBand: z.string().optional(),
  decidedBy: z.enum(["provisional_agreement", "judge_agreement", "majority", "split", "survivor"]).optional(),
  notes: z.string(),
});
export type DualDecision = z.infer<typeof DualDecisionSchema>;

export const FeedbackRequestSchema = z.object({
  examId: z.enum(["2014-final", "2015-final", "2019-final"]),
  answer: z.string().min(120, "Please submit at least 120 characters."),
  studentLabel: z.string().trim().max(80).optional().default("Anonymous practice"),
  actualGrade: GradeBandSchema.optional(),
});

export const StageTraceSchema = z.object({
  name: z.string(),
  model: z.string(),
  reasoningEffort: z.string(),
  durationMs: z.number(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  responseId: z.string().optional(),
});
export type StageTrace = z.infer<typeof StageTraceSchema>;

export const FeedbackRunSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  source: z.enum(["student", "calibration"]),
  calibrationId: z.string().optional(),
  examId: z.string(),
  examTitle: z.string(),
  studentLabel: z.string(),
  answer: z.string(),
  actualGrade: GradeBandSchema.optional(),
  predictedGrade: GradeBandSchema.optional(),
  calibrationDistance: z.number().int().optional(),
  promptVersion: z.string(),
  inputHash: z.string(),
  submissionFit: SubmissionFitAssessmentSchema.optional(),
  submissionFitJudge: SubmissionFitJudgeSchema.optional(),
  assessmentOutcome: AssessmentOutcomeSchema.optional(),
  issueMap: IssueMapSchema.optional(),
  evaluation: EvaluationSchema.optional(),
  bandAssessment: BandAssessmentSchema.optional(),
  draftFeedback: FeedbackSchema.optional(),
  judge: JudgeSchema.optional(),
  sources: z.array(SourceSchema),
  pipeline: z.enum(["single", "dual"]).optional(),
  pipelineNote: z.string().optional(),
  claudeChain: ChainArtifactsSchema.optional(),
  crossJudges: z.object({
    claudeOnOpenAI: CrossJudgeSchema.optional(),
    openaiOnClaude: CrossJudgeSchema.optional(),
  }).optional(),
  dualDecision: DualDecisionSchema.optional(),
  traces: z.array(StageTraceSchema),
  totalDurationMs: z.number(),
  reviewerRating: z.number().int().min(1).max(5).optional(),
  reviewerNotes: z.string().max(4000).optional(),
  historicalFeedback: z.array(HistoricalFeedbackSchema).optional(),
  calibrationAnalysis: CalibrationAnalysisSchema.optional(),
  calibrationAnalysisVersion: z.string().optional(),
});
export type FeedbackRun = z.infer<typeof FeedbackRunSchema>;

export type Exam = {
  id: "2014-final" | "2015-final" | "2019-final";
  year: number;
  title: string;
  shortDescription: string;
  questionCount: number;
  prompt: string;
  modelAnswer: string;
  promptPath: string;
  modelAnswerPath: string;
};

export type CalibrationFixture = {
  id: string;
  examId: Exam["id"];
  label: string;
  actualGrade: GradeBand;
  answerPath: string;
  status: "ready" | "mismatch";
  note?: string;
  historicalFeedback?: HistoricalFeedback[];
};
