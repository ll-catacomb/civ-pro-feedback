"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

import { copyText, panelUrl } from "@/lib/deep-link";

/**
 * Copies a link that opens one specific panel.
 *
 * Sits beside the card's expand button rather than inside it: the expander is
 * itself a <button>, and nesting one inside another is invalid HTML that
 * browsers resolve by hoisting the inner control out of the card entirely.
 */
export function CopyLink({ param, slug, title }: { param: string; slug: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`copy-link ${copied ? "is-copied" : ""}`}
      title={title}
      aria-label={title}
      onClick={async (event) => {
        event.stopPropagation();
        if (!(await copyText(panelUrl(param, slug)))) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check size={15} /> : <Link2 size={15} />}
      <span>{copied ? "Copied" : "Link"}</span>
    </button>
  );
}
