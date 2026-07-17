import { NextResponse } from "next/server";

import { FeedbackConfigurationError, FeedbackStageError, runFeedbackChain } from "@/lib/feedback-chain";
import { saveFailure, saveRun } from "@/lib/store";
import { FeedbackRequestSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: Request) {
  let failureContext: { examId: string; studentLabel: string; answer: string } | undefined;
  try {
    const input = FeedbackRequestSchema.parse(await request.json());
    failureContext = input;
    const run = await runFeedbackChain({ ...input, source: "student" });
    await saveRun(run);
    return NextResponse.json({ run });
  } catch (error) {
    if (error instanceof FeedbackConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "The submission is incomplete." }, { status: 400 });
    }
    console.error("Feedback chain failed", error);
    const reference = await saveFailure({
      source: "student",
      ...failureContext,
      stage: error instanceof FeedbackStageError ? error.stageName : undefined,
      message: error instanceof Error ? error.message : "Unknown feedback-chain failure",
    });
    return NextResponse.json(
      {
        error: `The feedback chain could not complete${error instanceof FeedbackStageError ? ` during ${error.stageName}` : ""}. The submission was saved under error reference ${reference}.`,
      },
      { status: 500 },
    );
  }
}
