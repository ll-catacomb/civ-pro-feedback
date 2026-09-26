import "server-only";

// GOOGLE_WORKSPACE_DOMAIN is a comma-separated list. Each entry admits the
// domain itself and any subdomain, so "law.harvard.edu" covers class-year
// addresses such as jd27.law.harvard.edu without yearly configuration changes.
export function workspaceDomains(): string[] {
  return (process.env.GOOGLE_WORKSPACE_DOMAIN ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isWorkspaceEmail(email: string | null | undefined, domains = workspaceDomains()): boolean {
  if (!email) return false;
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at === -1) return false;
  const emailDomain = email.trim().toLowerCase().slice(at + 1);
  return domains.some((domain) => emailDomain === domain || emailDomain.endsWith(`.${domain}`));
}
