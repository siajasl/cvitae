#!/usr/bin/env python3
"""Stamp document metadata onto a generated CV PDF and attach cv.json.

Invoked by generate-cv-pdfs.mjs after Chrome renders each PDF. Requires
pikepdf; the generator prefers .venv/bin/python at the repo root
(python3 -m venv .venv && .venv/bin/pip install pikepdf).
"""

import argparse

from pikepdf import AttachedFileSpec, Pdf


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf")
    parser.add_argument("--title", default="")
    parser.add_argument("--author", default="")
    parser.add_argument("--subject", default="")
    parser.add_argument("--keywords", default="")
    parser.add_argument("--lang", default="")
    parser.add_argument("--attach", default="")
    args = parser.parse_args()

    with Pdf.open(args.pdf, allow_overwriting_input=True) as pdf:
        with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
            meta["dc:title"] = args.title
            meta["dc:creator"] = [args.author]
            meta["dc:description"] = args.subject
            meta["pdf:Keywords"] = args.keywords
        info = pdf.docinfo
        info["/Title"] = args.title
        info["/Author"] = args.author
        info["/Subject"] = args.subject
        info["/Keywords"] = args.keywords
        if args.lang:
            pdf.Root.Lang = args.lang
        if args.attach:
            spec = AttachedFileSpec.from_filepath(pdf, args.attach)
            pdf.attachments["cv.json"] = spec
        pdf.save()


if __name__ == "__main__":
    main()
