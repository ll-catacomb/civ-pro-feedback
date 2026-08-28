import { describe, expect, it } from "vitest";

import { parseParam, slugify, withParam } from "@/lib/deep-link";

// The hooks in deep-link.ts need a DOM the suite does not have, but the parts
// that decide what a shared link means are pure and are what actually breaks.

describe("slugify", () => {
  it("builds a readable id from a submission's own identity", () => {
    expect(slugify("2019-final", "IE bullets")).toBe("2019-final-ie-bullets");
  });

  it("collapses punctuation and em dashes rather than emitting them raw", () => {
    // Labels are hand-typed by the teaching fellows; a stray dash or bracket
    // must not produce an id that has to be percent-encoded to be shareable.
    const slug = slugify("2022-final", "Mock full draft — 2022 DS (answer)");
    expect(slug).toBe("2022-final-mock-full-draft-2022-ds-answer");
    expect(encodeURIComponent(slug)).toBe(slug);
  });

  it("skips absent parts instead of leaving a doubled separator", () => {
    expect(slugify("2015-p", undefined, null, "")).toBe("2015-p");
  });

  it("distinguishes two reviewers on the same exam", () => {
    expect(slugify("2016-final", "IE bullets")).not.toBe(slugify("2016-final", "McCarthy bullets"));
  });
});

describe("parseParam", () => {
  it("reads a single id", () => {
    expect(parseParam("?open=case-2015-p", "open")).toEqual(["case-2015-p"]);
  });

  it("reads a hand-written list so one link can open a whole assignment", () => {
    expect(parseParam("?open=item-a,item-b,item-c", "open")).toEqual(["item-a", "item-b", "item-c"]);
  });

  it("tolerates the spacing a pasted link picks up", () => {
    expect(parseParam("?open=item-a, item-b ,,", "open")).toEqual(["item-a", "item-b"]);
  });

  it("returns nothing when the parameter is absent or empty", () => {
    expect(parseParam("?other=x", "open")).toEqual([]);
    expect(parseParam("?open=", "open")).toEqual([]);
  });
});

describe("withParam", () => {
  it("adds the parameter to a bare url", () => {
    expect(withParam("https://example.test/", "open", "case-2015-p"))
      .toBe("https://example.test/?open=case-2015-p");
  });

  it("replaces rather than appends, so a copied link opens one card", () => {
    expect(withParam("https://example.test/?open=a,b,c", "open", "case-2015-p"))
      .toBe("https://example.test/?open=case-2015-p");
  });

  it("removes the parameter when everything is closed", () => {
    expect(withParam("https://example.test/?open=a&example=wrong", "open", null))
      .toBe("https://example.test/?example=wrong");
  });

  it("leaves unrelated parameters alone", () => {
    expect(withParam("https://example.test/?example=wrong", "open", "case-2015-p"))
      .toBe("https://example.test/?example=wrong&open=case-2015-p");
  });
});
