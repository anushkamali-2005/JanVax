// frontend/src/lib/api.ts
// --------------------
// All FastAPI backend endpoint callers.
// Every function fetches the ID token and passes it as Bearer.
// CRITICAL: Never call fetch() directly in components — always use these functions.
// CRITICAL: All functions throw on non-2xx — catch in components.

import { getIdToken } from "./firebase";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Base fetcher ──────────────────────────────────────────────────────────────

async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
    requireAuth = true
): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
    };

    if (requireAuth) {
        try {
            const token = await getIdToken();
            headers["Authorization"] = `Bearer ${token}`;
        } catch (e) {
            console.warn("API Call without Auth: ", path);
        }
    }

    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `API error ${res.status}`);
    }

    return res.json();
}

// ── ML / Predictions ──────────────────────────────────────────────────────────

export interface PredictRequest {
    child_id: string;
    age_months: number;
    gender: number; // 0=female, 1=male
    district: string;
    vax_count: number;
    family_history?: number;
    missed_doses?: number;
    language?: string;
}

export interface PredictResponse {
    child_id: string;
    model_version: string;
    shap_values: Record<string, number>;
    risk_score: number;
    high_risk: boolean;
    who_flag_active: boolean;
    blockchain_hash: string;
}

export async function predictRisk(req: PredictRequest): Promise<PredictResponse> {
    return apiFetch<PredictResponse>("/predict", {
        method: "POST",
        body: JSON.stringify(req),
    });
}

export interface ExplainResponse {
    risk_score: number;
    shap_features: Array<{ feature: string; contribution: number; direction: string }>;
    counterfactuals: Array<{ scenario: number; new_score: number; action: string }>;
    explanation: string;
    nl_explanation: string;
    language: string;
}

export async function explainRisk(
    predictionId: number,
    childId: string,
    language = "en"
): Promise<ExplainResponse> {
    return apiFetch<ExplainResponse>("/explain", {
        method: "POST",
        body: JSON.stringify({ prediction_id: predictionId, child_id: childId, language }),
    });
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export interface AgentTriggerResponse {
    decision: "ALERT_FAMILY" | "ESCALATE_TO_DOCTOR" | "MONITOR";
    actions_taken: Record<string, any>;
    debate_log: Array<{ role: string; content: string; ts: string }>;
    agent_decision_id: number;
    record_hash: string;
}

export async function triggerAgent(
    childId: string,
    predictionId: number,
    riskScore: number,
    topDisease: string,
    parentUid: string
): Promise<AgentTriggerResponse> {
    return apiFetch<AgentTriggerResponse>("/agent/trigger", {
        method: "POST",
        body: JSON.stringify({
            child_id: childId,
            prediction_id: predictionId,
            risk_score: riskScore,
            top_disease: topDisease,
            parent_uid: parentUid,
        }),
    });
}

export async function getAgentDecisions(childId: string): Promise<{ decisions: any[] }> {
    return apiFetch(`/agent/decisions/${childId}`);
}

// ── Blockchain Verify ─────────────────────────────────────────────────────────

export interface VerifyResponse {
    is_valid: boolean;
    hash: string;
    polygon_tx_id: string;
    entity_type: string;
    entity_id: string;
    stored_at: string;
}

export interface ChildVerifyResponse {
    total: number;
    records: Array<{
        vaccineName: string;
        dateGiven: string;
        centerName: string;
        isVerified: boolean;
    }>;
}

export async function verifyHash(hash: string): Promise<VerifyResponse> {
    // Public endpoint — no auth
    return apiFetch<VerifyResponse>(`/verify/${hash}`, {}, false);
}

export async function verifyChildRecords(childId: string): Promise<ChildVerifyResponse> {
    return apiFetch<ChildVerifyResponse>(`/verify/child/${childId}`, {}, false);
}

export async function storeHash(
    recordJson: object,
    entityType: string,
    entityId: string
): Promise<{ hash: string; polygon_tx_id: string }> {
    return apiFetch("/verify/hash", {
        method: "POST",
        body: JSON.stringify({ record_json: recordJson, entity_type: entityType, entity_id: entityId }),
    });
}

// ── OCR ───────────────────────────────────────────────────────────────────────

export interface OCRResponse {
    extracted_records: Array<{
        vaccineName: string;
        vaccineCode: string;
        dateGiven: string;
        centerName: string;
        confidence: number;
        rawLine: string;
    }>;
    unmatched_lines: string[];
}

export async function cleanOCRText(rawText: string): Promise<OCRResponse> {
    return apiFetch<OCRResponse>("/ocr-clean", {
        method: "POST",
        body: JSON.stringify({ raw_text: rawText }),
    });
}

// ── Community ─────────────────────────────────────────────────────────────────

export interface DistrictCoverage {
    district: string;
    state: string;
    totalChildren: number;
    mmrCoverage: number;
    polioOPV: number;
    bcgCoverage: number;
    dptCoverage: number;
    herdRisk: boolean;
}

export async function getCommunityStats(): Promise<{ districts: DistrictCoverage[] }> {
    return apiFetch("/community/coverage", {}, false);
}

// ── Stats / MLOps ─────────────────────────────────────────────────────────────

export interface ModelStats {
    model_version: string;
    training_accuracy: number;
    validation_accuracy: number;
    training_records: number;
    last_trained: string;
    drift_detected: boolean;
}

export async function getModelStats(): Promise<ModelStats> {
    return apiFetch<ModelStats>("/stats");
}

export async function triggerReminders(): Promise<any> {
    return apiFetch("/reminders/trigger", { method: "POST" });
}

export async function getReminderStatus(): Promise<any> {
    return apiFetch("/reminders/status");
}
