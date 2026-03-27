"""Prompt helpers for optional LLM-backed interview generation and synthesis."""

from __future__ import annotations

import json
from typing import Any


QUESTION_GENERATION_SYSTEM_PROMPT = """
You are an expert recruiter creating a 15-minute screening interview from a candidate profile and a target job.
Return only valid JSON.
Generate exactly 5 short questions, no longer then 2-3 lines.
Every question must be grounded in both the profile and the job.
Do not ask generic filler questions.
Prioritize evaluating fit, evidence, readiness, and likely gaps for the role.
""".strip()


def build_candidate_brief_prompt(normalized_profile: dict[str, Any], normalized_job_offer: dict[str, Any] | None) -> str:
    """Build a prompt asking an LLM to summarize a profile into a compact brief."""
    return (
        "Build a recruiter-ready candidate brief from this normalized profile and target job. "
        "Return valid JSON with keys: profile_key, candidate_name, current_title, years_of_experience, "
        "seniority, top_skills, strongest_experiences, certifications, profile_text, target_job, fit_focus_skills. "
        "The target_job must summarize the role title, company, target skills, key requirements, and job text. "
        "The fit_focus_skills list should prioritize the overlap between the profile and the target job.\n"
        f"Profile: {json.dumps(normalized_profile, ensure_ascii=True)}\n"
        f"Job: {json.dumps(normalized_job_offer or {}, ensure_ascii=True)}"
    )


def build_question_generation_prompt(candidate_brief: dict[str, Any]) -> str:
    """Build a strict JSON prompt for five grounded interview questions."""
    return (
        "Using the candidate brief below, generate exactly 5 concise recruiter-friendly interview questions. "
        "Keep each question concise and interviewer-ready, ideally one sentence and never more than 2 to 3 lines. "
        "Return valid JSON in the form {\"questions\": [...]} where each question contains: "
        "id, category, question, why_it_matters, expected_signals, scoring_criteria, priority. "
        "Questions must cover intro/synthesis, experience validation, skill validation, situational or technical, "
        "and projection/motivation. Avoid generic phrasing. Each question must test candidate fit for the target job, not just the profile alone. "
        "When the brief contains target skills or role requirements, explicitly anchor questions to them.\n"
        f"{json.dumps(candidate_brief, ensure_ascii=True)}"
    )


def build_answer_evaluation_prompt(candidate_brief: dict[str, Any], question: dict[str, Any], answer: str) -> str:
    """Build an optional LLM prompt for answer evaluation."""
    return (
        "Evaluate this interview answer against the candidate profile, the target job, and the question. "
        "Return valid JSON with keys: normalized_score, subscores, strengths, concerns, rationale. "
        "The subscores must include relevance, specificity, consistency_with_profile, job_alignment, clarity, and technical_accuracy when applicable. "
        "Keep the evaluation grounded in the provided brief and avoid speculation.\n"
        f"Candidate brief: {json.dumps(candidate_brief, ensure_ascii=True)}\n"
        f"Question: {json.dumps(question, ensure_ascii=True)}\n"
        f"Answer: {json.dumps(answer, ensure_ascii=True)}"
    )


def build_final_report_prompt(
    candidate_brief: dict[str, Any], evaluations: list[dict[str, Any]], overall_metrics: dict[str, Any]
) -> str:
    """Build an optional prompt for final report synthesis."""
    return (
        "Synthesize a final recruiter-ready JSON report from the interview results. "
        "Return valid JSON only and keep all claims grounded in the evidence. "
        "The summary must evaluate the candidate specifically against the target job, not in isolation. "
        "Reflect both strengths and risks relative to the role requirements.\n"
        f"Candidate brief: {json.dumps(candidate_brief, ensure_ascii=True)}\n"
        f"Evaluations: {json.dumps(evaluations, ensure_ascii=True)}\n"
        f"Metrics: {json.dumps(overall_metrics, ensure_ascii=True)}"
    )
