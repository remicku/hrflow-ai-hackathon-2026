"""HRFlow API wrapper with graceful degraded local helpers."""

from __future__ import annotations

import os
from typing import Any

import httpx


class HRFlowError(Exception):
    """Base error for HRFlow wrapper failures."""


class HRFlowConfigurationError(HRFlowError):
    """Raised when a remote HRFlow call requires missing configuration."""


class HRFlowRequestError(HRFlowError):
    """Raised when the HRFlow API returns an error or invalid payload."""


def _safe_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _safe_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


class HRFlowClient:
    """Small HRFlow v1 client focused on profile-oriented MVP needs."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        source_key: str | None = None,
        board_key: str | None = None,
        timeout: float = 20.0,
    ) -> None:
        self.api_key = api_key or os.getenv("HRFLOW_API_KEY")
        self.base_url = (base_url or os.getenv("HRFLOW_BASE_URL") or "https://api.hrflow.ai/v1").rstrip("/")
        self.source_key = source_key or os.getenv("HRFLOW_SOURCE_KEY")
        self.board_key = board_key or os.getenv("HRFLOW_BOARD_KEY")
        self.timeout = timeout

    @property
    def configured(self) -> bool:
        """Return whether remote HRFlow calls can be made."""
        return bool(self.api_key)

    @property
    def headers(self) -> dict[str, str]:
        """Build shared headers for all HRFlow requests."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-KEY"] = self.api_key
        return headers

    async def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.api_key:
            raise HRFlowConfigurationError("HRFLOW_API_KEY is not configured.")

        url = f"{self.base_url}/{path.lstrip('/')}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(method, url, headers=self.headers, json=payload)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip()
            raise HRFlowRequestError(f"HRFlow API error {exc.response.status_code}: {detail}") from exc
        except httpx.HTTPError as exc:
            raise HRFlowRequestError(f"HRFlow request failed: {exc}") from exc

        try:
            data = response.json()
        except ValueError as exc:
            raise HRFlowRequestError("HRFlow returned non-JSON content.") from exc

        if not isinstance(data, dict):
            raise HRFlowRequestError("HRFlow returned an unexpected payload shape.")
        return data

    def validate_profile(self, profile: dict[str, Any]) -> dict[str, Any]:
        """Validate a HRFlow-like profile and return normalized validation metadata."""
        normalized = self.normalize_profile(profile)
        errors: list[str] = []
        warnings: list[str] = []

        if not normalized.get("profile_key"):
            warnings.append("Profile key is missing.")
        if not normalized.get("name"):
            warnings.append("Candidate name is missing.")
        if not normalized.get("top_skills"):
            warnings.append("No skills detected in the profile.")
        if not normalized.get("profile_text"):
            errors.append("The profile does not contain enough readable content.")

        return {
            "is_valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "normalized_profile": normalized,
        }

    def normalize_profile(self, profile: dict[str, Any]) -> dict[str, Any]:
        """Extract a compact, stable structure from a raw HRFlow profile object."""
        profile = _safe_dict(profile)
        info = _safe_dict(profile.get("info"))
        contact = _safe_dict(profile.get("contact"))
        summary = _safe_dict(profile.get("summary"))
        experiences = _safe_list(profile.get("experiences") or profile.get("experience"))
        education = _safe_list(profile.get("education"))
        certifications = _safe_list(profile.get("certifications") or profile.get("certificates"))
        skills = _safe_list(profile.get("skills"))
        languages = _safe_list(profile.get("languages"))
        metadata = _safe_dict(profile.get("metadata"))

        name = (
            _clean_text(info.get("full_name"))
            or _clean_text(contact.get("full_name"))
            or _clean_text(profile.get("name"))
            or "Unknown Candidate"
        )
        title = (
            _clean_text(info.get("title"))
            or _clean_text(summary.get("title"))
            or _clean_text(profile.get("headline"))
        )
        profile_key = (
            _clean_text(profile.get("key"))
            or _clean_text(profile.get("id"))
            or _clean_text(metadata.get("reference"))
            or _clean_text(profile.get("reference"))
        )

        skill_names: list[str] = []
        for skill in skills:
            if isinstance(skill, dict):
                name_candidate = _clean_text(
                    skill.get("name") or skill.get("label") or skill.get("value") or skill.get("skill")
                )
            else:
                name_candidate = _clean_text(skill)
            if name_candidate and name_candidate.lower() not in {item.lower() for item in skill_names}:
                skill_names.append(name_candidate)

        experience_summaries: list[dict[str, Any]] = []
        total_years = 0.0
        for exp in experiences:
            exp_dict = _safe_dict(exp)
            duration_years = exp_dict.get("duration_years") or exp_dict.get("years")
            try:
                years_value = float(duration_years) if duration_years is not None else 0.0
            except (TypeError, ValueError):
                years_value = 0.0
            total_years += max(years_value, 0.0)
            experience_summaries.append(
                {
                    "title": _clean_text(exp_dict.get("title") or exp_dict.get("position")),
                    "company": _clean_text(exp_dict.get("company") or exp_dict.get("organization")),
                    "summary": _clean_text(exp_dict.get("summary") or exp_dict.get("description")),
                    "duration_years": years_value,
                }
            )

        cert_names: list[str] = []
        for cert in certifications + education:
            cert_dict = _safe_dict(cert)
            cert_name = _clean_text(cert_dict.get("name") or cert_dict.get("title") or cert_dict.get("degree"))
            if cert_name:
                cert_names.append(cert_name)

        text_parts = [
            name,
            title,
            _clean_text(summary.get("text") or profile.get("summary") or profile.get("bio")),
            " ".join(skill_names),
        ]
        for exp in experience_summaries[:4]:
            text_parts.append(" ".join(filter(None, [exp["title"], exp["company"], exp["summary"]])))
        profile_text = " ".join(part for part in text_parts if part).strip()

        language_values: list[str] = []
        for item in languages:
            if isinstance(item, dict):
                language_value = _clean_text(item.get("name") or item.get("language") or item.get("value"))
            else:
                language_value = _clean_text(item)
            if language_value:
                language_values.append(language_value)

        return {
            "profile_key": profile_key or None,
            "name": name,
            "title": title or None,
            "years_of_experience": round(total_years, 1),
            "top_skills": skill_names[:10],
            "experiences": experience_summaries,
            "certifications": cert_names[:8],
            "languages": language_values,
            "profile_text": profile_text,
            "raw_profile_excerpt": {
                "location": _clean_text(contact.get("location") or info.get("location") or profile.get("location")) or None,
                "email": _clean_text(contact.get("email")) or None,
            },
        }

    async def get_profile(self, source_key: str, profile_key: str) -> dict[str, Any]:
        """Get a profile indexed in a HRFlow source."""
        path = f"profiles/{source_key}/{profile_key}"
        return await self._request("GET", path)

    async def ask_profile(self, source_key: str, profile_key: str, question: str) -> dict[str, Any]:
        """Ask a question against a profile indexed in a HRFlow source."""
        path = f"profile_parsing/indexing/{source_key}/profiles/{profile_key}/searching"
        return await self._request("POST", path, {"query": question})

    async def parse_text(self, text: str, text_language: str = "en") -> dict[str, Any]:
        """Parse raw text via HRFlow Text API."""
        payload = {"text": text, "language": text_language}
        return await self._request("POST", "text/parsing", payload)

    async def rate_profile(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Rate a profile or profile/job signal payload via HRFlow Signal API."""
        return await self._request("POST", "profile_rating", payload)
