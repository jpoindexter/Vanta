#!/usr/bin/env python3
"""Download transcript text files from one YouTube channel, without video/audio.

Default target:
  https://www.youtube.com/@TonbisAIGarage/videos

Requires:
  yt-dlp

Example:
  scripts/download-youtube-transcripts.py
  scripts/download-youtube-transcripts.py --max-videos 5
  scripts/download-youtube-transcripts.py --langs "en.*,en" --cookies-from-browser chrome
"""

from __future__ import annotations

import argparse
import html
import re
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_CHANNEL = "https://www.youtube.com/@TonbisAIGarage/videos"
DEFAULT_OUT = "reference/tonbis-ai-garage-transcripts"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def resolve_output(path: str) -> Path:
    out = Path(path).expanduser()
    return out if out.is_absolute() else repo_root() / out


def build_yt_dlp_command(args: argparse.Namespace, raw_dir: Path) -> list[str]:
    exe = shutil.which("yt-dlp")
    if exe is None:
        raise SystemExit("yt-dlp not found. Install it with: brew install yt-dlp")

    cmd = [
        exe,
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        args.langs,
        "--sub-format",
        "vtt",
        "--ignore-errors",
        "--no-progress",
        "--restrict-filenames",
        "-o",
        str(raw_dir / "%(upload_date>%Y-%m-%d)s__%(title).180B__%(id)s.%(ext)s"),
    ]
    if not args.force:
        cmd.append("--no-overwrites")
    if args.max_videos:
        cmd += ["--playlist-end", str(args.max_videos)]
    if args.cookies:
        cmd += ["--cookies", args.cookies]
    if args.cookies_from_browser:
        cmd += ["--cookies-from-browser", args.cookies_from_browser]
    cmd.append(args.channel)
    return cmd


def clean_vtt_text(text: str) -> list[str]:
    lines: list[str] = []
    previous = ""
    in_note = False

    for raw in text.replace("\ufeff", "").splitlines():
        line = raw.strip()
        if not line:
            in_note = False
            continue
        if line == "WEBVTT" or line.startswith(("Kind:", "Language:", "STYLE", "REGION")):
            continue
        if line.startswith("NOTE"):
            in_note = True
            continue
        if in_note or "-->" in line or line.isdigit():
            continue

        line = re.sub(r"<[^>]+>", "", line)
        line = html.unescape(line)
        line = re.sub(r"\s+", " ", line).strip()
        normalized = line.lower()
        if line and normalized != previous:
            lines.append(line)
            previous = normalized
    return lines


def video_url_from_name(path: Path) -> str | None:
    match = re.search(r"__([A-Za-z0-9_-]{11})(?:\.[^.]+)?$", path.stem)
    if not match:
        return None
    return f"https://www.youtube.com/watch?v={match.group(1)}"


def transcript_name(vtt_path: Path) -> str:
    stem = re.sub(r"\.[a-z]{2,3}(?:-[A-Za-z0-9]+)?$", "", vtt_path.stem)
    return f"{stem}.txt"


def convert_vtt_files(raw_dir: Path, out_dir: Path, keep_vtt: bool) -> int:
    count = 0
    for vtt in sorted(raw_dir.glob("*.vtt")):
        lines = clean_vtt_text(vtt.read_text(encoding="utf-8", errors="replace"))
        if not lines:
            continue
        target = out_dir / transcript_name(vtt)
        source = video_url_from_name(vtt)
        header = [f"Transcript file: {vtt.name}"]
        if source:
            header.append(f"Source: {source}")
        target.write_text("\n".join(header + ["", *lines, ""]), encoding="utf-8")
        count += 1
        if not keep_vtt:
            vtt.unlink()

    if not keep_vtt:
        try:
            raw_dir.rmdir()
        except OSError:
            pass
    return count


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download YouTube channel transcripts only.")
    parser.add_argument("--channel", default=DEFAULT_CHANNEL, help=f"YouTube channel/videos URL. Default: {DEFAULT_CHANNEL}")
    parser.add_argument("--out", default=DEFAULT_OUT, help=f"Output folder. Default: {DEFAULT_OUT}")
    parser.add_argument("--langs", default="en", help='Subtitle languages for yt-dlp, e.g. "en", "en.*,en", or "all".')
    parser.add_argument("--max-videos", type=int, help="Limit how many channel videos to process.")
    parser.add_argument("--cookies", help="Path to a Netscape cookies.txt file for YouTube.")
    parser.add_argument("--cookies-from-browser", help='Browser name for yt-dlp cookies, e.g. "chrome" or "safari".')
    parser.add_argument("--force", action="store_true", help="Overwrite existing subtitle downloads.")
    parser.add_argument("--keep-vtt", action="store_true", help="Keep raw .vtt subtitle files in an internal _raw_vtt folder.")
    parser.add_argument("--dry-run", action="store_true", help="Print the yt-dlp command without downloading.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    out_dir = resolve_output(args.out)
    raw_dir = out_dir / "_raw_vtt"
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_dir.mkdir(parents=True, exist_ok=True)

    cmd = build_yt_dlp_command(args, raw_dir)
    if args.dry_run:
        print(" ".join(cmd))
        return 0

    result = subprocess.run(cmd, check=False)
    converted = convert_vtt_files(raw_dir, out_dir, args.keep_vtt)
    print(f"Converted {converted} transcript(s) into {out_dir}")
    return 0 if result.returncode == 0 or converted else result.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
