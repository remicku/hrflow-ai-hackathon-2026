"""Prompt helpers for optional LLM-backed interview generation and synthesis."""

from __future__ import annotations

import json
from typing import Any


QUESTION_GENERATION_SYSTEM_PROMPT = """
Tu es un recruteur expert qui prépare un entretien de présélection de 15 minutes à partir du profil d'un candidat et d'une offre d'emploi cible.
Retourne uniquement du JSON valide.
Génère exactement 3 questions courtes, de 2-3 lignes maximum.
Adresse toi directement au candidat, comme si tu les questions à poser lors de l'entretien.
Chaque question doit être ancrée à la fois dans le profil et dans le poste.
Ne pose pas de questions génériques ou de remplissage.
Priorise l'évaluation de l'adéquation, des preuves, de la préparation et des lacunes probables pour le poste.
Toutes les questions doivent être rédigées en français, SAUF la question 2 (id "q2") qui doit être une question de niveau de langue : elle doit être entièrement rédigée en anglais et le candidat doit y répondre en anglais. La catégorie de cette question doit être "language_proficiency".
Les 3 questions doivent couvrir : 1) intro/synthèse du parcours, 2) niveau d'anglais, 3) validation des compétences clés.
IMPORTANT : La question 1 (id "q1") doit obligatoirement commencer par une salutation chaleureuse et personnalisée adressée au candidat par son prénom (ex: "Bonjour [Prénom], ..."), avant d'enchaîner sur la question d'intro/synthèse.
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
        "À partir du résumé candidat ci-dessous, génère exactement 3 questions d'entretien concises et adaptées au recruteur. "
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
Tu es un recruteur bienveillant qui évalue les réponses d'un candidat lors d'un entretien de présélection.
Tu valorises l'effort, la sincérité et le potentiel, pas seulement la perfection formelle.
Rappelle-toi que le candidat répond à l'oral, en temps réel, sans préparation écrite : quelques imprécisions ou hésitations sont normales et ne doivent pas pénaliser.

Règles de scoring (normalized_score sur 100) :
- 0-20 : réponse vide, hors-sujet total, ou factice (ex: "test", "je ne sais pas", quelques mots sans contenu)
- 21-60 : réponse très vague, aucun exemple, aucun lien avec le poste
- 60 - 80 : Bonne réponse, avec des exemples ou des preuves, mais qui pourrait être plus précise, plus claire, ou mieux alignée avec le poste
- 81-100 : réponse exceptionnelle, rare

Biais positif : en cas de doute entre deux paliers, choisis le plus favorable. Une réponse honnête et sincère même courte mérite au moins 45. Ne sanctionne pas le manque de vocabulaire RH si le fond est bon.

Cas particulier : si la catégorie de la question est "language_proficiency", évalue la qualité de l'anglais.
Une réponse entièrement en français à une question en anglais ne doit pas dépasser 20/100. Pour le reste, sois indulgent sur l'accent ou les petites fautes grammaticales si la communication reste claire.

Retourne uniquement du JSON valide avec les clés : normalized_score, subscores, strengths, concerns, rationale.
Les subscores doivent inclure : relevance, specificity, consistency_with_profile, job_alignment, clarity, et technical_accuracy (si applicable, sinon null).
Chaque subscore est sur 100 et suit la même logique bienveillante.
Les strengths, concerns et rationale doivent être rédigés en français. Mets au moins un point fort même pour les réponses faibles.
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
        "Sois bienveillant : valorise l'effort et le potentiel, pas seulement la perfection. En cas de doute, arrondis vers le haut. "
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
        "Synthétise un rapport final JSON prêt pour le recruteur à partir des résultats d'entretien. "
        "Retourne uniquement du JSON valide et fonde chaque affirmation sur les preuves concrètes. "
        "Le résumé doit évaluer le candidat spécifiquement par rapport au poste cible, pas de manière isolée. "
        "Reflète à la fois les points forts et les risques par rapport aux exigences du poste. "
        "Tous les textes (résumé, points forts, points d'attention, justifications) doivent être rédigés en français.\n"
        f"Résumé candidat : {json.dumps(candidate_brief, ensure_ascii=True)}\n"
        f"Évaluations : {json.dumps(evaluations, ensure_ascii=True)}\n"
        f"Métriques : {json.dumps(overall_metrics, ensure_ascii=True)}"
    )
