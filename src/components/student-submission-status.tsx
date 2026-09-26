"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  FeedbackResult,
  WaitingView,
  type ProgressDisplay,
} from "@/components/practice-workspace";
import type { FeedbackRun } from "@/lib/types";

export function StudentSubmissionStatus({
  submissionId,
  examLabel,
  initialStatus,
  initialProgress,
  initialRun,
  initialErrorReference,
}: {
  submissionId: string;
  examLabel: string;
  initialStatus: string;
  initialProgress?: ProgressDisplay;
  initialRun?: FeedbackRun;
  initialErrorReference?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(initialProgress);
  const [run, setRun] = useState(initialRun);
  const [errorReference, setErrorReference] = useState(initialErrorReference);
  const [pollError, setPollError] = useState("");

  useEffect(() => {
    if (run || status === "failed" || status === "refunded") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const response = await fetch(`/api/student/submissions/${encodeURIComponent(submissionId)}`, {
          cache: "no-store",
        });
        const payload = await response.json() as {
          status?: string;
          progress?: ProgressDisplay;
          run?: FeedbackRun;
          error?: string;
          errorReference?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Could not refresh this submission.");
        if (cancelled) return;
        if (payload.status) setStatus(payload.status);
        if (payload.progress) setProgress(payload.progress);
        if (payload.errorReference) setErrorReference(payload.errorReference);
        if (payload.run) {
          setRun(payload.run);
          return;
        }
        timer = setTimeout(poll, 10_000);
      } catch (error) {
        if (cancelled) return;
        setPollError(error instanceof Error ? error.message : "Could not refresh this submission.");
        timer = setTimeout(poll, 15_000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [run, status, submissionId]);

  if (run) {
    return <FeedbackResult run={run} onReset={() => router.push("/student/practice")} />;
  }
  if (status === "failed" || status === "refunded") {
    return (
      <section className="student-submission-message" role="alert">
        <h1>This feedback run could not complete.</h1>
        <p>Your attempt was refunded. Please share the reference below with the course team if you need help.</p>
        {errorReference && <code>{errorReference}</code>}
        <Link href="/student/practice">Start a new practice response</Link>
      </section>
    );
  }
  return (
    <>
      {pollError && <p className="submission-refresh-warning">{pollError} Retrying automatically.</p>}
      <WaitingView examLabel={examLabel} progress={progress} durable />
    </>
  );
}
