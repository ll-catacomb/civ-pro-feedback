#!/usr/bin/env python3
"""Make legible contact sheets for visual QA of rendered pages."""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--columns", type=int, default=3)
    parser.add_argument("--thumb-width", type=int, default=480)
    args = parser.parse_args()

    pages = sorted(args.input_dir.glob("page-*.png"), key=lambda p: int(p.stem.split("-")[-1]))
    if not pages:
        raise SystemExit(f"No page PNGs found in {args.input_dir}")

    thumbs: list[Image.Image] = []
    for page in pages:
        image = Image.open(page).convert("RGB")
        height = round(image.height * args.thumb_width / image.width)
        thumbs.append(image.resize((args.thumb_width, height), Image.Resampling.LANCZOS))

    label_height = 34
    cell_height = max(image.height for image in thumbs) + label_height
    rows = math.ceil(len(thumbs) / args.columns)
    sheet = Image.new("RGB", (args.columns * args.thumb_width, rows * cell_height), "#ece8df")
    draw = ImageDraw.Draw(sheet)

    for index, image in enumerate(thumbs):
        x = (index % args.columns) * args.thumb_width
        y = (index // args.columns) * cell_height
        sheet.paste(image, (x, y + label_height))
        draw.text((x + 12, y + 9), f"Page {index + 1}", fill="#24211d")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output, quality=92)


if __name__ == "__main__":
    main()
