"""SQLite persistence for completed interview reports."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Generator

DB_PATH = Path(__file__).parent / "interviews.db"


@contextmanager
def get_conn() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Create the interviews table if it does not exist."""
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS interviews (
                session_id     TEXT PRIMARY KEY,
                candidate_name TEXT NOT NULL,
                completed_at   TEXT NOT NULL,
                overall_score  REAL NOT NULL,
                recommendation TEXT NOT NULL,
                report_json    TEXT NOT NULL
            )
        """)


def save_report(
    session_id: str,
    candidate_name: str,
    overall_score: float,
    recommendation: str,
    report: dict[str, Any],
) -> None:
    """Persist a completed interview report (upsert by session_id)."""
    completed_at = datetime.now(UTC).isoformat()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO interviews
                (session_id, candidate_name, completed_at, overall_score, recommendation, report_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (session_id, candidate_name, completed_at, overall_score, recommendation, json.dumps(report)),
        )


def list_interviews() -> list[dict[str, Any]]:
    """Return all interviews ordered by most recent first (without full report JSON)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT session_id, candidate_name, completed_at, overall_score, recommendation "
            "FROM interviews ORDER BY completed_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def get_interview_report(session_id: str) -> dict[str, Any] | None:
    """Return the full report JSON for a given session, or None if not found."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT report_json FROM interviews WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    if not row:
        return None
    return json.loads(row["report_json"])
