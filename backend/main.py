"""FastAPI app for the AI interview MVP backend."""

from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager
from typing import Any
import logging

from fastapi import FastAPI, HTTPException, Path, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from agent.interview_agent import InterviewAgent, build_candidate_brief
from agent.report_builder import ReportBuilder
from agent.scorer import InterviewScorer
from backend.database import get_interview_report, init_db, list_interviews, save_report
from backend.gradium_tts import text_to_speech
from backend.voxtral_stt import speech_to_text as voxtral_stt
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
        description="Exactly 3 generated interview questions for the session, in interview order."
    )
    current_question: dict[str, Any] | None = Field(
        description="The first unanswered question. On start, this is the first question in the interview."
    )
    audio_base64: str | None = Field(
        default=None,
        description="Optional base64-encoded audio for the current question when Gradium is configured.",
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
        description="The next unanswered question in the interview flow, or null when all 3 questions are completed."
    )
    interview_completed: bool = Field(
        description="True when the submitted answer completes the 3-question interview."
    )


class GazeRequest(BaseModel):
    """Client-side gaze tracking summary."""

    events: list[dict[str, Any]] = Field(default_factory=list)
    total_look_away_ms: int = Field(default=0)
    look_away_count: int = Field(default=0)


class TTSRequest(BaseModel):
    """Text-to-speech request payload."""

    text: str = Field(
        description="Plain text to synthesize into speech.",
        examples=["Can you walk me through your background and how it led you to backend engineering?"],
    )
    voice_id: str | None = Field(
        default=None,
        description="Gradium voice ID to use. Falls back to GRADIUM_VOICE_ID env var if omitted.",
    )


class TTSResponse(BaseModel):
    """Text-to-speech response payload."""

    audio_base64: str | None = Field(
        description="Base64-encoded audio bytes when synthesis succeeds; otherwise null."
    )
    available: bool = Field(
        description="Whether TTS generation succeeded for this request."
    )


class STTResponse(BaseModel):
    """Speech-to-text response payload."""

    text: str | None = Field(description="Transcribed text, or null if transcription failed.")
    available: bool = Field(description="Whether transcription succeeded.")


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
    init_db()
    yield


app = FastAPI(
    title="AI Interview MVP Backend",
    version="0.1.0",
    summary="Hackathon-ready backend for profile-driven AI screening interviews.",
    description=(
        "This API turns a HRFlow Profile JSON object into a short AI interview workflow.\n\n"
        "Typical flow:\n"
        "1. `POST /sessions` with a HRFlow profile payload.\n"
        "2. `POST /sessions/{session_id}/start` to generate exactly 3 questions.\n"
        "3. `POST /sessions/{session_id}/answer` once per question.\n"
        "4. `GET /sessions/{session_id}/report` to retrieve the final report.\n\n"
        "External services are optional. If HRFlow, an LLM, or Gradium are not configured, "
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
        "- generates exactly 3 profile-driven questions on first call\n"
        "- reuses the same question set on later calls for the same session\n"
        "- optionally includes base64 TTS audio for the current question when Gradium is configured"
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
        if len(questions) != 3:
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
        "- whether the 3-question interview is now complete"
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


@app.post(
    "/sessions/{session_id}/gaze",
    summary="Store gaze tracking summary",
    tags=["Sessions"],
)
async def save_gaze(
    session_id: str = Path(
        ...,
        description="Session identifier returned by `POST /sessions`.",
    ),
    payload: GazeRequest = ...,
) -> dict[str, str]:
    """Store client-side gaze tracking summary (look-away events) for a session."""
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    session_store.save_gaze(session_id, payload.model_dump())
    return {"status": "ok"}


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

    # Enrich each evaluation with the candidate's transcript and question text
    answer_by_qid = {a["question_id"]: a.get("transcript", "") for a in session.answers if isinstance(a, dict)}
    question_by_qid = {q["id"]: q.get("question", "") for q in session.generated_questions if isinstance(q, dict)}
    for ev in report.get("per_question_evaluations", []):
        qid = ev.get("question_id")
        ev["transcript"] = answer_by_qid.get(qid, "")
        ev["question_text"] = question_by_qid.get(qid, "")

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

    # Attach client-side gaze data if available
    gaze_session = session_store.get_session(session_id)
    if gaze_session and gaze_session.gaze_summary:
        report["gaze_summary"] = gaze_session.gaze_summary

    # Extract CV public URL from raw profile attachments
    profile_data = raw_profile.get("data") if isinstance(raw_profile.get("data"), dict) else raw_profile
    attachments = profile_data.get("attachments") if isinstance(profile_data, dict) else []
    cv_url: str | None = None
    for attachment in (attachments or []):
        if isinstance(attachment, dict):
            url = attachment.get("public_url") or attachment.get("url")
            if url and isinstance(url, str):
                cv_url = url
                break
    report["cv_url"] = cv_url

    report["hrflow_profile_job_grade"] = await hrflow_client.grade_profile_for_job(
        source_key=source_key,
        board_key=board_key,
        profile_key=session.normalized_profile.get("profile_key"),
        job_key=normalized_job_offer.get("job_key"),
        profile_reference=profile_reference,
        job_reference=job_reference,
    )
    logger.info(report)

    candidate_name = report.get("candidate_summary", {}).get("candidate_name", "Unknown")
    overall_score = report.get("overall_score", 0.0)
    recommendation = report.get("recommendation", "no")
    save_report(session_id, candidate_name, overall_score, recommendation, report)

    return report


@app.get(
    "/jobs",
    summary="List available job offers",
    description="Returns a list of job offers from the configured HRflow board.",
    tags=["Jobs"],
)
async def list_jobs(
    board_key: str | None = None,
    limit: int = 12,
    page: int = 1,
) -> dict[str, Any]:
    """Proxy HRflow jobs/searching and return a compact list for the UI."""
    try:
        result = await hrflow_client.list_jobs(board_key=board_key, limit=limit, page=page)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch jobs: {exc}") from exc

    raw_jobs = []
    data = result.get("data")
    if isinstance(data, dict):
        raw_jobs = data.get("jobs", []) or []
    elif isinstance(data, list):
        raw_jobs = data

    jobs = []
    for job in raw_jobs:
        if not isinstance(job, dict):
            continue
        board = job.get("board") if isinstance(job.get("board"), dict) else {}
        location = job.get("location") if isinstance(job.get("location"), dict) else {}
        skills = [
            s.get("name") or s.get("label") or ""
            for s in (job.get("skills") or [])
            if isinstance(s, dict)
        ]
        sections = job.get("sections") or []
        parsed_sections = []
        for section in sections:
            if isinstance(section, dict):
                title = (section.get("title") or section.get("name") or "").strip()
                desc = (section.get("description") or section.get("text") or "").strip()
                if desc:
                    parsed_sections.append({"title": title, "description": desc})

        summary = (job.get("summary") or "").strip()

        def _extract_text(field: Any) -> str:
            if not field:
                return ""
            if isinstance(field, str):
                return field.strip()
            if isinstance(field, dict):
                return (field.get("text") or field.get("description") or "").strip()
            return ""

        jobs.append({
            "key": job.get("key") or job.get("id") or "",
            "board_key": board.get("key") or board_key or hrflow_client.board_key or "",
            "title": job.get("name") or job.get("title") or "Offre sans titre",
            "company": board.get("name") or job.get("company") or "",
            "location": location.get("text") or job.get("location") or "",
            "contract_type": (job.get("info") or {}).get("contract_type") or job.get("contract_type") or "",
            "skills": [s for s in skills if s],
            "summary": summary,
            "sections": parsed_sections,
            "requirements": _extract_text(job.get("requirements")),
            "responsibilities": _extract_text(job.get("responsibilities")),
            "benefits": _extract_text(job.get("benefits")),
            "url": job.get("url") or "",
            "created_at": job.get("created_at") or "",
        })

    return {"jobs": jobs, "total": len(jobs)}


@app.post(
    "/profile/parse-cv",
    response_model=SessionCreateResponse,
    summary="Parse CV and create interview session",
    description=(
        "Parses a CV/resume file via HRFlow Profile Parsing API and creates a ready-to-start interview session.\n\n"
        "Accepts a multipart form with a `file` field (PDF, DOC, DOCX) and optional "
        "`source_key`, `board_key`, `job_key` fields.\n\n"
        "On success, returns the same payload as `POST /sessions`, allowing the client to proceed "
        "directly to `POST /sessions/{session_id}/start`."
    ),
    tags=["Sessions"],
)
async def parse_cv_and_create_session(
    file: UploadFile = File(..., description="CV/resume file (PDF, DOC, DOCX)."),
    source_key: str | None = Form(default=None, description="HRFlow source key. Falls back to HRFLOW_SOURCE_KEY env var."),
    board_key: str | None = Form(default=None, description="HRFlow board key for the target job offer (optional)."),
    job_key: str | None = Form(default=None, description="HRFlow job key for the target job offer (optional)."),
) -> SessionCreateResponse:
    """Parse a CV file via HRFlow, then create and return an interview session."""
    file_bytes = await file.read()
    filename = file.filename or "cv.pdf"

    try:
        parse_result = await hrflow_client.parse_cv_file(file_bytes, filename, source_key)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"CV parsing failed: {exc}") from exc

    # HRFlow response shape: { "data": { "profile": {...} } }
    data = parse_result.get("data") if isinstance(parse_result.get("data"), dict) else {}
    raw_profile = data.get("profile") if isinstance(data.get("profile"), dict) else {}
    if not raw_profile:
        raise HTTPException(status_code=400, detail="CV parsing returned an empty profile. Check your source_key and file format.")

    raw_job_offer: dict | None = None
    resolved_board_key = board_key or hrflow_client.board_key
    if resolved_board_key and job_key:
        try:
            job_result = await hrflow_client._request(
                "GET", "job/indexing", params={"board_key": resolved_board_key, "job_key": job_key}
            )
            job_data = job_result.get("data") if isinstance(job_result.get("data"), dict) else None
            if job_data:
                raw_job_offer = job_data
        except Exception as exc:
            logger.warning("Could not fetch job offer during CV parse: %s", exc)

    validation = hrflow_client.validate_profile(raw_profile)
    if not validation["normalized_profile"].get("profile_text"):
        raise HTTPException(status_code=400, detail="Parsed profile is missing usable interview context.")

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
    "/stt",
    response_model=STTResponse,
    summary="Transcribe audio with Voxtral",
    description=(
        "Transcribes an audio file locally using the Voxtral model via mistral-inference.\n\n"
        "Accepts multipart/form-data with an `audio` file field and optional `lang` parameter (default: 'fr')."
    ),
    tags=["Audio"],
)
async def stt(
    audio: UploadFile = File(..., description="Audio file to transcribe (webm or mp4)."),
    lang: str = Form(default="fr", description="Language code for transcription (e.g. 'fr', 'en')."),
) -> STTResponse:
    """Transcribe audio using Voxtral locally."""
    audio_bytes = await audio.read()
    audio_format = "mp4" if (audio.content_type or "").endswith("mp4") else "webm"
    text = await voxtral_stt(audio_bytes, audio_format, lang)
    if text is None:
        return STTResponse(text=None, available=False)
    return STTResponse(text=text.strip(), available=True)


@app.get(
    "/hr/interviews",
    summary="List all completed interviews",
    description="Returns a summary list of all completed interview sessions, ordered by most recent first.",
    tags=["HR"],
)
async def hr_list_interviews() -> list[dict[str, Any]]:
    """Return summary metadata for all persisted interview reports."""
    return list_interviews()


@app.get(
    "/hr/interviews/{session_id}",
    summary="Get full interview report (HR)",
    description="Returns the full recruiter-facing report for a completed interview session.",
    tags=["HR"],
)
async def hr_get_interview(
    session_id: str = Path(
        ...,
        description="Session identifier of the completed interview.",
        examples=["d7f6c4d1-5f7e-4b9d-a9a1-2ddf5ff5f123"],
    ),
) -> dict[str, Any]:
    """Return the persisted full report JSON for a completed interview."""
    report = get_interview_report(session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Interview not found.")
    return report


@app.post(
    "/tts",
    response_model=TTSResponse,
    summary="Generate text-to-speech audio",
    description=(
        "Converts plain text into spoken audio using Gradium when configured.\n\n"
        "If Gradium credentials are missing or synthesis fails, the endpoint returns a null-safe response "
        "with `audio_base64 = null` and `available = false` instead of crashing."
    ),
    tags=["Audio"],
)
async def tts(payload: TTSRequest) -> TTSResponse:
    """Generate TTS audio when Gradium is configured."""
    audio = await text_to_speech(payload.text, payload.voice_id)
    if not audio:
        return TTSResponse(audio_base64=None, available=False)
    return TTSResponse(audio_base64=base64.b64encode(audio).decode("ascii"), available=True)
