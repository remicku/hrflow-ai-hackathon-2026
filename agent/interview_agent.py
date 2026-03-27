"""Interview question generation with deterministic fallback and optional LLM support."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

from agent.prompts import QUESTION_GENERATION_SYSTEM_PROMPT, build_question_generation_prompt


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z][A-Za-z0-9+#.\-]{1,}", text or "")


def _infer_seniority(years_of_experience: float) -> str:
    if years_of_experience >= 7:
        return "senior"
    if years_of_experience >= 3:
        return "mid"
    return "junior"


def _extract_top_skills(normalized_profile: dict[str, Any]) -> list[str]:
    skills = normalized_profile.get("top_skills") or []
    if skills:
        return [str(skill) for skill in skills[:5]]

    text = normalized_profile.get("profile_text", "")
    frequency: dict[str, int] = {}
    stopwords = {
        "with",
        "from",
        "that",
        "this",
        "have",
        "worked",
        "experience",
        "candidate",
        "engineer",
        "developer",
        "manager",
    }
    for token in _tokenize(text):
        lowered = token.lower()
        if lowered not in stopwords and len(token) > 2:
            frequency[token] = frequency.get(token, 0) + 1
    return [item for item, _ in sorted(frequency.items(), key=lambda pair: (-pair[1], pair[0]))[:5]]


def build_candidate_brief(normalized_profile: dict[str, Any]) -> dict[str, Any]:
    """Create a compact candidate brief from a normalized profile."""
    experiences = normalized_profile.get("experiences") or []
    strongest_experiences = sorted(
        experiences,
        key=lambda item: (
            float(item.get("duration_years") or 0),
            len(str(item.get("summary") or "")),
            len(str(item.get("title") or "")),
        ),
        reverse=True,
    )[:2]
    years = float(normalized_profile.get("years_of_experience") or 0.0)
    profile_text = normalized_profile.get("profile_text") or normalized_profile.get("name") or "Candidate profile unavailable."

    return {
        "profile_key": normalized_profile.get("profile_key"),
        "candidate_name": normalized_profile.get("name") or "Unknown Candidate",
        "current_title": normalized_profile.get("title") or "Unknown Title",
        "years_of_experience": years,
        "seniority": _infer_seniority(years),
        "top_skills": _extract_top_skills(normalized_profile),
        "strongest_experiences": strongest_experiences,
        "certifications": normalized_profile.get("certifications") or [],
        "profile_text": profile_text,
    }


class InterviewAgent:
    """Generate interview questions from a candidate brief."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.api_key = api_key or os.getenv("OPEN_SOURCE_LLM_API_KEY")
        self.base_url = (base_url or os.getenv("OPEN_SOURCE_LLM_BASE_URL") or "").rstrip("/")
        self.model = model or os.getenv("OPEN_SOURCE_LLM_MODEL") or ""
        self.timeout = timeout

    @property
    def llm_configured(self) -> bool:
        """Return whether an OpenAI-compatible LLM endpoint is configured."""
        return bool(self.api_key and self.base_url and self.model)

    async def generate_questions(self, candidate_brief: dict[str, Any]) -> list[dict[str, Any]]:
        """Generate exactly five interview questions with safe fallback."""
        if self.llm_configured:
            llm_questions = await self._generate_questions_with_llm(candidate_brief)
            if llm_questions:
                return llm_questions
        return self._generate_questions_deterministic(candidate_brief)

    async def _generate_questions_with_llm(self, candidate_brief: dict[str, Any]) -> list[dict[str, Any]] | None:
        payload = {
            "model": self.model,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": QUESTION_GENERATION_SYSTEM_PROMPT},
                {"role": "user", "content": build_question_generation_prompt(candidate_brief)},
            ],
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            questions = parsed.get("questions")
            if self._valid_question_set(questions):
                return questions
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            return None
        return None

    def _generate_questions_deterministic(self, candidate_brief: dict[str, Any]) -> list[dict[str, Any]]:
        name = candidate_brief.get("candidate_name") or "the candidate"
        title = candidate_brief.get("current_title") or "your recent role"
        top_skills = candidate_brief.get("top_skills") or ["your core skills"]
        strongest_experiences = candidate_brief.get("strongest_experiences") or []
        main_experience = strongest_experiences[0] if strongest_experiences else {}
        secondary_experience = strongest_experiences[1] if len(strongest_experiences) > 1 else {}
        primary_skill = top_skills[0]
        secondary_skill = top_skills[1] if len(top_skills) > 1 else primary_skill
        company = main_experience.get("company") or "your recent team"
        project = main_experience.get("title") or title
        secondary_context = secondary_experience.get("title") or secondary_experience.get("company") or "another relevant project"

        questions = [
            {
                "id": "q1",
                "category": "intro_synthesis",
                "question": f"Can you walk me through your background and how it led you to {title}?",
                "why_it_matters": f"This checks whether {name} can summarize their trajectory clearly and connect past work to current positioning.",
                "expected_signals": ["clear summary", "career progression", "relevant highlights"],
                "scoring_criteria": ["structured answer", "profile alignment", "concise synthesis"],
                "priority": 1,
            },
            {
                "id": "q2",
                "category": "experience_validation",
                "question": f"Tell me about your work on {project} at {company}. What was the scope, and what results did you personally drive?",
                "why_it_matters": "This validates ownership, impact, and whether the candidate can explain the strongest experience listed in the profile.",
                "expected_signals": ["specific context", "ownership", "measurable outcomes"],
                "scoring_criteria": ["specificity", "consistency with profile", "impact evidence"],
                "priority": 1,
            },
            {
                "id": "q3",
                "category": "skill_validation",
                "question": f"{primary_skill} stands out in your profile. How have you applied {primary_skill} and {secondary_skill} in real projects?",
                "why_it_matters": "This tests whether the stated core skills are backed by concrete examples and practical understanding.",
                "expected_signals": ["real-world use", "skill depth", "tradeoff awareness"],
                "scoring_criteria": ["relevance", "specificity", "technical clarity"],
                "priority": 2,
            },
            {
                "id": "q4",
                "category": "situational_or_technical",
                "question": f"Imagine you joined a new team and had to improve or troubleshoot work similar to {secondary_context}. How would you approach it?",
                "why_it_matters": "This explores problem-solving, prioritization, and how the candidate transfers past experience into a practical scenario.",
                "expected_signals": ["structured thinking", "technical or situational reasoning", "decision process"],
                "scoring_criteria": ["clarity", "problem-solving", "applicability"],
                "priority": 2,
            },
            {
                "id": "q5",
                "category": "projection_motivation",
                "question": "What kind of role are you looking for next, and how does it build on the strengths in your profile?",
                "why_it_matters": "This helps assess motivation, self-awareness, and whether the candidate's direction matches the profile narrative.",
                "expected_signals": ["motivation", "self-awareness", "future fit"],
                "scoring_criteria": ["relevance", "consistency", "communication"],
                "priority": 3,
            },
        ]
        return questions

    def _valid_question_set(self, questions: Any) -> bool:
        if not isinstance(questions, list) or len(questions) != 5:
            return False
        required = {"id", "category", "question", "why_it_matters", "expected_signals", "scoring_criteria", "priority"}
        for question in questions:
            if not isinstance(question, dict) or not required.issubset(question.keys()):
                return False
        return True
