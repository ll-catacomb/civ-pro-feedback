import type { RetrievedSource } from "@/lib/types";

const SOURCE_GROUPS: Array<[prefix: string, label: string]> = [
  ["content/course/casebook/", "Online casebook"],
  ["content/course/outline/", "Class notes"],
  ["content/course/lectures-videos/", "Class recording or summary"],
  ["content/course/slides-(pictures)/", "Course slides"],
  ["content/course/study-aids/", "Course study aid"],
  ["content/course/rules-statutes-constitution/", "Rule, statute, or Constitution"],
  ["content/course/assignments/", "Practice assignment"],
];

export function courseSourceLabel(source: Pick<RetrievedSource, "path" | "title">): string {
  // Persisted pilot runs can still contain these even though current retrieval
  // excludes them. Label them honestly instead of grouping them with course
  // authority such as the casebook or rules.
  if (source.path.includes("/assignments/") && source.path.includes("model-answer")) {
    return `Past student exemplar · ${source.title}`;
  }
  const group = SOURCE_GROUPS.find(([prefix]) => source.path.startsWith(prefix))?.[1]
    ?? "Course material";
  return `${group} · ${source.title}`;
}

export function courseSourceAnchor(sourceId: string): string {
  return `course-source-${sourceId.replace(/[^a-z0-9_-]+/gi, "-")}`;
}
