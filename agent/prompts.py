"""Prompt helpers for optional LLM-backed interview generation and synthesis."""

from __future__ import annotations

import json
from typing import Any


QUESTION_GENERATION_SYSTEM_PROMPT = """
Tu es un recruteur expert qui prépare un entretien de présélection de 15 minutes à partir du profil d'un candidat et d'une offre d'emploi cible.
Retourne uniquement du JSON valide.
Génère exactement 5 questions courtes, de 2-3 lignes maximum.
Chaque question doit être ancrée à la fois dans le profil et dans le poste.
Ne pose pas de questions génériques ou de remplissage.
Priorise l'évaluation de l'adéquation, des preuves, de la préparation et des lacunes probables pour le poste.
Toutes les questions doivent être rédigées en français, SAUF la question 2 (id "q2") qui doit être une question de niveau de langue : elle doit être entièrement rédigée en anglais et le candidat doit y répondre en anglais. La catégorie de cette question doit être "language_proficiency".
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
        "À partir du résumé candidat ci-dessous, génère exactement 5 questions d'entretien concises et adaptées au recruteur. "
        "Chaque question doit être concise et prête à être posée, idéalement une phrase et jamais plus de 2-3 lignes. "
        "Retourne du JSON valide sous la forme {\"questions\": [...]} où chaque question contient : "
        "id, category, question, why_it_matters, expected_signals, scoring_criteria, priority. "
        "Les questions doivent couvrir intro/synthèse, test de langue anglaise (q2), validation de compétences, mise en situation ou technique, "
        "et projection/motivation. La question 2 (id q2, catégorie language_proficiency) DOIT être entièrement rédigée en anglais pour tester le niveau d'anglais du candidat. "
        "Toutes les autres questions doivent être en français. "
        "Évite les formulations génériques. Chaque question doit tester l'adéquation du candidat au poste cible, pas seulement au profil. "
        "Quand le résumé contient des compétences cibles ou des exigences du poste, ancre explicitement les questions dessus.\n"
        f"{json.dumps(candidate_brief, ensure_ascii=True)}"
    )


ANSWER_EVALUATION_SYSTEM_PROMPT = """
Tu es un recruteur expert qui évalue les réponses d'un candidat lors d'un entretien de présélection.
Tu dois évaluer chaque réponse de manière stricte et réaliste.

Règles de scoring (normalized_score sur 100) :
- 0-15 : réponse vide, hors-sujet, ou factice (ex: "test", "je ne sais pas", quelques mots sans contenu)
- 16-35 : réponse très vague, générique, sans aucun exemple concret ni lien avec le poste
- 36-55 : réponse passable, quelques éléments pertinents mais manque de profondeur ou d'exemples
- 56-75 : bonne réponse, exemples concrets, lien clair avec le poste et le profil
- 76-90 : très bonne réponse, détaillée, structurée, avec impact mesurable et forte adéquation au poste
- 91-100 : réponse exceptionnelle, réservé aux réponses quasi parfaites

Cas particulier : si la catégorie de la question est "language_proficiency", tu dois évaluer la qualité de l'anglais du candidat.
Une réponse en français à une question en anglais doit recevoir un score très bas. Évalue la grammaire, le vocabulaire, la fluidité et la capacité à s'exprimer professionnellement en anglais.

Retourne uniquement du JSON valide avec les clés : normalized_score, subscores, strengths, concerns, rationale.
Les subscores doivent inclure : relevance, specificity, consistency_with_profile, job_alignment, clarity, et technical_accuracy (si applicable, sinon null).
Chaque subscore est sur 100 et suit la même logique de sévérité.
Les strengths, concerns et rationale doivent être rédigés en français.
""".strip()


def build_answer_evaluation_prompt(candidate_brief: dict[str, Any], question: dict[str, Any], answer: str) -> str:
    """Build an LLM prompt for answer evaluation."""
    category = question.get("category", "")
    language_instruction = ""
    if category == "language_proficiency":
        language_instruction = (
            "\n\nATTENTION : cette question est un TEST DE NIVEAU D'ANGLAIS. "
            "Le candidat DOIT répondre en anglais. "
            "Si la réponse est en français ou dans une autre langue que l'anglais, le score ne doit PAS dépasser 15/100 "
            "et tu dois le mentionner clairement dans les concerns. "
            "Évalue aussi la grammaire, le vocabulaire professionnel et la fluidité en anglais."
        )
    return (
        "Évalue cette réponse d'entretien en la comparant au profil du candidat, au poste cible et à la question posée. "
        "Sois strict : une réponse courte, vague ou factice doit recevoir un score très bas. "
        f"Retourne uniquement du JSON valide.{language_instruction}\n"
        f"Résumé candidat : {json.dumps(candidate_brief, ensure_ascii=True)}\n"
        f"Question : {json.dumps(question, ensure_ascii=True)}\n"
        f"Réponse du candidat : {json.dumps(answer, ensure_ascii=True)}"
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
