"""Interview answer scoring with LLM-as-a-judge and deterministic fallback."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

from agent.prompts import ANSWER_EVALUATION_SYSTEM_PROMPT, build_answer_evaluation_prompt

logger = logging.getLogger(__name__)


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F0-9+#.\-]{1,}", text.lower())


def _bounded(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


class InterviewScorer:
    """Score answers via LLM-as-a-judge with deterministic fallback."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 15.0,
    ) -> None:
        self.api_key = api_key or os.getenv("OPEN_SOURCE_LLM_API_KEY")
        self.base_url = (base_url or os.getenv("OPEN_SOURCE_LLM_BASE_URL") or "").rstrip("/")
        self.model = model or os.getenv("OPEN_SOURCE_LLM_MODEL") or ""
        self.timeout = timeout

    @property
    def llm_configured(self) -> bool:
        return bool(self.api_key and self.base_url and self.model)

    async def evaluate_answer(
        self,
        candidate_brief: dict[str, Any],
        question: dict[str, Any],
        transcript: str,
    ) -> dict[str, Any]:
        """Evaluate one answer, trying LLM first then falling back to heuristics."""
        if self.llm_configured:
            result = await self._evaluate_with_llm(candidate_brief, question, transcript)
            if result:
                result["question_id"] = question.get("id")
                self._enforce_language_check(question, transcript, result)
                return result
        result = self._evaluate_deterministic(candidate_brief, question, transcript)
        self._enforce_language_check(question, transcript, result)
        return result

    async def _evaluate_with_llm(
        self,
        candidate_brief: dict[str, Any],
        question: dict[str, Any],
        transcript: str,
    ) -> dict[str, Any] | None:
        payload = {
            "model": self.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": ANSWER_EVALUATION_SYSTEM_PROMPT},
                {"role": "user", "content": build_answer_evaluation_prompt(candidate_brief, question, transcript)},
            ],
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
            content = data["choices"][0]["message"]["content"].strip()
            if "```" in content:
                parts = content.split("```")
                inner = parts[1] if len(parts) >= 3 else parts[-1]
                if inner.startswith(("json", "JSON")):
                    inner = inner.split("\n", 1)[1] if "\n" in inner else inner[4:]
                content = inner.strip()
            parsed = json.loads(content)
            if self._valid_evaluation(parsed):
                self._normalize_evaluation(parsed)
                return parsed
            logger.error("LLM evaluation invalid structure: %s", list(parsed.keys()))
        except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
            logger.error("LLM answer evaluation failed: %s", exc)
        return None

    def _enforce_language_check(self, question: dict[str, Any], transcript: str, result: dict[str, Any]) -> None:
        """For language_proficiency questions, cap the score if the answer is not in English."""
        logger.warning("Language check: question_id=%s category=%s", question.get("id"), question.get("category"))
        if question.get("category") != "language_proficiency":
            return
        answer = (transcript or "").strip().lower()
        if not answer:
            return
        # Detect French by checking for common French words
        french_markers = {"je", "le", "la", "les", "de", "du", "des", "un", "une", "est", "et", "en", "que", "qui", "dans", "pour", "avec", "sur", "mon", "mes", "son", "ses", "nous", "vous", "ils", "elle", "ce", "cette", "pas", "aussi", "mais", "donc", "car", "ai", "été", "avoir", "être", "fait", "très"}
        words = set(re.findall(r"[a-zàâäéèêëïîôùûüÿç]+", answer))
        french_count = len(words & french_markers)
        french_ratio = french_count / max(len(words), 1)
        logger.warning("Language detection: words=%d french_count=%d ratio=%.2f answer=%s", len(words), french_count, french_ratio, answer[:100])
        if french_ratio > 0.15:
            result["normalized_score"] = min(result.get("normalized_score", 0), 10)
            subscores = result.get("subscores") or {}
            for key in subscores:
                if isinstance(subscores[key], (int, float)):
                    subscores[key] = min(subscores[key], 15)
            penalty = "Le candidat a répondu en français alors que la question exigeait une réponse en anglais."
            concerns = result.get("concerns") or []
            if isinstance(concerns, list):
                concerns.insert(0, penalty)
            else:
                concerns = [penalty]
            result["concerns"] = concerns
            result["rationale"] = penalty

    def _normalize_evaluation(self, result: dict[str, Any]) -> None:
        """Ensure LLM output matches the expected types for the frontend."""
        # strengths/concerns must be lists of strings
        for key in ("strengths", "concerns"):
            val = result.get(key)
            if isinstance(val, str):
                result[key] = [val] if val else []
            elif not isinstance(val, list):
                result[key] = []
        # normalized_score must be a rounded number
        result["normalized_score"] = round(float(result.get("normalized_score", 0)), 1)
        # subscores: ensure all expected keys exist with correct types
        subscores = result.get("subscores") or {}
        for sub_key in ("relevance", "specificity", "consistency_with_profile", "job_alignment", "clarity"):
            val = subscores.get(sub_key)
            subscores[sub_key] = round(float(val), 1) if isinstance(val, (int, float)) else 0.0
        tech = subscores.get("technical_accuracy")
        subscores["technical_accuracy"] = round(float(tech), 1) if isinstance(tech, (int, float)) else None
        result["subscores"] = subscores
        # rationale must be a string
        if not isinstance(result.get("rationale"), str):
            result["rationale"] = ""

    def _valid_evaluation(self, result: Any) -> bool:
        if not isinstance(result, dict):
            return False
        required = {"normalized_score", "subscores", "strengths", "concerns", "rationale"}
        if not required.issubset(result.keys()):
            return False
        score = result.get("normalized_score")
        if not isinstance(score, (int, float)) or score < 0 or score > 100:
            return False
        return True

    # ── Deterministic fallback ──

    def _evaluate_deterministic(
        self,
        candidate_brief: dict[str, Any],
        question: dict[str, Any],
        transcript: str,
    ) -> dict[str, Any]:
        answer = (transcript or "").strip()
        answer_tokens = _tokenize(answer)
        question_tokens = set(_tokenize(question.get("question", "")))
        profile_terms = set(_tokenize(candidate_brief.get("profile_text", "")))
        skill_terms = {token.lower() for token in candidate_brief.get("top_skills", [])}
        target_job = candidate_brief.get("target_job") or {}
        job_terms = set(_tokenize(target_job.get("job_text", "")))
        target_skill_terms = {token.lower() for token in target_job.get("target_skills", [])}
        expected_signals = {token.lower() for token in question.get("expected_signals", [])}
        word_count = len(answer_tokens)

        relevance = self._score_relevance(answer_tokens, question_tokens, expected_signals)
        specificity = self._score_specificity(answer, word_count)
        consistency = self._score_consistency(answer_tokens, profile_terms, skill_terms)
        job_alignment = self._score_job_alignment(answer_tokens, job_terms, target_skill_terms)
        clarity = self._score_clarity(answer, word_count)
        technical = self._score_technical_accuracy(question, answer)

        active_scores = [relevance, specificity, consistency, job_alignment, clarity]
        if technical is not None:
            active_scores.append(technical)
        normalized_score = round(sum(active_scores) / len(active_scores), 1)

        strengths: list[str] = []
        concerns: list[str] = []
        if relevance >= 60:
            strengths.append("La réponse reste proche de la question posée.")
        if specificity >= 60:
            strengths.append("La réponse inclut des détails concrets.")
        if consistency >= 60:
            strengths.append("La réponse est cohérente avec le profil du candidat.")
        if job_alignment >= 60:
            strengths.append("La réponse montre un lien clair avec le poste cible.")
        if clarity >= 60:
            strengths.append("L'explication est structurée et facile à suivre.")

        if relevance < 40:
            concerns.append("La réponse ne répond que partiellement à la question.")
        if specificity < 40:
            concerns.append("La réponse manque d'exemples concrets.")
        if consistency < 40:
            concerns.append("La réponse ne fait pas de lien avec le profil.")
        if job_alignment < 40:
            concerns.append("La réponse n'explique pas l'adéquation avec le poste.")
        if clarity < 40:
            concerns.append("L'explication est trop brève ou difficile à suivre.")

        if not answer:
            concerns = ["Aucune réponse fournie."]
            strengths = []

        rationale = (
            f"Pertinence {int(relevance)}/100, spécificité {int(specificity)}/100, "
            f"cohérence profil {int(consistency)}/100, alignement poste {int(job_alignment)}/100, "
            f"clarté {int(clarity)}/100"
            + (f", précision technique {int(technical)}/100" if technical is not None else "")
            + "."
        )
        subscores = {
            "relevance": relevance,
            "specificity": specificity,
            "consistency_with_profile": consistency,
            "job_alignment": job_alignment,
            "clarity": clarity,
            "technical_accuracy": technical,
        }
        return {
            "question_id": question.get("id"),
            "normalized_score": normalized_score,
            "subscores": subscores,
            "strengths": strengths[:3],
            "concerns": concerns[:3],
            "rationale": rationale,
        }

    def _score_relevance(self, answer_tokens: list[str], question_tokens: set[str], expected_signals: set[str]) -> float:
        if not answer_tokens:
            return 0.0
        overlap = len(set(answer_tokens) & question_tokens)
        signal_overlap = len(set(answer_tokens) & expected_signals)
        raw = 10 + overlap * 8 + signal_overlap * 12
        return round(_bounded(raw))

    def _score_specificity(self, answer: str, word_count: int) -> float:
        if not answer.strip():
            return 0.0
        if word_count < 5:
            return 5.0
        digits = len(re.findall(r"\d", answer))
        action_words = len(re.findall(
            r"\b(construit|dirigé|amélioré|conçu|livré|réduit|augmenté|migré|optimisé|développé|implémenté|géré|créé|built|led|improved|designed|delivered|reduced|increased|migrated|optimized)\b",
            answer.lower(),
        ))
        raw = 10 + min(word_count, 150) * 0.4 + digits * 4 + action_words * 8
        return round(_bounded(raw))

    def _score_consistency(self, answer_tokens: list[str], profile_terms: set[str], skill_terms: set[str]) -> float:
        if not answer_tokens:
            return 0.0
        profile_overlap = len(set(answer_tokens) & profile_terms)
        skill_overlap = len(set(answer_tokens) & skill_terms)
        raw = 8 + profile_overlap * 5 + skill_overlap * 10
        return round(_bounded(raw))

    def _score_job_alignment(self, answer_tokens: list[str], job_terms: set[str], target_skill_terms: set[str]) -> float:
        if not answer_tokens:
            return 0.0
        job_overlap = len(set(answer_tokens) & job_terms)
        target_skill_overlap = len(set(answer_tokens) & target_skill_terms)
        raw = 8 + job_overlap * 5 + target_skill_overlap * 12
        return round(_bounded(raw))

    def _score_clarity(self, answer: str, word_count: int) -> float:
        if not answer.strip():
            return 0.0
        if word_count < 5:
            return 5.0
        sentence_count = max(1, len(re.findall(r"[.!?]+", answer)))
        avg_sentence_length = word_count / sentence_count
        length_component = 70 if 35 <= word_count <= 180 else max(15, 80 - abs(word_count - 90) * 0.6)
        sentence_component = max(20, 85 - abs(avg_sentence_length - 18) * 2)
        return round(_bounded((length_component + sentence_component) / 2))

    def _score_technical_accuracy(self, question: dict[str, Any], answer: str) -> float | None:
        category = str(question.get("category", ""))
        if category not in {"skill_validation", "situational_or_technical"}:
            return None
        answer_tokens = set(_tokenize(answer))
        technical_terms = {
            "api", "system", "architecture", "testing", "deployment", "debugging",
            "database", "performance", "security", "scalability", "tradeoff", "monitoring",
            "données", "modèle", "algorithme", "pipeline", "infrastructure", "serveur",
        }
        matches = len(answer_tokens & technical_terms)
        raw = 10 + matches * 10 + min(len(answer_tokens), 80) * 0.3
        return round(_bounded(raw))
