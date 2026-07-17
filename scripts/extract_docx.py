#!/usr/bin/env python3
"""Extract visible text from a DOCX while preserving paragraph and table order."""

from __future__ import annotations

import argparse
from pathlib import Path

from docx import Document
from docx.document import Document as DocumentType
from docx.table import Table
from docx.text.paragraph import Paragraph


def iter_blocks(parent: DocumentType):
    for child in parent.element.body.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, parent)
        elif child.tag.endswith("}tbl"):
            yield Table(child, parent)


def extract(path: Path) -> str:
    document = Document(path)
    blocks: list[str] = []
    for block in iter_blocks(document):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            if text:
                blocks.append(text)
        else:
            for row in block.rows:
                cells = [" ".join(cell.text.split()) for cell in row.cells]
                if any(cells):
                    blocks.append(" | ".join(cells))
    return "\n\n".join(blocks).strip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.write_text(extract(args.input), encoding="utf-8")


if __name__ == "__main__":
    main()
