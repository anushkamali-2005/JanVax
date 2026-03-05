"""
backend/routers/ocr.py
-----------------------
POST /ocr-clean — receives raw Tesseract OCR text, returns structured vaccine records.

Pipeline:
  raw_text → spaCy NER (extract dates + org names) → rapidfuzz matching
  → standardized vaccine records with confidence scores

CRITICAL: Input is messy OCR text from paper cards — handle all date formats.
CRITICAL: rapidfuzz fuzzy matching handles DTwP vs DPT vs DTP variations.
CRITICAL: Never guess a vaccine if confidence < 0.65 — return as unmatched.
CRITICAL: Load spaCy model once at module level, not per request.
"""

import re
import spacy
from datetime import datetime
from rapidfuzz import fuzz, process
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# ── Load spaCy once ───────────────────────────────────────────────────────────
# python -m spacy download en_core_web_sm  (run once during setup)
try:
    _nlp = spacy.load("en_core_web_sm")
except OSError:
    # Fallback: download on first run
    import subprocess
    subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"], check=True)
    _nlp = spacy.load("en_core_web_sm")


# ── Vaccine name dictionary for fuzzy matching ────────────────────────────────
# Keys: all known abbreviations/variants
# Values: (standardized_name, vaccine_code)
VACCINE_ALIASES = {
    "bcg":          ("BCG",             "BCG"),
    "opv":          ("OPV Birth Dose",  "OPV-0"),
    "opv-0":        ("OPV Birth Dose",  "OPV-0"),
    "opv birth":    ("OPV Birth Dose",  "OPV-0"),
    "hep b":        ("Hep B Birth Dose","HEP-B0"),
    "hepatitis b":  ("Hep B Birth Dose","HEP-B0"),
    "hepb":         ("Hep B Birth Dose","HEP-B0"),
    "dpt":          ("DPT Dose 1",      "DPT-1"),
    "dtp":          ("DPT Dose 1",      "DPT-1"),
    "dtwp":         ("DPT Dose 1",      "DPT-1"),
    "pentavalent":  ("DPT Dose 1",      "DPT-1"),
    "penta":        ("DPT Dose 1",      "DPT-1"),
    "ipv":          ("IPV Dose 1",      "IPV-1"),
    "hib":          ("Hib Dose 1",      "HIB-1"),
    "rotavirus":    ("Rotavirus Dose 1","ROTA-1"),
    "rota":         ("Rotavirus Dose 1","ROTA-1"),
    "mmr":          ("MMR Dose 1",      "MMR-1"),
    "measles":      ("MMR Dose 1",      "MMR-1"),
    "mr":           ("MMR Dose 1",      "MMR-1"),
    "typhoid":      ("Typhoid",         "TYPHOID"),
    "hep a":        ("Hep A Dose 1",    "HEP-A1"),
    "hepatitis a":  ("Hep A Dose 1",    "HEP-A1"),
    "je":           ("JE Dose 1",       "JE-1"),
    "japanese encephalitis": ("JE Dose 1", "JE-1"),
}

# Date patterns commonly found on Indian vaccination cards
DATE_PATTERNS = [
    r"\b(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})\b",   # 12/03/2023, 12-03-23
    r"\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-,]*(\d{2,4})\b",
    r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-,]*(\d{1,2})[\s\-,]*(\d{2,4})\b",
]

MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5,  "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10,"nov": 11, "dec": 12,
}


# ── Schema ────────────────────────────────────────────────────────────────────

class OCRRequest(BaseModel):
    raw_text: str


# ── POST /ocr-clean ───────────────────────────────────────────────────────────

@router.post("/ocr-clean")
async def clean_ocr(req: OCRRequest):
    """
    Parses raw Tesseract OCR text into structured vaccine records.
    Returns extracted_records (high confidence) + unmatched_lines (needs review).
    """
    lines = [l.strip() for l in req.raw_text.split("\n") if l.strip()]

    extracted_records = []
    unmatched_lines   = []

    for line in lines:
        result = _parse_line(line)
        if result:
            extracted_records.append(result)
        else:
            # Don't discard — might be center name or batch number
            if len(line) > 3:
                unmatched_lines.append(line)

    return {
        "extracted_records": extracted_records,
        "unmatched_lines":   unmatched_lines,
    }


# ── Line parser ───────────────────────────────────────────────────────────────

def _parse_line(line: str) -> dict | None:
    """
    Attempts to extract (vaccine_name, date_given, center_name) from one line.
    Returns None if no vaccine name found with sufficient confidence.
    """
    line_lower = line.lower()

    # Step 1: Fuzzy match vaccine name
    vaccine_name, vaccine_code, confidence = _match_vaccine(line_lower)
    if confidence < 65:
        return None

    # Step 2: Extract date
    date_str = _extract_date(line)

    # Step 3: Extract center name via spaCy ORG entities
    center_name = _extract_center(line)

    return {
        "vaccineName":  vaccine_name,
        "vaccineCode":  vaccine_code,
        "dateGiven":    date_str,
        "centerName":   center_name or "",
        "confidence":   round(confidence / 100, 2),
        "rawLine":      line,
    }


def _match_vaccine(line_lower: str) -> tuple[str, str, float]:
    """
    Returns (standardized_name, code, confidence_0_to_100).
    Uses rapidfuzz partial_ratio for fuzzy matching.
    """
    best_score = 0
    best_name  = ""
    best_code  = ""

    for alias, (std_name, code) in VACCINE_ALIASES.items():
        score = fuzz.partial_ratio(alias, line_lower)
        if score > best_score:
            best_score = score
            best_name  = std_name
            best_code  = code

    # Also try token_sort_ratio for multi-word aliases
    alias_keys = list(VACCINE_ALIASES.keys())
    result     = process.extractOne(line_lower, alias_keys, scorer=fuzz.token_sort_ratio)
    if result and result[1] > best_score:
        best_score = result[1]
        best_name, best_code = VACCINE_ALIASES[result[0]]

    return best_name, best_code, best_score


def _extract_date(line: str) -> str:
    """
    Extracts and normalizes date from line.
    Returns ISO format string "YYYY-MM-DD" or empty string.
    """
    for pattern in DATE_PATTERNS:
        match = re.search(pattern, line, re.IGNORECASE)
        if not match:
            continue
        groups = match.groups()
        try:
            # Pattern 1: DD/MM/YYYY or DD-MM-YY
            if re.match(r"\d", groups[0]):
                day   = int(groups[0])
                month_raw = groups[1]
                year  = int(groups[2])

                if isinstance(month_raw, str) and not month_raw.isdigit():
                    month = MONTH_MAP.get(month_raw[:3].lower(), 0)
                else:
                    month = int(month_raw)

                if year < 100:
                    year += 2000

                dt = datetime(year, month, day)
                return dt.strftime("%Y-%m-%d")

        except (ValueError, TypeError):
            continue

    return ""


def _extract_center(line: str) -> str:
    """
    Uses spaCy NER to extract ORG entities (clinic/hospital names).
    Falls back to keyword matching for PHC/CHC/hospital patterns.
    """
    doc = _nlp(line)
    for ent in doc.ents:
        if ent.label_ in ("ORG", "FAC", "GPE"):
            return ent.text

    # Fallback: regex for common Indian health center patterns
    patterns = [
        r"\b(PHC|CHC|UPHC|DH|SDH)\s+[\w\s]+",
        r"\b[\w\s]*(health cent(?:er|re)|hospital|dispensary|clinic)\b",
    ]
    for p in patterns:
        m = re.search(p, line, re.IGNORECASE)
        if m:
            return m.group(0).strip()

    return ""
