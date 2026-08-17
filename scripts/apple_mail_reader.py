#!/usr/bin/env python3
"""Read Apple Mail's Envelope Index without mutating the live database."""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path


class AppleMailAccessError(RuntimeError):
    """Raised when macOS or SQLite blocks access to the Mail index."""


@dataclass(frozen=True)
class MailRow:
    message_id: int
    received_at: str
    sender_name: str
    sender_address: str
    subject: str
    summary: str


@dataclass(frozen=True)
class SearchResult:
    total: int
    rows: tuple[MailRow, ...]


_CANDIDATE = re.compile(
    r"(application|applied|candidate|interview|position|role|job|hiring|"
    r"recruit|talent|opportunity|workable|greenhouse|ashby|lever|smartrecruiters|"
    r"personio|teamtailor|welcome to the jungle|indeed|linkedin)",
    re.IGNORECASE,
)
_SIGNAL = re.compile(
    r"(thank.{0,20}(applying|application)|application (received|submitted|update|status)|"
    r"received your application|your application|not moving forward|unfortunately|"
    r"other candidates|interview|next step|schedule.{0,20}(call|chat|interview)|"
    r"assessment|take.home|offer)",
    re.IGNORECASE,
)
_NOISE = re.compile(
    r"(job alert|newsletter|latest remote|new jobs|recommendations|browse.{0,30}jobs|"
    r"career advice|hiring across|jobs open across)",
    re.IGNORECASE,
)


def discover_envelope_index(mail_root: Path | None = None) -> Path:
    root = mail_root or Path.home() / "Library" / "Mail"
    try:
        versions = [
            (int(match.group(1)), child)
            for child in root.iterdir()
            if (match := re.fullmatch(r"V(\d+)", child.name)) and child.is_dir()
        ]
    except OSError as error:
        raise AppleMailAccessError(_access_message()) from error

    for _, version in sorted(versions, reverse=True):
        candidate = version / "MailData" / "Envelope Index"
        if candidate.is_file():
            return candidate
    raise AppleMailAccessError(
        "Apple Mail's Envelope Index was not found. Open Mail once, then try again."
    )


def open_envelope_index(database: Path) -> sqlite3.Connection:
    try:
        connection = sqlite3.connect(
            f"{database.resolve().as_uri()}?mode=ro",
            uri=True,
            timeout=5,
        )
        connection.execute("pragma query_only = on")
        return connection
    except sqlite3.Error as error:
        raise AppleMailAccessError(_access_message()) from error


def search_application_candidates(
    connection: sqlite3.Connection,
    *,
    since: str,
) -> SearchResult:
    rows = _load_rows(connection, since)
    matches = tuple(
        row
        for row in rows
        if _CANDIDATE.search(_searchable_text(row))
        and not _NOISE.search(f"{row.subject} {row.summary}")
    )
    return SearchResult(total=len(rows), rows=matches)


def search_application_signals(
    connection: sqlite3.Connection,
    *,
    since: str,
) -> SearchResult:
    rows = _load_rows(connection, since)
    matches = tuple(
        row
        for row in rows
        if _SIGNAL.search(_searchable_text(row))
        and not _NOISE.search(f"{row.subject} {row.summary}")
    )
    return SearchResult(total=len(rows), rows=matches)


def format_report(result: SearchResult, *, include_details: bool) -> str:
    lines = [f"ALL_SINCE={result.total}", f"MATCHES={len(result.rows)}"]
    if include_details:
        for row in sorted(result.rows, key=lambda item: item.received_at, reverse=True):
            lines.append("\t".join(_clean(value) for value in row.__dict__.values()))
    return "\n".join(lines)


def run_cli(mode: str) -> int:
    parser = argparse.ArgumentParser(
        description="Audit Apple Mail job-application signals without modifying Mail data."
    )
    parser.add_argument("--database", type=Path, help="Envelope Index path override")
    parser.add_argument("--mail-root", type=Path, help="Apple Mail root override")
    parser.add_argument("--since", type=_iso_date, default="2024-01-01")
    parser.add_argument(
        "--details",
        action="store_true",
        help="print sender, subject, and summary data to this terminal",
    )
    args = parser.parse_args()

    try:
        database = args.database or discover_envelope_index(args.mail_root)
        connection = open_envelope_index(database)
        try:
            if mode == "candidates":
                result = search_application_candidates(connection, since=args.since)
            elif mode == "signals":
                result = search_application_signals(connection, since=args.since)
            else:
                raise ValueError(f"Unsupported Apple Mail audit mode: {mode}")
        finally:
            connection.close()
    except AppleMailAccessError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except sqlite3.Error as error:
        print(
            "error: Apple Mail's index could not be queried "
            f"({type(error).__name__}). Close Mail and retry; if the error persists, "
            "the Mail database schema may have changed. No message content was printed.",
            file=sys.stderr,
        )
        return 3

    print(format_report(result, include_details=args.details))
    return 0


def _load_rows(connection: sqlite3.Connection, since: str) -> tuple[MailRow, ...]:
    query = """
        select m.rowid, datetime(m.date_received, 'unixepoch', 'localtime'),
               coalesce(a.comment, ''), coalesce(a.address, ''),
               coalesce(m.subject_prefix, '') || s.subject,
               coalesce(z.summary, '')
        from messages m
        join subjects s on s.rowid = m.subject
        left join addresses a on a.rowid = m.sender
        left join summaries z on z.rowid = m.summary
        where m.deleted = 0
          and m.date_received >= cast(strftime('%s', ?) as integer)
    """
    return tuple(MailRow(*row) for row in connection.execute(query, (since,)))


def _searchable_text(row: MailRow) -> str:
    return f"{row.subject} {row.summary}"


def _clean(value: object) -> str:
    return str(value).replace("\t", " ").replace("\n", " ")[:220]


def _iso_date(value: str) -> str:
    try:
        dt.date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected YYYY-MM-DD") from error
    return value


def _access_message() -> str:
    return (
        "Apple Mail data is protected by macOS. Grant Full Disk Access to the app "
        "launching this command (Terminal, iTerm, Codex, or Vanta), quit and reopen "
        "that app, then retry. No Mail data was read."
    )
