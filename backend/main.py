import json
import os
import re
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request as UrlRequest, urlopen

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Path as ApiPath, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import APIConnectionError, APITimeoutError, OpenAI, RateLimitError
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

load_dotenv()

DATA_FILE = Path(__file__).parent / "data" / "grievances.json"
MAX_COMPLAINT_LENGTH = 3000
DUPLICATE_THRESHOLD = 0.35
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip() and origin.strip() != "*"
]
DEMO_ADMIN_API_KEY = os.getenv("DEMO_ADMIN_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
STATUS_TRANSITIONS = {
    "Draft": "Pending",
    "Pending": "Under Review",
    "Under Review": "Resolved",
    "Resolved": "Closed",
}


def load_grievances() -> list[dict[str, Any]]:
    with DATA_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_taxonomy() -> list[str]:
    return sorted({item["category_path"] for item in load_grievances() if item.get("category_path")})


CONTROLLED_CATEGORY_PATHS = load_taxonomy()
TAXONOMY_METADATA = {
    item["category_path"]: {
        "org_code": item.get("org_code"),
        "category_v7": item.get("category_v7"),
    }
    for item in load_grievances()
    if item.get("category_path")
}


class ComplaintRequest(BaseModel):
    complaint: str = Field(min_length=1, max_length=MAX_COMPLAINT_LENGTH)

    @field_validator("complaint")
    @classmethod
    def complaint_must_have_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Complaint must contain text")
        return value


class AssistanceResponse(BaseModel):
    department: str
    category: str | None = None
    subcategory: str | None = None
    category_path: str | None = None
    org_code: str | None = None
    category_v7: int | None = None
    confidence: int = Field(ge=0, le=100)
    missing_information: list[str] = Field(default_factory=list, max_length=2)
    prepared_grievance: str


class CandidateGrievance(BaseModel):
    grievance_id: str
    category_path: str | None = None
    status: str | None = None
    created_at: str | None = None
    submitted_at: str | None = None
    original_complaint: str | None = None
    prepared_grievance: str | None = None
    complaint: str | None = None

    def comparison_text(self) -> str:
        return self.original_complaint or self.complaint or self.prepared_grievance or ""


class CandidateDuplicateRequest(ComplaintRequest):
    category_path: str | None = None
    candidates: list[CandidateGrievance] = Field(default_factory=list, max_length=50)


class DemoDuplicateRequest(ComplaintRequest):
    user_id: str = Field(min_length=1, max_length=50)


class DuplicateResponse(BaseModel):
    possible_match: bool
    similarity: float = Field(ge=0, le=100)
    matched_grievance: dict[str, Any] | None
    context_note: str | None = None


class StatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str

    @field_validator("status")
    @classmethod
    def status_must_be_known(cls, value: str) -> str:
        value = value.strip()
        allowed = {*STATUS_TRANSITIONS, "Closed"}
        if value not in allowed:
            raise ValueError(f"Status must be one of: {', '.join(sorted(allowed))}")
        return value


class StatusUpdateResponse(BaseModel):
    grievance_id: str
    status: str
    updated_at: str
    simulated: bool = True


def parse_model_json(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=502, detail="The assistance service returned an invalid response. Please try again.") from error


def category_parts(path: str | None) -> tuple[str, str | None, str | None]:
    if not path:
        return "Unable to determine", None, None
    parts = [part.strip() for part in path.split(">")]
    return parts[0], parts[1] if len(parts) > 1 else None, parts[2] if len(parts) > 2 else None


def validate_assistance(payload: dict[str, Any]) -> AssistanceResponse:
    category_path = payload.get("category_path")
    if category_path not in CONTROLLED_CATEGORY_PATHS:
        category_path = None
    department, category, subcategory = category_parts(category_path)
    prepared = str(payload.get("prepared_grievance", "")).strip()
    if not prepared:
        raise HTTPException(status_code=502, detail="The assistance service could not prepare the grievance. Please try again.")
    missing = payload.get("missing_information", [])
    if not isinstance(missing, list):
        missing = []
    sensitive_terms = ("aadhaar", "aadhar", "pan number", "password", "otp", "bank credential", "card number", "cvv")
    missing = [
        str(item).strip()
        for item in missing
        if str(item).strip() and not any(term in str(item).lower() for term in sensitive_terms)
    ][:2]
    try:
        confidence = max(0, min(100, int(payload.get("confidence", 0))))
    except (TypeError, ValueError):
        confidence = 0
    metadata = TAXONOMY_METADATA.get(category_path, {})
    return AssistanceResponse(
        department=department,
        category=category,
        subcategory=subcategory,
        category_path=category_path,
        org_code=metadata.get("org_code"),
        category_v7=metadata.get("category_v7"),
        confidence=confidence,
        missing_information=missing,
        prepared_grievance=prepared,
    )


def get_client() -> OpenAI:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="AI assistance is not configured. Please contact the site operator.")
    return OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY, timeout=30.0)


def run_assistance(complaint: str) -> AssistanceResponse:
    taxonomy = "\n".join(f"- {path}" for path in CONTROLLED_CATEGORY_PATHS)
    prompt = f"""
You assist citizens before they independently submit a grievance on CPGRAMS.
Use exactly one category_path from the controlled list below when a suitable path exists; otherwise use null.
Ask at most two short clarification questions only when information genuinely needed for action is missing.
Never request Aadhaar, PAN, passwords, OTPs, bank credentials, full card details, or unnecessary medical data.
Prepare a respectful, factual grievance of at most 80 words. Preserve only supplied facts. Never invent dates,
amounts, locations, reference numbers, policies, laws, or government actions. No greeting, sign-off, markdown,
explanation, or word-count commentary.

Return ONLY JSON:
{{"category_path": string|null, "org_code": string|null, "category_v7": integer|null,
"confidence": integer 0-100, "missing_information": [string], "prepared_grievance": string}}

CONTROLLED CATEGORY PATHS:
{taxonomy}

CITIZEN COMPLAINT:
{complaint}
"""
    try:
        response = get_client().chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        if not content:
            raise HTTPException(status_code=502, detail="The assistance service returned an empty response. Please try again.")
        return validate_assistance(parse_model_json(content))
    except HTTPException:
        raise
    except RateLimitError as error:
        raise HTTPException(status_code=429, detail="AI assistance is temporarily busy. Please wait and try again.") from error
    except (APITimeoutError, APIConnectionError) as error:
        raise HTTPException(status_code=503, detail="AI assistance is temporarily unavailable. Please try again.") from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="AI assistance could not complete this request. Please try again.") from error


def compare_candidates(complaint: str, candidates: list[dict[str, Any]], category_path: str | None = None) -> DuplicateResponse:
    usable = [item for item in candidates if (item.get("comparison_text") or "").strip()]
    if not usable:
        return DuplicateResponse(possible_match=False, similarity=0, matched_grievance=None)
    texts = [item["comparison_text"] for item in usable] + [complaint]
    try:
        vectors = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1).fit_transform(texts)
    except ValueError:
        return DuplicateResponse(possible_match=False, similarity=0, matched_grievance=None)
    scores = cosine_similarity(vectors[-1], vectors[:-1])[0]
    ranked = []
    for index, score in enumerate(scores):
        item = usable[index]
        category_bonus = 0.08 if category_path and item.get("category_path") == category_path else 0
        ranked.append((min(1.0, float(score) + category_bonus), item))
    best_score, best = max(ranked, key=lambda pair: pair[0])
    if best_score < DUPLICATE_THRESHOLD:
        return DuplicateResponse(possible_match=False, similarity=round(best_score * 100, 1), matched_grievance=None)
    public_match = {key: value for key, value in best.items() if key != "comparison_text"}
    return DuplicateResponse(
        possible_match=True,
        similarity=round(best_score * 100, 1),
        matched_grievance=public_match,
        context_note="Text similarity indicates a related issue, but differences in location, date, or reference may mean it is a separate grievance.",
    )


def require_admin_key(provided_key: str | None) -> None:
    if not DEMO_ADMIN_API_KEY:
        raise HTTPException(status_code=503, detail="Simulated status administration is not configured")
    if not provided_key or not secrets.compare_digest(provided_key, DEMO_ADMIN_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid demo administration key")


def require_supabase_admin_config() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Simulated status storage is not configured")


def supabase_admin_request(
    method: str,
    grievance_id: str,
    payload: dict[str, Any] | None = None,
    current_status: str | None = None,
) -> list[dict[str, Any]]:
    require_supabase_admin_config()
    encoded_id = quote(grievance_id, safe="")
    url = f"{SUPABASE_URL}/rest/v1/grievances?grievance_id=eq.{encoded_id}"
    if current_status is not None:
        url += f"&status=eq.{quote(current_status, safe='')}"
    url += "&select=grievance_id,status,updated_at&limit=2"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "return=representation",
    }
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = UrlRequest(url, data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=15) as response:
            content = response.read().decode("utf-8")
            return json.loads(content) if content else []
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=502, detail="Simulated status storage is temporarily unavailable") from error


def get_admin_grievance(grievance_id: str) -> dict[str, Any] | None:
    rows = supabase_admin_request("GET", grievance_id)
    if len(rows) > 1:
        raise HTTPException(status_code=409, detail="Grievance reference is not unique")
    return rows[0] if rows else None


def update_admin_grievance_status(grievance_id: str, current_status: str, status: str) -> dict[str, Any]:
    updated_at = datetime.now(timezone.utc).isoformat()
    rows = supabase_admin_request(
        "PATCH",
        grievance_id,
        {"status": status, "updated_at": updated_at},
        current_status=current_status,
    )
    if len(rows) != 1:
        raise HTTPException(status_code=409, detail="Grievance status changed before this transition could be applied")
    return rows[0]


app = FastAPI(title="Smart CPGRAM Assistant API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

request_times: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def basic_ai_rate_limit(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method == "POST":
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        bucket = request_times[key]
        while bucket and now - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= 20:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait a minute and try again."},
            )
        bucket.append(now)
    return await call_next(request)


@app.get("/")
def read_root():
    return {"message": "Smart CPGRAM Assistant API is running", "official_government_service": False}


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "Smart CPGRAM Assistant"}


@app.post("/api/v1/grievance-assistance", response_model=AssistanceResponse)
def grievance_assistance(data: ComplaintRequest):
    return run_assistance(data.complaint)


@app.post("/api/v1/duplicate-check", response_model=DuplicateResponse)
def authenticated_candidate_duplicate_check(data: CandidateDuplicateRequest):
    candidates = [
        {**item.model_dump(), "comparison_text": item.comparison_text()}
        for item in data.candidates
    ]
    return compare_candidates(data.complaint, candidates, data.category_path)


@app.patch("/api/v1/admin/grievances/{grievance_id}/status", response_model=StatusUpdateResponse)
def update_grievance_status(
    grievance_id: Annotated[str, ApiPath(pattern=r"^SMART-\d{4}-[A-Z0-9]{8}$")],
    data: StatusUpdateRequest,
    admin_key: str | None = Header(default=None, alias="X-Demo-Admin-Key"),
):
    require_admin_key(admin_key)
    grievance = get_admin_grievance(grievance_id)
    if grievance is None:
        raise HTTPException(status_code=404, detail="Grievance not found")
    current_status = grievance.get("status")
    expected_status = STATUS_TRANSITIONS.get(current_status)
    if data.status != expected_status:
        raise HTTPException(
            status_code=409,
            detail=f"Invalid status transition from {current_status} to {data.status}",
        )
    updated = update_admin_grievance_status(grievance_id, current_status, data.status)
    return StatusUpdateResponse(
        grievance_id=grievance_id,
        status=data.status,
        updated_at=updated["updated_at"],
    )


@app.get("/api/users/{user_id}/grievances")
def get_demo_user_grievances(user_id: str):
    if user_id != "DEMO035":
        raise HTTPException(status_code=404, detail="Synthetic demo user not found")
    items = [item for item in load_grievances() if item["user_id"] == user_id]
    return {"user_id": user_id, "count": len(items), "grievances": items}


@app.post("/api/check-duplicate", response_model=DuplicateResponse)
def demo_duplicate_check(data: DemoDuplicateRequest):
    if data.user_id != "DEMO035":
        raise HTTPException(status_code=403, detail="This endpoint is limited to the synthetic demo user")
    candidates = []
    for item in load_grievances():
        if item["user_id"] == data.user_id:
            candidates.append({**item, "comparison_text": item.get("complaint", "")})
    return compare_candidates(data.complaint, candidates)


# Compatibility routes retained for clients built against the prototype API.
@app.post("/api/classify")
def classify_grievance(data: ComplaintRequest):
    result = run_assistance(data.complaint)
    return result.model_dump(exclude={"prepared_grievance", "missing_information"})


@app.post("/api/rewrite")
def rewrite_grievance(data: ComplaintRequest):
    result = run_assistance(data.complaint)
    return {"rewritten_grievance": result.prepared_grievance}
