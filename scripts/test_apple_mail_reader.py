import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.apple_mail_reader import (
    AppleMailAccessError,
    discover_envelope_index,
    format_report,
    search_application_candidates,
    search_application_signals,
    open_envelope_index,
)


class AppleMailDatabaseTests(unittest.TestCase):
    def test_discovers_highest_numeric_mail_version(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            older = root / "V9" / "MailData" / "Envelope Index"
            current = root / "V10" / "MailData" / "Envelope Index"
            older.parent.mkdir(parents=True)
            current.parent.mkdir(parents=True)
            older.touch()
            current.touch()

            self.assertEqual(discover_envelope_index(root), current)

    def test_opens_database_read_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "Envelope Index"
            writable = sqlite3.connect(database)
            writable.execute("create table marker(value text)")
            writable.execute("insert into marker values ('ok')")
            writable.commit()
            writable.close()

            readonly = open_envelope_index(database)
            self.assertEqual(readonly.execute("select value from marker").fetchone(), ("ok",))
            with self.assertRaisesRegex(sqlite3.OperationalError, "readonly"):
                readonly.execute("insert into marker values ('no')")
            readonly.close()

    def test_permission_failure_explains_full_disk_access(self) -> None:
        missing = Path("/private/vanta-mail-test-does-not-exist/Envelope Index")

        with self.assertRaises(AppleMailAccessError) as raised:
            open_envelope_index(missing)

        message = str(raised.exception)
        self.assertIn("Full Disk Access", message)
        self.assertIn("Terminal, iTerm, Codex, or Vanta", message)
        self.assertNotIn(str(Path.home()), message)


class AppleMailSearchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.database = Path(self.temporary_directory.name) / "Envelope Index"
        connection = sqlite3.connect(self.database)
        connection.executescript(
            """
            create table subjects(rowid integer primary key, subject text);
            create table addresses(rowid integer primary key, comment text, address text);
            create table summaries(rowid integer primary key, summary text);
            create table messages(
                rowid integer primary key,
                date_received integer,
                sender integer,
                subject integer,
                summary integer,
                deleted integer,
                subject_prefix text
            );
            insert into addresses values (1, 'Recruiting', 'recruiter@example.test');
            insert into subjects values (1, 'Thank you for applying');
            insert into subjects values (2, 'Your weekly job alert');
            insert into subjects values (3, 'Dinner plans');
            insert into summaries values (1, 'We received your application.');
            insert into summaries values (2, 'Browse the latest jobs.');
            insert into summaries values (3, 'See you Friday.');
            insert into messages values (1, 1720000000, 1, 1, 1, 0, '');
            insert into messages values (2, 1720000001, 1, 2, 2, 0, '');
            insert into messages values (3, 1720000002, 1, 3, 3, 0, '');
            """
        )
        connection.commit()
        connection.close()
        self.connection = open_envelope_index(self.database)

    def tearDown(self) -> None:
        self.connection.close()
        self.temporary_directory.cleanup()

    def test_candidate_search_excludes_newsletters(self) -> None:
        result = search_application_candidates(self.connection, since="2024-01-01")

        self.assertEqual(result.total, 3)
        self.assertEqual([row.message_id for row in result.rows], [1])

    def test_signal_search_finds_application_receipt(self) -> None:
        result = search_application_signals(self.connection, since="2024-01-01")

        self.assertEqual([row.message_id for row in result.rows], [1])

    def test_default_report_does_not_disclose_message_content(self) -> None:
        result = search_application_candidates(self.connection, since="2024-01-01")

        report = format_report(result, include_details=False)

        self.assertIn("MATCHES=1", report)
        self.assertNotIn("recruiter@example.test", report)
        self.assertNotIn("Thank you for applying", report)
        self.assertNotIn("We received your application", report)

    def test_commands_read_fixture_without_disclosing_details_by_default(self) -> None:
        scripts = (
            "audit-apple-mail-job-apps.py",
            "find-apple-mail-application-signals.py",
        )
        for script in scripts:
            with self.subTest(script=script):
                completed = subprocess.run(
                    [
                        sys.executable,
                        str(Path(__file__).with_name(script)),
                        "--database",
                        str(self.database),
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                )

                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertIn("MATCHES=1", completed.stdout)
                self.assertNotIn("recruiter@example.test", completed.stdout)
                self.assertNotIn("Thank you for applying", completed.stdout)

    def test_command_reports_permission_guidance_without_traceback(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                str(Path(__file__).with_name("audit-apple-mail-job-apps.py")),
                "--database",
                "/private/vanta-mail-test-does-not-exist/Envelope Index",
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(completed.returncode, 2)
        self.assertEqual(completed.stdout, "")
        self.assertIn("Full Disk Access", completed.stderr)
        self.assertNotIn("Traceback", completed.stderr)

    def test_command_reports_query_failure_without_guessing_the_cause(self) -> None:
        empty_database = Path(self.temporary_directory.name) / "Empty Index"
        sqlite3.connect(empty_database).close()

        completed = subprocess.run(
            [
                sys.executable,
                str(Path(__file__).with_name("audit-apple-mail-job-apps.py")),
                "--database",
                str(empty_database),
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(completed.returncode, 3)
        self.assertIn("could not be queried", completed.stderr)
        self.assertIn("Close Mail and retry", completed.stderr)
        self.assertNotIn("Traceback", completed.stderr)


if __name__ == "__main__":
    unittest.main()
