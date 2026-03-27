"""In-memory session store for interview sessions."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import Lock
from typing import Any
from uuid import uuid4


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(UTC)


@dataclass
class SessionRecord:
    """Stored interview session state."""

    session_id: str
    raw_profile: dict[str, Any]
    raw_job_offer: dict[str, Any] | None
    normalized_profile: dict[str, Any]
    normalized_job_offer: dict[str, Any] | None
    candidate_brief: dict[str, Any]
    generated_questions: list[dict[str, Any]] = field(default_factory=list)
    answers: list[dict[str, Any]] = field(default_factory=list)
    evaluations: list[dict[str, Any]] = field(default_factory=list)
    status: str = "created"
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)
    started_at: datetime | None = None
    completed_at: datetime | None = None

    def touch(self) -> None:
        """Update the record modification timestamp."""
        self.updated_at = utc_now()


class SessionStore:
    """Thread-safe in-memory store with clean CRUD-style helpers."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionRecord] = {}
        self._lock = Lock()

    def create_session(
        self,
        raw_profile: dict[str, Any],
        raw_job_offer: dict[str, Any] | None,
        normalized_profile: dict[str, Any],
        normalized_job_offer: dict[str, Any] | None,
        candidate_brief: dict[str, Any],
    ) -> SessionRecord:
        """Create and persist a new interview session."""
        record = SessionRecord(
            session_id=str(uuid4()),
            raw_profile=deepcopy(raw_profile),
            raw_job_offer=deepcopy(raw_job_offer),
            normalized_profile=deepcopy(normalized_profile),
            normalized_job_offer=deepcopy(normalized_job_offer),
            candidate_brief=deepcopy(candidate_brief),
        )
        with self._lock:
            self._sessions[record.session_id] = record
        return deepcopy(record)

    def get_session(self, session_id: str) -> SessionRecord | None:
        """Retrieve a session by id."""
        with self._lock:
            record = self._sessions.get(session_id)
            return deepcopy(record) if record else None

    def save_session(self, session: SessionRecord) -> SessionRecord:
        """Persist a full session record replacement."""
        session.touch()
        with self._lock:
            self._sessions[session.session_id] = deepcopy(session)
            return deepcopy(session)

    def update_questions(self, session_id: str, generated_questions: list[dict[str, Any]], status: str) -> SessionRecord | None:
        """Store generated questions and update session status."""
        with self._lock:
            record = self._sessions.get(session_id)
            if not record:
                return None
            record.generated_questions = deepcopy(generated_questions)
            record.status = status
            if status == "in_progress" and record.started_at is None:
                record.started_at = utc_now()
            record.touch()
            return deepcopy(record)

    def append_answer(self, session_id: str, answer: dict[str, Any], evaluation: dict[str, Any], status: str) -> SessionRecord | None:
        """Append an answer/evaluation pair and update completion status when needed."""
        with self._lock:
            record = self._sessions.get(session_id)
            if not record:
                return None
            record.answers.append(deepcopy(answer))
            record.evaluations.append(deepcopy(evaluation))
            record.status = status
            if status == "completed":
                record.completed_at = utc_now()
            record.touch()
            return deepcopy(record)

    def delete_session(self, session_id: str) -> bool:
        """Delete a session if it exists."""
        with self._lock:
            return self._sessions.pop(session_id, None) is not None
