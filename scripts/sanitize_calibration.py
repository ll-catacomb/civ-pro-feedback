#!/usr/bin/env python3
"""Remove exam-system metadata and anonymous IDs from calibration answers."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


HEADER_PATTERNS = (
    r"^Institution Harvard Law School",
    r"^Course(?: / Session)? ",
    r"^Exam Mode TAKEHOME",
    r"^Extegrity Exam4",
    r"^Section All Page",
    r"^Event NA$",
    r"^Exam ID",
    r"^Count\(s\)",
    r"^\s*Section \d+\s+\d+",
    r"^\s*Total\s+\d+",
    r"^\s*_{8,}\s*$",
    r"^\s*\d{6}\s*$",
    r"^\s*\d{6}\s+\d{6}\s*$",
)


def sanitize(text: str, trim_cover: bool) -> str:
    text = text.replace("\f", "\n")
    if trim_cover:
        answer_start = re.search(r"Answer-to-Question", text, flags=re.IGNORECASE)
        if answer_start:
            text = text[answer_start.start() :]

    kept: list[str] = []
    for line in text.splitlines():
        compact = line.strip()
        if any(re.match(pattern, compact, flags=re.IGNORECASE) for pattern in HEADER_PATTERNS):
            continue
        if re.match(r"^\d{6}\s+Institution ", compact):
            continue
        if "Section All Page" in compact:
            continue
        line = re.sub(
            r"Answer-to-Question-_?(\d+)_?",
            r"## Question \1",
            line,
            flags=re.IGNORECASE,
        )
        kept.append(line.rstrip())

    cleaned = "\n".join(kept)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    return cleaned.strip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--trim-cover", action="store_true")
    args = parser.parse_args()
    args.output.write_text(
        sanitize(args.input.read_text(encoding="utf-8"), args.trim_cover),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
