import matter from "gray-matter";

export type ParsedCourseMarkdown = {
  content: string;
  title: string;
  usedFallback: boolean;
};

function fallbackParse(raw: string, fallbackTitle: string): ParsedCourseMarkdown {
  const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const frontmatter = frontmatterMatch?.[1] ?? "";
  const content = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw;
  const titleLine = frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.trim();
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = (titleLine || heading || fallbackTitle)
    .replace(/^['"]|['"]$/g, "")
    .replaceAll('"', "")
    .trim();
  return { content, title, usedFallback: true };
}

export function parseCourseMarkdown(raw: string, fallbackTitle: string): ParsedCourseMarkdown {
  try {
    const parsed = matter(raw);
    return {
      content: parsed.content,
      title: typeof parsed.data.title === "string" ? parsed.data.title : fallbackTitle,
      usedFallback: false,
    };
  } catch {
    return fallbackParse(raw, fallbackTitle);
  }
}
