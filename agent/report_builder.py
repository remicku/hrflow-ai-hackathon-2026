"""Final interview report builder."""

from __future__ import annotations

from statistics import mean
from typing import Any


class ReportBuilder:
    """Aggregate evaluations into a recruiter-friendly final JSON report."""

    def build_report(
        self,
        session_id: str,
        candidate_brief: dict[str, Any],
        evaluations: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Build the final report JSON."""
        if not evaluations:
            return {
                "session_id": session_id,
                "candidate_summary": candidate_brief,
                "per_question_evaluations": [],
                "overall_score": 0.0,
                "communication_score": 0.0,
                "technical_score": 0.0,
                "profile_consistency_score": 0.0,
                "job_alignment_score": 0.0,
                "recommendation": "insufficient_data",
                "strengths": [],
                "concerns": ["No interview answers were recorded."],
                "final_summary": "The interview session did not capture enough answers to produce a hiring recommendation.",
            }

        overall_score = round(mean(item["normalized_score"] for item in evaluations), 1)
        communication_score = round(mean(item["subscores"]["clarity"] for item in evaluations), 1)
        consistency_score = round(mean(item["subscores"]["consistency_with_profile"] for item in evaluations), 1)
        job_alignment_score = round(mean(item["subscores"]["job_alignment"] for item in evaluations), 1)
        technical_scores = [
            item["subscores"]["technical_accuracy"]
            for item in evaluations
            if item["subscores"].get("technical_accuracy") is not None
        ]
        technical_score = round(mean(technical_scores), 1) if technical_scores else overall_score

        strengths = self._aggregate_unique(evaluations, "strengths", limit=5)
        concerns = self._aggregate_unique(evaluations, "concerns", limit=5)
        recommendation = self._recommendation(overall_score, concerns)
        final_summary = self._summary(candidate_brief, overall_score, strengths, concerns, recommendation)

        return {
            "session_id": session_id,
            "candidate_summary": candidate_brief,
            "per_question_evaluations": evaluations,
            "overall_score": overall_score,
            "communication_score": communication_score,
            "technical_score": technical_score,
            "profile_consistency_score": consistency_score,
            "job_alignment_score": job_alignment_score,
            "recommendation": recommendation,
            "strengths": strengths,
            "concerns": concerns,
            "final_summary": final_summary,
        }

    def _aggregate_unique(self, evaluations: list[dict[str, Any]], key: str, limit: int) -> list[str]:
        items: list[str] = []
        seen: set[str] = set()
        for evaluation in evaluations:
            for entry in evaluation.get(key, []):
                if entry not in seen:
                    seen.add(entry)
                    items.append(entry)
        return items[:limit]

    def _recommendation(self, overall_score: float, concerns: list[str]) -> str:
        if overall_score >= 80 and len(concerns) <= 2:
            return "strong_yes"
        if overall_score >= 68:
            return "yes"
        if overall_score >= 55:
            return "mixed"
        return "no"

    def _summary(
        self,
        candidate_brief: dict[str, Any],
        overall_score: float,
        strengths: list[str],
        concerns: list[str],
        recommendation: str,
    ) -> str:
        name = candidate_brief.get("candidate_name") or "The candidate"
        title = candidate_brief.get("current_title") or "their recent role"
        target_role = (candidate_brief.get("target_job") or {}).get("target_role") or "the target role"
        strengths_text = "; ".join(strengths[:2]) if strengths else "limited evidence collected"
        concerns_text = "; ".join(concerns[:2]) if concerns else "no major concerns surfaced"
        return (
            f"{name} interviewed from a {title} background for {target_role} and received an overall score of {overall_score}/100. "
            f"Recommendation: {recommendation}. Key strengths: {strengths_text}. Key concerns: {concerns_text}."
        )
