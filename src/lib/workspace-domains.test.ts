import { afterEach, describe, expect, it } from "vitest";

import { isWorkspaceEmail, workspaceDomains } from "@/lib/workspace-domains";

const originalDomain = process.env.GOOGLE_WORKSPACE_DOMAIN;

afterEach(() => {
  if (originalDomain === undefined) delete process.env.GOOGLE_WORKSPACE_DOMAIN;
  else process.env.GOOGLE_WORKSPACE_DOMAIN = originalDomain;
});

describe("workspace domain allowlist", () => {
  it("parses a comma-separated list and normalizes case and whitespace", () => {
    process.env.GOOGLE_WORKSPACE_DOMAIN = " Law.Harvard.edu, @g.harvard.edu ,";

    expect(workspaceDomains()).toEqual(["law.harvard.edu", "g.harvard.edu"]);
  });

  it("admits class-year subdomains and staff domains together", () => {
    process.env.GOOGLE_WORKSPACE_DOMAIN = "law.harvard.edu,g.harvard.edu";

    expect(isWorkspaceEmail("student@jd27.law.harvard.edu")).toBe(true);
    expect(isWorkspaceEmail("Student@JD29.law.harvard.edu")).toBe(true);
    expect(isWorkspaceEmail("professor@law.harvard.edu")).toBe(true);
    expect(isWorkspaceEmail("ta@g.harvard.edu")).toBe(true);
  });

  it("rejects look-alike and unrelated domains", () => {
    process.env.GOOGLE_WORKSPACE_DOMAIN = "law.harvard.edu";

    expect(isWorkspaceEmail("student@evillaw.harvard.edu")).toBe(false);
    expect(isWorkspaceEmail("student@law.harvard.edu.example.com")).toBe(false);
    expect(isWorkspaceEmail("student@college.harvard.edu")).toBe(false);
    expect(isWorkspaceEmail("student@gmail.com")).toBe(false);
    expect(isWorkspaceEmail("not-an-email")).toBe(false);
    expect(isWorkspaceEmail(undefined)).toBe(false);
  });

  it("admits nothing when no domain is configured", () => {
    delete process.env.GOOGLE_WORKSPACE_DOMAIN;

    expect(workspaceDomains()).toEqual([]);
    expect(isWorkspaceEmail("student@jd27.law.harvard.edu")).toBe(false);
  });
});
