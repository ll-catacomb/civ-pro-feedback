import { NextResponse } from "next/server";
import { z } from "zod";

import { updateRunReview } from "@/lib/store";

const ReviewSchema = z.object({
  reviewerRating: z.number().int().min(1).max(5).optional(),
  reviewerNotes: z.string().max(4000).optional(),
});

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const run = await updateRunReview(id, ReviewSchema.parse(await request.json()));
    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save review." },
      { status: 400 },
    );
  }
}
