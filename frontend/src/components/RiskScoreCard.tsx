import { useState } from "react";
import { predictRisk, type PredictResponse } from "@/lib/api";
import ExplainPanel from "./ExplainPanel";

interface Child {
    id: string;
    name: string;
    ageMonths: number;
    riskScore: number;
    riskDisease: string;
    modelVersion?: string;
}

interface Props {
    child: Child;
    features: Record<string, any>;
    language: string;
    compact?: boolean;                // true = used inside ChildCard, less padding
}

function RiskRing({ score }: { score: number }) {
    const size = 64;
    const stroke = 5;
    const center = size / 2;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (Math.min(100, score) / 100) * circ;
    const color = score >= 70 ? "#DC2626" : score >= 40 ? "#D97706" : "#16A34A";

    return (
        <svg width={size} height={size} style={{ flexShrink: 0, overflow: "visible" }}>
            {/* Background Circle */}
            <circle cx={center} cy={center} r={r} fill="none"
                stroke="var(--border)" strokeWidth={stroke} />

            {/* Progress Circle - Rotated to start at top */}
            <circle cx={center} cy={center} r={r} fill="none"
                stroke={color} strokeWidth={stroke}
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
            />

            {/* Score Text - Center aligned without rotation */}
            <text
                x={center}
                y={center}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                    fontFamily: "var(--font-sans)", fontSize: "15px",
                    fontWeight: 700, fill: color, letterSpacing: "-0.04em",
                }}
            >
                {Math.round(score)}
            </text>
        </svg>
    );
}

export default function RiskScoreCard({ child, features, language, compact = false }: Props) {
    const [showExplain, setShowExplain] = useState(false);
    const [prediction, setPrediction] = useState<PredictResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const riskLevel = child.riskScore >= 70 ? "HIGH" : child.riskScore >= 40 ? "MEDIUM" : "LOW";
    const riskColor = { HIGH: "var(--risk-high)", MEDIUM: "var(--risk-medium)", LOW: "var(--green)" }[riskLevel];

    async function handleExplain() {
        if (prediction) { setShowExplain(true); return; }
        setLoading(true);
        setError("");
        try {
            // We need a fresh prediction to get the SHAP values for the explain panel
            const data = await predictRisk({
                child_id: child.id,
                age_months: features.age_months || child.ageMonths || 12,
                gender: features.gender ?? 1,
                district: features.district || child.riskDisease || "Pune",
                vax_count: features.vax_count || 0,
                family_history: features.family_history || 0,
                missed_doses: features.missed_doses || 0,
                language: language || "english"
            });
            setPrediction(data);
            setShowExplain(true);
        } catch (e: any) {
            console.error("Explain error:", e);
            setError("Could not load explanation. Try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            {/* Risk score card */}
            <div style={{
                background: riskLevel === "HIGH" ? "#FEF2F2" : riskLevel === "MEDIUM" ? "#FFFBEB" : "var(--green-light)",
                borderRadius: "10px",
                padding: compact ? "0.875rem" : "1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                border: `1px solid ${riskLevel === "HIGH" ? "#FEE2E2" : riskLevel === "MEDIUM" ? "#FEF3C7" : "var(--green-muted)"}`,
            }}>
                <RiskRing score={child.riskScore} />

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{
                            fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em",
                            textTransform: "uppercase", color: riskColor,
                        }}>
                            {riskLevel} RISK
                        </span>
                        {child.modelVersion && (
                            <span className="mono" style={{ fontSize: "0.6875rem", color: "var(--ink-4)" }}>
                                {child.modelVersion}
                            </span>
                        )}
                    </div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--ink)", marginBottom: "2px" }}>
                        {child.riskDisease
                            ? `${child.riskDisease.charAt(0).toUpperCase() + child.riskDisease.slice(1)} risk`
                            : "Vaccination risk"}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>
                        {child.name} · {child.ageMonths} months
                    </p>
                </div>

                <button
                    onClick={handleExplain}
                    disabled={loading}
                    style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        fontSize: "0.75rem", fontWeight: 500,
                        color: "var(--ink-2)", background: "rgba(255,255,255,0.7)",
                        border: "1px solid rgba(0,0,0,0.08)", borderRadius: "7px",
                        padding: "6px 10px", cursor: "pointer", flexShrink: 0,
                        fontFamily: "var(--font-sans)",
                        transition: "all 0.12s",
                    }}
                    className="hover:bg-white hover:border-std"
                >
                    {loading ? <div className="spinner" style={{ width: "12px", height: "12px", borderWidth: "1.5px" }} /> : (
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.25" />
                            <path d="M6.5 6v3M6.5 4.5v-.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                        </svg>
                    )}
                    Explain
                </button>
            </div>

            {error && (
                <p style={{ fontSize: "0.75rem", color: "var(--risk-high)", marginTop: "6px", textAlign: "center" }}>{error}</p>
            )}

            {/* Explanation Modal */}
            {showExplain && prediction && (
                <div style={{
                    position: "fixed", inset: 0, zIndex: 999,
                    background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem"
                }} onClick={() => setShowExplain(false)}>
                    <div style={{ width: "100%", maxWidth: "520px" }} onClick={e => e.stopPropagation()}>
                        <ExplainPanel
                            childName={child.name}
                            riskScore={prediction.risk_score}
                            shapValues={prediction.shap_values}
                            features={features}
                            language={language}
                            onClose={() => setShowExplain(false)}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
