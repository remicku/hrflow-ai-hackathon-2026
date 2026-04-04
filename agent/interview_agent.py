"""Interview question generation with deterministic fallback and optional LLM support."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

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


def _extract_job_signals(normalized_job_offer: dict[str, Any] | None) -> dict[str, Any]:
    job = normalized_job_offer or {}
    top_skills = [str(skill) for skill in job.get("top_skills") or []][:5]
    requirements = [str(item) for item in job.get("requirements") or []][:5]
    return {
        "target_role": job.get("title") or "Unknown Role",
        "target_company": job.get("company"),
        "target_skills": top_skills,
        "key_requirements": requirements,
        "job_text": job.get("job_text") or job.get("description_text") or "",
    }


def build_candidate_brief(
    normalized_profile: dict[str, Any], normalized_job_offer: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Create a compact candidate brief from a normalized profile and optional target job."""
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

    job_signals = _extract_job_signals(normalized_job_offer)
    combined_focus = job_signals["target_skills"] or _extract_top_skills(normalized_profile)

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
        "target_job": job_signals,
        "fit_focus_skills": combined_focus[:5],
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
            content = data["choices"][0]["message"]["content"].strip()
            # Strip markdown code fences the LLM sometimes wraps around JSON
            if "```" in content:
                # Extract content between first ``` and last ```
                parts = content.split("```")
                inner = parts[1] if len(parts) >= 3 else parts[-1]
                # Remove optional language tag (e.g. "json\n")
                if inner.startswith(("json", "JSON")):
                    inner = inner.split("\n", 1)[1] if "\n" in inner else inner[4:]
                content = inner.strip()
            parsed = json.loads(content)
            questions = parsed.get("questions")
            if isinstance(questions, list):
                for i, q in enumerate(questions):
                    if isinstance(q, dict):
                        q["id"] = f"q{i + 1}"
            if self._valid_question_set(questions):
                return questions
        except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
            logger.error("LLM question generation failed: %s", exc)
            return None
        return None

    def _generate_questions_deterministic(self, candidate_brief: dict[str, Any]) -> list[dict[str, Any]]:
        name = candidate_brief.get("candidate_name") or "the candidate"
        title = candidate_brief.get("current_title") or "your recent role"
        top_skills = candidate_brief.get("top_skills") or ["your core skills"]
        target_job = candidate_brief.get("target_job") or {}
        target_role = target_job.get("target_role") or "this role"
        target_company = target_job.get("target_company") or "the hiring team"
        target_skills = target_job.get("target_skills") or []
        target_requirements = target_job.get("key_requirements") or []
        strongest_experiences = candidate_brief.get("strongest_experiences") or []
        main_experience = strongest_experiences[0] if strongest_experiences else {}
        secondary_experience = strongest_experiences[1] if len(strongest_experiences) > 1 else {}
        primary_skill = target_skills[0] if target_skills else top_skills[0]
        secondary_skill = target_skills[1] if len(target_skills) > 1 else (top_skills[1] if len(top_skills) > 1 else primary_skill)
        company = main_experience.get("company") or "your recent team"
        project = main_experience.get("title") or title
        secondary_context = secondary_experience.get("title") or secondary_experience.get("company") or "another relevant project"
        raw_requirement = target_requirements[0] if target_requirements else ""
        # Truncate to keep the deterministic question concise
        target_requirement = (raw_requirement[:120].rsplit(" ", 1)[0] + "…") if len(raw_requirement) > 120 else raw_requirement
        target_requirement = target_requirement or f"réussir dans le poste de {target_role}"

        questions = [
            {
                "id": "q1",
                "category": "intro_synthesis",
                "question": f"Bonjour {name}, bienvenue dans cet entretien ! Pouvez-vous me présenter votre parcours et m'expliquer en quoi il fait de vous un bon candidat pour le poste de {target_role} chez {target_company} ?",
                "why_it_matters": f"Vérifie si {name} sait relier son parcours au poste cible plutôt que de simplement résumer ses expériences passées.",
                "expected_signals": ["synthèse claire", "progression de carrière", "adéquation au poste", "points forts pertinents"],
                "scoring_criteria": ["réponse structurée", "alignement profil", "alignement poste", "synthèse concise"],
                "priority": 1,
            },
            {
                "id": "q2",
                "category": "language_proficiency",
                "question": f"This question is in English to assess your language skills. Can you describe your experience working on {project} at {company} and explain which aspects are most relevant to the {target_role} position? Please answer in English.",
                "why_it_matters": "Tests the candidate's ability to communicate professionally in English while validating a real experience.",
                "expected_signals": ["English fluency", "clear structure", "relevant experience", "professional vocabulary"],
                "scoring_criteria": ["English proficiency", "specificity", "consistency with profile", "job relevance"],
                "priority": 1,
            },
            {
                "id": "q3",
                "category": "skill_validation",
                "question": f"Le poste met l'accent sur {primary_skill} et {secondary_skill}. Comment avez-vous utilisé ces compétences dans des projets concrets, et dans quelle mesure êtes-vous prêt à les appliquer dans ce rôle ?",
                "why_it_matters": "Teste si les preuves du profil du candidat soutiennent réellement les compétences les plus importantes pour le poste cible.",
                "expected_signals": ["utilisation concrète", "profondeur de compétence", "conscience des compromis", "préparation au poste"],
                "scoring_criteria": ["pertinence", "spécificité", "clarté technique", "alignement poste"],
                "priority": 2,
            },
        ]
        return questions

    def _valid_question_set(self, questions: Any) -> bool:
        if not isinstance(questions, list) or len(questions) != 3:
            return False
        required = {"id", "category", "question", "why_it_matters", "expected_signals", "scoring_criteria", "priority"}
        for question in questions:
            if not isinstance(question, dict) or not required.issubset(question.keys()):
                return False
        return True
