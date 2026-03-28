"""FastAPI app for the AI interview MVP backend."""

from __future__ import annotations

import base64
from contextlib import asynccontextmanager
from typing import Any
import logging

from fastapi import FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from agent.interview_agent import InterviewAgent, build_candidate_brief
from agent.report_builder import ReportBuilder
from agent.scorer import InterviewScorer
from backend.elevenlabs import text_to_speech
from backend.hrflow_client import HRFlowClient
from backend.session_store import SessionStore

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - optional convenience import
    def load_dotenv() -> bool:
        return False


logger = logging.getLogger(__name__)

load_dotenv()

session_store = SessionStore()
hrflow_client = HRFlowClient()
interview_agent = InterviewAgent()
scorer = InterviewScorer()
report_builder = ReportBuilder()


class SessionCreateResponse(BaseModel):
    """Response for session creation."""

    session_id: str = Field(
        description="Server-generated session identifier used in all subsequent interview calls.",
        examples=["d7f6c4d1-5f7e-4b9d-a9a1-2ddf5ff5f123"],
    )
    normalized_profile: dict[str, Any] = Field(
        description="Compact normalized version of the incoming HRFlow profile. This is the cleaned structure used by the backend."
    )
    candidate_brief: dict[str, Any] = Field(
        description="Recruiter-friendly candidate summary derived from the normalized profile and used to generate interview questions."
    )
    normalized_job_offer: dict[str, Any] | None = Field(
        default=None,
        description="Normalized target job payload used to tailor questions and fit evaluation. Null when no job was provided."
    )


class StartInterviewResponse(BaseModel):
    """Response for interview start."""

    generated_questions: list[dict[str, Any]] = Field(
        description="Exactly 5 generated interview questions for the session, in interview order."
    )
    current_question: dict[str, Any] | None = Field(
        description="The first unanswered question. On start, this is the first question in the interview."
    )
    audio_base64: str | None = Field(
        default=None,
        description="Optional base64-encoded audio for the current question when ElevenLabs is configured.",
    )


class AnswerRequest(BaseModel):
    """Answer submission payload."""

    question_id: str = Field(
        description="Identifier of the question being answered. Must match one of the generated question ids for the session.",
        examples=["q1"],
    )
    transcript: str = Field(
        default="",
        description="Text transcript of the candidate's answer. This is the primary input used by the deterministic scorer.",
        examples=["I led the backend rewrite, reduced API latency by 30%, and coordinated rollout with product and infra."],
    )
    audio_base64: str | None = Field(
        default=None,
        description="Optional base64-encoded raw audio payload. Included for future use; current MVP scoring uses the transcript.",
    )


class AnswerResponse(BaseModel):
    """Answer submission response."""

    evaluation: dict[str, Any] = Field(
        description="Per-question evaluation including normalized score, subscores, strengths, concerns, and rationale."
    )
    next_question: dict[str, Any] | None = Field(
        description="The next unanswered question in the interview flow, or null when all 5 questions are completed."
    )
    interview_completed: bool = Field(
        description="True when the submitted answer completes the 5-question interview."
    )


class TTSRequest(BaseModel):
    """Text-to-speech request payload."""

    text: str = Field(
        description="Plain text to synthesize into speech.",
        examples=["Can you walk me through your background and how it led you to backend engineering?"],
    )


class TTSResponse(BaseModel):
    """Text-to-speech response payload."""

    audio_base64: str | None = Field(
        description="Base64-encoded audio bytes when synthesis succeeds; otherwise null."
    )
    available: bool = Field(
        description="Whether TTS generation succeeded for this request."
    )


class ProfilePayload(BaseModel):
    """Accept arbitrary HRFlow profile JSON."""

    model_config = ConfigDict(extra="allow")


class JobOfferPayload(BaseModel):
    """Accept arbitrary HRFlow job JSON."""

    model_config = ConfigDict(extra="allow")


class SessionCreateRequest(BaseModel):
    """Session creation payload with profile and optional job offer."""

    profile: ProfilePayload = Field(
        description="The HRFlow Profile JSON object for the candidate being interviewed."
    )
    job_offer: JobOfferPayload | None = Field(
        default=None,
        description="Optional HRFlow-style job offer JSON. When provided, questions and scoring are tailored to both the profile and the job.",
    )


class HealthResponse(BaseModel):
    """Healthcheck response payload."""

    status: str = Field(description="Service health status.", examples=["ok"])


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(
    title="AI Interview MVP Backend",
    version="0.1.0",
    summary="Hackathon-ready backend for profile-driven AI screening interviews.",
    description=(
        "This API turns a HRFlow Profile JSON object into a short AI interview workflow.\n\n"
        "Typical flow:\n"
        "1. `POST /sessions` with a HRFlow profile payload.\n"
        "2. `POST /sessions/{session_id}/start` to generate exactly 5 questions.\n"
        "3. `POST /sessions/{session_id}/answer` once per question.\n"
        "4. `GET /sessions/{session_id}/report` to retrieve the final report.\n\n"
        "External services are optional. If HRFlow, an LLM, or ElevenLabs are not configured, "
        "the API falls back to deterministic local behavior when possible."
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Simple liveness endpoint to confirm that the FastAPI service is up and responding.",
    tags=["System"],
)
async def health() -> HealthResponse:
    """Return service health status."""
    return HealthResponse(status="ok")


@app.post(
    "/sessions",
    response_model=SessionCreateResponse,
    summary="Create interview session",
    description=(
        "Creates a new interview session from a HRFlow Profile JSON object.\n\n"
        "What this endpoint does:\n"
        "- validates the incoming profile shape\n"
        "- normalizes profile data into a stable backend structure\n"
        "- normalizes the optional target job offer\n"
        "- builds a compact candidate brief used for job-aware question generation\n"
        "- returns a `session_id` for the next steps\n\n"
        "This endpoint does not generate interview questions yet. Call `/sessions/{session_id}/start` next."
    ),
    tags=["Sessions"],
)
async def create_session(payload: SessionCreateRequest) -> SessionCreateResponse:
    """Create an interview session from a HRFlow Profile payload and optional job offer."""
    raw_profile = payload.profile.model_dump()
    raw_job_offer = payload.job_offer.model_dump() if payload.job_offer is not None else None
    validation = hrflow_client.validate_profile(raw_profile)
    if not validation["normalized_profile"].get("profile_text"):
        raise HTTPException(status_code=400, detail="Profile payload is missing usable interview context.")

    normalized_profile = validation["normalized_profile"]
    normalized_job_offer = hrflow_client.normalize_job(raw_job_offer) if raw_job_offer else None
    candidate_brief = build_candidate_brief(normalized_profile, normalized_job_offer)
    session = session_store.create_session(
        raw_profile,
        raw_job_offer,
        normalized_profile,
        normalized_job_offer,
        candidate_brief,
    )
    return SessionCreateResponse(
        session_id=session.session_id,
        normalized_profile=session.normalized_profile,
        candidate_brief=session.candidate_brief,
        normalized_job_offer=session.normalized_job_offer,
    )


@app.post(
    "/sessions/{session_id}/start",
    response_model=StartInterviewResponse,
    summary="Start interview and generate questions",
    description=(
        "Generates the interview questions for an existing session and returns the first current question.\n\n"
        "Behavior:\n"
        "- generates exactly 5 profile-driven questions on first call\n"
        "- reuses the same question set on later calls for the same session\n"
        "- optionally includes base64 TTS audio for the current question when ElevenLabs is configured"
    ),
    tags=["Sessions"],
)
async def start_session(
    session_id: str = Path(
        ...,
        description="Session identifier returned by `POST /sessions`.",
        examples=["d7f6c4d1-5f7e-4b9d-a9a1-2ddf5ff5f123"],
    )
) -> StartInterviewResponse:
    """Generate exactly five questions and return the first question."""
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    questions = session.generated_questions
    if not questions:
        questions = await interview_agent.generate_questions(session.candidate_brief)
        if len(questions) != 5:
            raise HTTPException(status_code=500, detail="Interview question generation failed.")
        updated = session_store.update_questions(session_id, questions, status="in_progress")
        if not updated:
            raise HTTPException(status_code=404, detail="Session not found.")
        session = updated
    else:
        session = session_store.update_questions(session_id, questions, status="in_progress") or session

    current_question = session.generated_questions[0] if session.generated_questions else None
    audio_base64 = None
    if current_question:
        audio_bytes = await text_to_speech(current_question["question"])
        if audio_bytes:
            audio_base64 = base64.b64encode(audio_bytes).decode("ascii")
    return StartInterviewResponse(
        generated_questions=session.generated_questions,
        current_question=current_question,
        audio_base64=audio_base64,
    )


@app.post(
    "/sessions/{session_id}/answer",
    response_model=AnswerResponse,
    summary="Submit answer and advance interview",
    description=(
        "Scores one answer for one question in the current interview session.\n\n"
        "What this endpoint expects:\n"
        "- `session_id`: the active interview session\n"
        "- `question_id`: the question being answered\n"
        "- `transcript`: the candidate's answer text\n\n"
        "What it returns:\n"
        "- the evaluation for that answer\n"
        "- the next unanswered question, if any\n"
        "- whether the 5-question interview is now complete"
    ),
    tags=["Sessions"],
)
async def submit_answer(
    session_id: str = Path(
        ...,
        description="Session identifier returned by `POST /sessions`.",
        examples=["d7f6c4d1-5f7e-4b9d-a9a1-2ddf5ff5f123"],
    ),
    payload: AnswerRequest = ...,
) -> AnswerResponse:
    """Accept a transcript answer, score it, and advance the interview."""
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if not session.generated_questions:
        raise HTTPException(status_code=400, detail="Interview has not started.")

    question = next((item for item in session.generated_questions if item["id"] == payload.question_id), None)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found.")
    if any(answer.get("question_id") == payload.question_id for answer in session.answers):
        raise HTTPException(status_code=409, detail="Question already answered.")

    evaluation = await scorer.evaluate_answer(session.candidate_brief, question, payload.transcript)
    answer_record = payload.model_dump()
    answered_count = len(session.answers) + 1
    completed = answered_count >= len(session.generated_questions)
    status = "completed" if completed else "in_progress"
    updated = session_store.append_answer(session_id, answer_record, evaluation, status=status)
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found.")

    next_question = None
    if not completed:
        answered_ids = {answer.get("question_id") for answer in updated.answers}
        next_question = next((item for item in updated.generated_questions if item["id"] not in answered_ids), None)

    return AnswerResponse(
        evaluation=evaluation,
        next_question=next_question,
        interview_completed=completed,
    )


@app.get(
    "/sessions/{session_id}/report",
    summary="Get final interview report",
    description=(
        "Builds and returns the final recruiter-facing JSON report for a session.\n\n"
        "The report includes candidate summary, per-question evaluations, overall scoring, "
        "strengths, concerns, recommendation, and final summary."
    ),
    tags=["Sessions"],
)
async def get_report(
    session_id: str = Path(
        ...,
        description="Session identifier returned by `POST /sessions`.",
        examples=["d7f6c4d1-5f7e-4b9d-a9a1-2ddf5ff5f123"],
    )
) -> dict[str, Any]:
    """Return the final interview report JSON."""
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    report = report_builder.build_report(session.session_id, session.candidate_brief, session.evaluations)

    raw_profile = session.raw_profile if isinstance(session.raw_profile, dict) else {}
    normalized_job_offer = session.normalized_job_offer or {}
    raw_job_offer = session.raw_job_offer or {}
    raw_job_data = raw_job_offer.get("data") if isinstance(raw_job_offer.get("data"), dict) else raw_job_offer
    raw_job_data = raw_job_data if isinstance(raw_job_data, dict) else {}
    raw_job_board = raw_job_data.get("board") if isinstance(raw_job_data.get("board"), dict) else {}
    raw_profile_source = raw_profile.get("source") if isinstance(raw_profile.get("source"), dict) else {}

    source_key = (
        raw_profile.get("source_key")
        or raw_profile_source.get("key")
        or hrflow_client.source_key
    )
    board_key = (
        raw_job_offer.get("board_key")
        if isinstance(raw_job_offer.get("board_key"), str)
        else None
    ) or normalized_job_offer.get("board_key") or raw_job_data.get("board_key") or raw_job_board.get("key") or hrflow_client.board_key

    profile_reference = raw_profile.get("reference") if isinstance(raw_profile.get("reference"), str) and raw_profile.get("reference") else None
    raw_job_reference = normalized_job_offer.get("job_reference") or raw_job_data.get("reference")
    job_reference = (
        raw_job_reference
        if isinstance(raw_job_reference, str) and raw_job_reference and raw_job_reference != "00000"
        else None
    )

    report["hrflow_profile_job_grade"] = await hrflow_client.grade_profile_for_job(
        source_key=source_key,
        board_key=board_key,
        profile_key=session.normalized_profile.get("profile_key"),
        job_key=normalized_job_offer.get("job_key"),
        profile_reference=profile_reference,
        job_reference=job_reference,
    )
    logger.info(report)
    return report


@app.post(
    "/tts",
    response_model=TTSResponse,
    summary="Generate text-to-speech audio",
    description=(
        "Converts plain text into spoken audio using ElevenLabs when configured.\n\n"
        "If ElevenLabs credentials are missing or synthesis fails, the endpoint returns a null-safe response "
        "with `audio_base64 = null` and `available = false` instead of crashing."
    ),
    tags=["Audio"],
)
async def tts(payload: TTSRequest) -> TTSResponse:
    """Generate TTS audio when ElevenLabs is configured."""
    audio = await text_to_speech(payload.text)
    if not audio:
        return TTSResponse(audio_base64=None, available=False)
    return TTSResponse(audio_base64=base64.b64encode(audio).decode("ascii"), available=True)
