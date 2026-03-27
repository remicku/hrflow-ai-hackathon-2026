"""Deterministic scoring logic for interview answers."""

from __future__ import annotations

import math
import re
from typing import Any


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z][A-Za-z0-9+#.\-]{1,}", text.lower())


def _bounded(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


class InterviewScorer:
    """Score answers with deterministic heuristics and profile-aware signals."""

    def evaluate_answer(
        self,
        candidate_brief: dict[str, Any],
        question: dict[str, Any],
        transcript: str,
    ) -> dict[str, Any]:
        """Evaluate one answer and return normalized score, subscores, and reasoning."""
        answer = (transcript or "").strip()
        answer_tokens = _tokenize(answer)
        question_tokens = set(_tokenize(question.get("question", "")))
        profile_terms = set(_tokenize(candidate_brief.get("profile_text", "")))
        skill_terms = {token.lower() for token in candidate_brief.get("top_skills", [])}
        expected_signals = {token.lower() for token in question.get("expected_signals", [])}
        word_count = len(answer_tokens)

        relevance = self._score_relevance(answer_tokens, question_tokens, expected_signals)
        specificity = self._score_specificity(answer, word_count)
        consistency = self._score_consistency(answer_tokens, profile_terms, skill_terms)
        clarity = self._score_clarity(answer, word_count)
        technical = self._score_technical_accuracy(question, answer)

        active_scores = [relevance, specificity, consistency, clarity]
        if technical is not None:
            active_scores.append(technical)
        normalized_score = round(sum(active_scores) / len(active_scores), 1)

        strengths: list[str] = []
        concerns: list[str] = []
        if relevance >= 70:
            strengths.append("The answer stays close to the question asked.")
        if specificity >= 70:
            strengths.append("The answer includes concrete details rather than generic claims.")
        if consistency >= 70:
            strengths.append("The response aligns well with the candidate profile.")
        if clarity >= 70:
            strengths.append("The explanation is structured and easy to follow.")
        if technical is not None and technical >= 70:
            strengths.append("The answer shows credible technical reasoning.")

        if relevance < 55:
            concerns.append("The answer only partially addresses the question.")
        if specificity < 55:
            concerns.append("The answer lacks concrete examples or outcomes.")
        if consistency < 55:
            concerns.append("The response does not strongly connect back to the profile.")
        if clarity < 55:
            concerns.append("The explanation is hard to follow or too brief.")
        if technical is not None and technical < 55:
            concerns.append("The technical reasoning is too shallow or unclear.")

        if not answer:
            concerns = ["No transcript was provided."]
            strengths = []

        rationale = self._build_rationale(relevance, specificity, consistency, clarity, technical)
        subscores = {
            "relevance": relevance,
            "specificity": specificity,
            "consistency_with_profile": consistency,
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
        raw = 35 + overlap * 6 + signal_overlap * 10
        return round(_bounded(raw))

    def _score_specificity(self, answer: str, word_count: int) -> float:
        if not answer.strip():
            return 0.0
        digits = len(re.findall(r"\d", answer))
        action_words = len(re.findall(r"\b(built|led|improved|designed|delivered|reduced|increased|migrated|optimized)\b", answer.lower()))
        raw = 25 + min(word_count, 120) * 0.35 + digits * 3 + action_words * 6
        return round(_bounded(raw))

    def _score_consistency(self, answer_tokens: list[str], profile_terms: set[str], skill_terms: set[str]) -> float:
        if not answer_tokens:
            return 0.0
        profile_overlap = len(set(answer_tokens) & profile_terms)
        skill_overlap = len(set(answer_tokens) & skill_terms)
        raw = 30 + profile_overlap * 4 + skill_overlap * 8
        return round(_bounded(raw))

    def _score_clarity(self, answer: str, word_count: int) -> float:
        if not answer.strip():
            return 0.0
        sentence_count = max(1, len(re.findall(r"[.!?]+", answer)))
        avg_sentence_length = word_count / sentence_count if sentence_count else word_count
        length_component = 70 if 35 <= word_count <= 180 else max(35, 80 - abs(word_count - 90) * 0.5)
        sentence_component = max(40, 85 - abs(avg_sentence_length - 18) * 1.5)
        return round(_bounded((length_component + sentence_component) / 2))

    def _score_technical_accuracy(self, question: dict[str, Any], answer: str) -> float | None:
        category = str(question.get("category", ""))
        if category not in {"skill_validation", "situational_or_technical"}:
            return None
        answer_tokens = set(_tokenize(answer))
        technical_terms = {
            "api",
            "system",
            "architecture",
            "testing",
            "deployment",
            "debugging",
            "database",
            "performance",
            "security",
            "scalability",
            "tradeoff",
            "monitoring",
        }
        matches = len(answer_tokens & technical_terms)
        raw = 35 + matches * 9 + min(len(answer_tokens), 80) * 0.25
        return round(_bounded(raw))

    def _build_rationale(
        self,
        relevance: float,
        specificity: float,
        consistency: float,
        clarity: float,
        technical: float | None,
    ) -> str:
        parts = [
            f"Relevance is {int(relevance)}/100",
            f"specificity is {int(specificity)}/100",
            f"profile consistency is {int(consistency)}/100",
            f"clarity is {int(clarity)}/100",
        ]
        if technical is not None:
            parts.append(f"technical accuracy is {int(technical)}/100")
        return ", ".join(parts) + "."
