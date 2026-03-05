/**
 * frontend/src/lib/api.ts
 * ------------------------
 * Typed API client for the VaxGuard FastAPI backend.
 * All calls include Firebase Bearer token from the auth state.
 *
 * CRITICAL: getIdToken() must be called fresh each time — tokens expire after 1 hour.
 * CRITICAL: BASE_URL reads from NEXT_PUBLIC_API_URL env var, falls back to localhost.
 */

import { auth } from "@/lib/firebase";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Helper: get fresh Firebase JWT ───────────────────────────────────────────

async function getAuthHeader(): Promise<Record<string, string>> {
    const user = auth.currentUser;
    if (!user) return {};
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
}

async function apiPost<T>(path: string, body: object): Promise<T> {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `API error ${res.status}`);
    }
    return res.json();
}

async function apiGet<T>(path: string, authRequired = true): Promise<T> {
    const authHeader = authRequired ? await getAuthHeader() : {};
    const res = await fetch(`${BASE_URL}${path}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", ...authHeader },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `API error ${res.status}`);
    }
    return res.json();
}


// ── Types ─────────────────────────────────────────────────────────────────────

export interface PredictRequest {
    child_id: string;
    age_months: number;
    gender: string;
    vaccines_missed_count: number;
    days_overdue: number;
    district_outbreak_flag: number;
    sibling_history: number;
    top_missed_vaccine: string;
}

export interface PredictResponse {
    child_id: string;
    model_version: string;
    risk_scores: Record<string, number>;
    top_disease: string;
    top_score: number;
    risk_level: "LOW" | "MEDIUM" | "HIGH";
    record_hash: string;
}

export interface ExplainResponse {
    shap_values: Record<string, number>;
    counterfactuals: Array<{
        change_description: string;
        new_score: number;
        feature_changes: Record<string, number>;
    }>;
    nl_explanation: string;
    nl_explanation_en: string;
}

export interface AgentTriggerResponse {
    decision: string;
    actions_taken: Record<string, unknown>;
    debate_log: Array<{ node: string; output: string }>;
    agent_decision_id: number;
    record_hash: string;
}

export interface VerifyResponse {
    is_valid: boolean;
    hash: string;
    polygon_tx_id: string;
    entity_type: string;
    entity_id: string;
    stored_at: string;
}

export interface ChildVerifyResponse {
    child_id: string;
    total: number;
    records: Array<{
        id: string;
        vaccineName: string;
        dateGiven: string;
        centerName: string;
        polygonHash: string;
        isVerified: boolean;
    }>;
}

export interface CommunityStats {
    districts: Array<{
        district: string;
        totalChildren: number;
        mmrCoverage: number;
        polioOPV: number;
        bcgCoverage: number;
        dptCoverage: number;
        herdRisk: boolean;
        state: string;
    }>;
}

export interface ModelStats {
    model_version: string;
    training_accuracy: number;
    validation_accuracy: number;
    training_records: number;
    last_trained: string;
    drift_detected: boolean;
}

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


// ── API Functions ─────────────────────────────────────────────────────────────

export const predictRisk = (req: PredictRequest) =>
    apiPost<PredictResponse>("/predict", req);

export const explainRisk = (prediction_id: number, child_id: string, language = "en") =>
    apiPost<ExplainResponse>("/explain", { prediction_id, child_id, language });

export const triggerAgent = (req: {
    child_id: string;
    prediction_id: number;
    risk_score: number;
    top_disease: string;
    parent_uid: string;
}) => apiPost<AgentTriggerResponse>("/agent/trigger", req);

export const getAgentDecisions = (child_id: string) =>
    apiGet<{ decisions: AgentTriggerResponse[] }>(`/agent/decisions/${child_id}`);

export const verifyHash = (hash: string) =>
    apiGet<VerifyResponse>(`/verify/${hash}`, false); // public endpoint

export const verifyChildRecords = (child_id: string) =>
    apiGet<ChildVerifyResponse>(`/verify/child/${child_id}`, false); // public endpoint

export const getCommunityStats = () =>
    apiGet<CommunityStats>("/community/coverage", false);

export const getModelStats = () =>
    apiGet<ModelStats>("/stats");

export const cleanOCR = (raw_text: string) =>
    apiPost<OCRResponse>("/ocr-clean", { raw_text });

export const triggerReminders = () =>
    apiPost<{ status: string }>("/reminders/trigger-daily", {});

export const getReminderStatus = () =>
    apiGet<{ scheduler_running: boolean; jobs: Array<{ id: string; next_run: string }> }>("/reminders/status");
