import { NextResponse } from "next/server";
import { z } from "zod";

import { runEvaluatorSweep } from "@/lib/evaluator-sweep";
import { FeedbackConfigurationError } from "@/lib/feedback-chain";

export const runtime = "nodejs";
export const maxDuration = 600;

const EvaluatorSweepRequestSchema = z.object({
  scope: z.enum(["smoke", "full"]),
  fixtureIds: z.array(z.string()).max(8).optional(),
});

export async function POST(request: Request) {
  try {
    const input = EvaluatorSweepRequestSchema.parse(await request.json());
    const sweep = await runEvaluatorSweep(input);
    return NextResponse.json({ sweep });
  } catch (error) {
    if (error instanceof FeedbackConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && (error.name === "ZodError" || error instanceof SyntaxError)) {
      return NextResponse.json(
        { error: "Choose a sweep scope before starting paid evaluation calls." },
        { status: 400 },
      );
    }
    console.error("Evaluator sweep failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The evaluator sweep could not complete." },
      { status: 500 },
    );
  }
}
