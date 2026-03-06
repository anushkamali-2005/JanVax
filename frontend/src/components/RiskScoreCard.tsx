"use client";
// frontend/components/RiskScoreCard.tsx
// Most important UI component — shows risk score, explains it on demand.

import { useState } from "react";
import { explainRisk, type ExplainResponse } from "@/lib/api";
import SHAPChart from "@/components/SHAPChart";

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
    language: string;
    compact?: boolean;                // true = used inside ChildCard, less padding
}

function RiskRing({ score }: { score: number }) {
    const size = 64;
    const stroke = 5;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (score / 100) * circ;
    const color = score >= 70 ? "#DC2626" : score >= 40 ? "#D97706" : "#16A34A";

    return (
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke="var(--border)" strokeWidth={stroke} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={color} strokeWidth={stroke}
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
            />
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
                style={{
                    transform: "rotate(90deg)", transformOrigin: "50% 50%",
                    fontFamily: "var(--font-sans)", fontSize: "14px",
                    fontWeight: 600, fill: color, letterSpacing: "-0.04em",
                }}
            >
                {score}
            </text>
        </svg>
    );
}

export default function RiskScoreCard({ child, language, compact = false }: Props) {
    const [showExplain, setShowExplain] = useState(false);
    const [explain, setExplain] = useState<ExplainResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const riskLevel = child.riskScore >= 70 ? "HIGH" : child.riskScore >= 40 ? "MEDIUM" : "LOW";
    const riskColor = { HIGH: "var(--risk-high)", MEDIUM: "var(--risk-medium)", LOW: "var(--green)" }[riskLevel];

    async function handleExplain() {
        if (explain) { setShowExplain(true); return; }
        setLoading(true);
        setError("");
        try {
            // For demo, we might not always have a predictionId if model never ran.
            // But in JanVax, every child on dashboard has a latest prediction.
            const data = await explainRisk(0, child.id, language);
            setExplain(data);
            setShowExplain(true);
        } catch (e: any) {
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

            {/* Explanation modal */}
            {showExplain && explain && (
                <div style={{
                    position: "fixed", inset: 0, zIndex: 200,
                    background: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
                }}
                    onClick={(e) => e.target === e.currentTarget && setShowExplain(false)}
                >
                    <div className="card fade-up" style={{
                        width: "100%", maxWidth: "520px",
                        maxHeight: "85dvh", overflowY: "auto",
                        padding: "1.75rem",
                    }}>
                        {/* Modal header */}
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                            <div>
                                <p className="label" style={{ marginBottom: "4px" }}>AI Explanation</p>
                                <h3 style={{ fontWeight: 600, fontSize: "1.0625rem", letterSpacing: "-0.02em" }}>
                                    Why is {child.name} at {riskLevel.toLowerCase()} risk?
                                </h3>
                            </div>
                            <button onClick={() => setShowExplain(false)} className="btn-ghost" style={{ padding: "8px" }}>✕</button>
                        </div>

                        {/* SHAP chart */}
                        <div style={{ marginBottom: "1.5rem" }}>
                            <p className="label" style={{ marginBottom: "10px" }}>Feature contributions</p>
                            <SHAPChart shapValues={explain.shap_values} />
                        </div>

                        <hr className="divider" style={{ margin: "1.25rem 0" }} />

                        {/* Counterfactuals */}
                        {explain.counterfactuals.length > 0 && (
                            <div style={{ marginBottom: "1.5rem" }}>
                                <p className="label" style={{ marginBottom: "10px" }}>What would reduce the risk</p>
                                {explain.counterfactuals.map((cf, i) => (
                                    <div key={i} style={{
                                        display: "flex", alignItems: "center", justifyContent: "space-between",
                                        padding: "10px 12px", background: "var(--surface)",
                                        borderRadius: "8px", marginBottom: "6px",
                                    }}>
                                        <p style={{ fontSize: "0.875rem", color: "var(--ink-2)", flex: 1, marginRight: "1rem" }}>
                                            {cf.change_description}
                                        </p>
                                        <div style={{
                                            display: "flex", alignItems: "center", gap: "6px",
                                            background: "var(--green-muted)", padding: "4px 10px", borderRadius: "100px", flexShrink: 0,
                                        }}>
                                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                                <path d="M5 8V2M2 5l3-3 3 3" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" />
                                            </svg>
                                            <span className="mono" style={{ fontSize: "0.75rem", color: "var(--green)", fontWeight: 500 }}>
                                                {cf.new_score}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <hr className="divider" style={{ margin: "1.25rem 0" }} />

                        {/* NL explanation */}
                        <div>
                            <p className="label" style={{ marginBottom: "10px" }}>
                                AI summary {language !== "en" && `· ${language.toUpperCase()}`}
                            </p>
                            <p style={{
                                fontSize: "0.9375rem", color: "var(--ink-2)", lineHeight: 1.75,
                                background: "var(--surface)", borderRadius: "8px", padding: "14px 16px",
                            }}>
                                {explain.nl_explanation}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <p style={{ fontSize: "0.75rem", color: "var(--risk-high)", marginTop: "6px" }}>{error}</p>
            )}
        </>
    );
}
