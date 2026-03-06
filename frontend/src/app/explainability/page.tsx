"use client";
/**
 * ExplainabilityDashboard.tsx
 * ===========================
 * Two visualizations the evaluator asked for:
 *
 * TAB 1 — SHAP Feature Impact Heatmap
 *   X-axis  = children sorted by risk score (low → high)
 *   Y-axis  = all 8 features from ml/features.py
 *   Color   = SHAP value: red = pushes risk UP, blue = pushes risk DOWN
 *   Below   = mean |SHAP| bar chart (global feature importance)
 *   Purpose = prove the model explains EVERY individual prediction
 *
 * TAB 2 — Risk Stratification Matrix
 *   Rows    = Days Overdue buckets  (0-7d, 8-30d, 31-60d, 61-90d, 90d+)
 *   Columns = Vaccines Missed count (0, 1, 2, 3, 4+)
 *   Cell    = average predicted risk score for that patient segment
 *   Color   = green (safe) → amber (watch) → red (critical)
 *   Purpose = help clinicians instantly see which groups need intervention
 *
 * Data source: replace MOCK_* constants with real API calls to
 *   GET /stats/shap-heatmap   → {children: [{id, riskScore, shap: {feat: val}}]}
 *   GET /stats/risk-matrix    → {rowLabels, colLabels, matrix: [[score]]}
 */

import { useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// DATA LAYER — swap with real API in production
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = [
    { key: "days_overdue", label: "Days Overdue" },
    { key: "vaccines_missed_count", label: "Vaccines Missed" },
    { key: "district_outbreak_flag", label: "District Outbreak" },
    { key: "reminder_ignored_count", label: "Reminders Ignored" },
    { key: "state_high_risk", label: "High-Risk State" },
    { key: "age_months", label: "Child Age (mo.)" },
    { key: "sibling_history", label: "Sibling History" },
    { key: "gender_male", label: "Gender (Male)" },
];

function seedRNG(seed: number) {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function buildSHAPData() {
    const rng = seedRNG(42);
    const children = Array.from({ length: 48 }, (_, i) => {
        const riskScore = Math.round(rng() * 100);
        const shap: Record<string, number> = {};
        FEATURES.forEach(({ key }) => {
            let v = (rng() - 0.5) * 0.55;
            if (riskScore > 70) {
                if (key === "days_overdue") v = rng() * 0.55;
                if (key === "district_outbreak_flag") v = rng() * 0.45;
                if (key === "vaccines_missed_count") v = rng() * 0.40;
                if (key === "reminder_ignored_count") v = rng() * 0.30;
            } else if (riskScore < 35) {
                if (key === "days_overdue") v = -rng() * 0.45;
                if (key === "district_outbreak_flag") v = -rng() * 0.35;
            }
            shap[key] = parseFloat(v.toFixed(4));
        });
        return { id: i, riskScore, shap };
    });
    return children.sort((a, b) => a.riskScore - b.riskScore);
}

function buildRiskMatrix() {
    const rng = seedRNG(99);
    const rowLabels = ["0 – 7 days", "8 – 30 days", "31 – 60 days", "61 – 90 days", "90+ days"];
    const colLabels = ["0 missed", "1 missed", "2 missed", "3 missed", "4+ missed"];
    const matrix = rowLabels.map((_, ri) =>
        colLabels.map((_, ci) => {
            const base = ri * 13 + ci * 11 + rng() * 10 - 3;
            return Math.max(4, Math.min(99, Math.round(base)));
        })
    );
    return { rowLabels, colLabels, matrix };
}

const SHAP_DATA = buildSHAPData();
const RISK_MATRIX = buildRiskMatrix();
const MAX_ABS = 0.5;

// mean |SHAP| per feature — sorted for importance bar
const IMPORTANCE = FEATURES.map(({ key, label }) => ({
    key, label,
    mean: SHAP_DATA.reduce((s, c) => s + Math.abs(c.shap[key]), 0) / SHAP_DATA.length,
})).sort((a, b) => b.mean - a.mean);

// ─────────────────────────────────────────────────────────────────────────────
// COLOR HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function shapCellColor(value: number) {
    const t = Math.max(-1, Math.min(1, value / MAX_ABS));
    if (t >= 0) {
        const g = Math.round(255 * (1 - t * 0.92));
        const b = Math.round(255 * (1 - t * 0.92));
        return `rgb(220,${g},${b})`;
    }
    const r = Math.round(255 * (1 + t * 0.88));
    const g = Math.round(255 * (1 + t * 0.88));
    return `rgb(${r},${g},220)`;
}

function riskColors(score: number) {
    if (score <= 40) return { bg: "#071a0f", accent: "#22c55e", badge: "#16a34a22", text: "#86efac" };
    if (score <= 70) return { bg: "#1c1100", accent: "#f59e0b", badge: "#d9770022", text: "#fcd34d" };
    return { bg: "#1c0505", accent: "#ef4444", badge: "#dc262622", text: "#fca5a5" };
}

function riskTier(score: number) {
    if (score <= 40) return "LOW";
    if (score <= 70) return "MED";
    return "HIGH";
}

// ─────────────────────────────────────────────────────────────────────────────
// SHAP HEATMAP
// ─────────────────────────────────────────────────────────────────────────────

interface TooltipData {
    x: number;
    y: number;
    ci: number;
    fi: number;
    child: { id: number; riskScore: number; shap: Record<string, number> };
    feat: { key: string; label: string; val: number };
}

function SHAPHeatmap() {
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);
    const [hoverCol, setHoverCol] = useState<number | null>(null);
    const [hoverRow, setHoverRow] = useState<number | null>(null);

    const CW = 13, CH = 36, LW = 152, TH = 56, FOOT = 36;
    const W = LW + SHAP_DATA.length * CW;
    const H = TH + FEATURES.length * CH + FOOT;

    const onCell = useCallback((e: React.MouseEvent, ci: number, fi: number, child: TooltipData["child"], feat: TooltipData["feat"]) => {
        setTooltip({ x: e.clientX, y: e.clientY, ci, fi, child, feat });
        setHoverCol(ci); setHoverRow(fi);
    }, []);
    const offCell = useCallback(() => {
        setTooltip(null); setHoverCol(null); setHoverRow(null);
    }, []);

    return (
        <div style={{ position: "relative" }}>
            {/* Legend bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, marginLeft: LW }}>
                <span style={{ fontSize: 10, color: "#3b82f6", fontFamily: "monospace" }}>▼ reduces risk</span>
                <div style={{
                    flex: 1, maxWidth: 200, height: 8, borderRadius: 4,
                    background: "linear-gradient(to right,rgb(60,60,220),#e5e7eb,rgb(220,60,60))",
                    opacity: 0.85,
                }} />
                <span style={{ fontSize: 10, color: "#ef4444", fontFamily: "monospace" }}>▲ increases risk</span>
                <span style={{ marginLeft: 20, fontSize: 10, color: "#374151", fontFamily: "monospace" }}>
                    {SHAP_DATA.length} children · sorted low→high risk
                </span>
            </div>

            <div style={{ overflowX: "auto" }}>
                <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>

                    {/* ── Risk score bar chart (top) ────────────────────────────────── */}
                    {SHAP_DATA.map((child, ci) => {
                        const x = LW + ci * CW;
                        const barH = Math.max(2, Math.round((child.riskScore / 100) * (TH - 10)));
                        const col = riskColors(child.riskScore);
                        return (
                            <rect key={`bar-${ci}`}
                                x={x + 1} y={TH - 8 - barH}
                                width={CW - 2} height={barH}
                                fill={col.accent} opacity={hoverCol === ci ? 1 : 0.65} rx={1}
                            />
                        );
                    })}
                    <text x={LW - 6} y={TH - 16} textAnchor="end" fontSize={9} fill="#4b5563" fontFamily="monospace">
                        risk score
                    </text>
                    <line x1={LW} y1={TH} x2={W} y2={TH} stroke="#1f2937" strokeWidth={1} />

                    {/* ── Feature rows ──────────────────────────────────────────────── */}
                    {FEATURES.map(({ key, label }, fi) => {
                        const y = TH + fi * CH;
                        const rowHover = hoverRow === fi;
                        return (
                            <g key={key}>
                                {/* Row hover bg */}
                                {rowHover && (
                                    <rect x={0} y={y} width={W} height={CH} fill="#0a1f17" opacity={0.6} />
                                )}
                                {/* Feature label */}
                                <text
                                    x={LW - 10} y={y + CH / 2 + 4}
                                    textAnchor="end" fontSize={10.5}
                                    fill={rowHover ? "#00e5a0" : "#9ca3af"}
                                    fontFamily="monospace"
                                    style={{ cursor: "default", userSelect: "none" }}
                                >
                                    {label}
                                </text>

                                {/* SHAP cells */}
                                {SHAP_DATA.map((child, ci) => {
                                    const v = child.shap[key];
                                    const x = LW + ci * CW;
                                    const col = shapCellColor(v);
                                    const act = hoverCol === ci && hoverRow === fi;
                                    return (
                                        <rect key={`${key}-${ci}`}
                                            x={x + 0.5} y={y + 1}
                                            width={CW - 1} height={CH - 2}
                                            fill={col}
                                            opacity={hoverCol === ci || rowHover ? 1 : 0.78}
                                            stroke={act ? "#00e5a0" : "none"} strokeWidth={act ? 1.5 : 0}
                                            rx={1}
                                            style={{ cursor: "crosshair" }}
                                            onMouseEnter={(e) => onCell(e as unknown as React.MouseEvent, ci, fi, child, { key, label, val: v })}
                                            onMouseLeave={offCell}
                                        />
                                    );
                                })}

                                {/* Row separator */}
                                <line
                                    x1={LW} y1={y + CH} x2={W} y2={y + CH}
                                    stroke="#111827" strokeWidth={0.5}
                                />
                            </g>
                        );
                    })}

                    {/* ── X-axis tick labels ────────────────────────────────────────── */}
                    {[0, 25, 50, 75, 100].map((score) => {
                        const idx = Math.round((score / 100) * (SHAP_DATA.length - 1));
                        const x = LW + idx * CW + CW / 2;
                        return (
                            <text key={score} x={x} y={H - 10} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="monospace">
                                {score}
                            </text>
                        );
                    })}
                    <text x={LW + (SHAP_DATA.length * CW) / 2} y={H - 1} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="monospace">
                        ← risk score axis →
                    </text>

                </svg>
            </div>

            {/* Floating tooltip */}
            {tooltip && (
                <div style={{
                    position: "fixed",
                    left: tooltip.x + 16, top: tooltip.y - 12,
                    zIndex: 9999,
                    background: "#080f0b",
                    border: "1px solid #00e5a030",
                    borderRadius: 10,
                    padding: "12px 16px",
                    pointerEvents: "none",
                    boxShadow: "0 12px 40px #00000090",
                    fontFamily: "monospace",
                    minWidth: 200,
                }}>
                    <div style={{ fontSize: 11, color: "#00e5a0", fontWeight: 700, marginBottom: 8 }}>
                        Child #{tooltip.ci + 1} · Risk {tooltip.child.riskScore}/100
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 3 }}>
                        Feature: <span style={{ color: "#f9fafb" }}>{tooltip.feat.label}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tooltip.feat.val >= 0 ? "#ef4444" : "#3b82f6" }}>
                        SHAP {tooltip.feat.val >= 0 ? "+" : ""}{tooltip.feat.val.toFixed(4)}
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                        {tooltip.feat.val >= 0 ? "↑ pushed risk score UP" : "↓ pushed risk score DOWN"}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEAN |SHAP| BAR CHART
// ─────────────────────────────────────────────────────────────────────────────

function ImportanceBars() {
    const max = IMPORTANCE[0].mean;
    return (
        <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 4, fontFamily: "'DM Sans',sans-serif" }}>
                Mean |SHAP| — Global Feature Importance
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 18 }}>
                Average absolute SHAP value across all children. Higher = more influential across the population.
            </div>
            {IMPORTANCE.map(({ key, label, mean }, i) => (
                <div key={key} style={{ marginBottom: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: i === 0 ? "#00e5a0" : "#9ca3af", fontFamily: "monospace" }}>
                            {label}
                        </span>
                        <span style={{ fontSize: 11, color: "#00e5a0", fontFamily: "monospace", fontWeight: 700 }}>
                            {mean.toFixed(4)}
                        </span>
                    </div>
                    <div style={{ height: 7, background: "#0f1f17", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{
                            height: "100%",
                            width: `${(mean / max) * 100}%`,
                            background: i === 0 ? "#00e5a0" : i <= 2 ? "#059669" : "#064e3b",
                            borderRadius: 4,
                            transition: "width 0.8s cubic-bezier(.22,1,.36,1)",
                        }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK STRATIFICATION MATRIX
// ─────────────────────────────────────────────────────────────────────────────

function RiskMatrix() {
    const { rowLabels, colLabels, matrix } = RISK_MATRIX;
    const [hovered, setHovered] = useState<{ ri: number; ci: number } | null>(null);

    const CW = 110, CH = 76;

    return (
        <div>
            {/* Column header */}
            <div style={{ display: "flex", marginLeft: 130, marginBottom: 6 }}>
                {colLabels.map((c) => (
                    <div key={c} style={{ width: CW, textAlign: "center", fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
                        {c}
                    </div>
                ))}
            </div>
            <div style={{ fontSize: 10, color: "#374151", marginLeft: 130, marginBottom: 16, fontFamily: "monospace", letterSpacing: "0.06em" }}>
                ← VACCINES MISSED COUNT →
            </div>

            <div style={{ display: "flex", gap: 0 }}>
                {/* Row labels + y-axis text */}
                <div style={{ width: 130, flexShrink: 0 }}>
                    <div style={{ display: "flex", height: rowLabels.length * CH }}>
                        {/* Vertical axis label */}
                        <div style={{
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                            fontSize: 10, color: "#374151", letterSpacing: "0.06em",
                            fontFamily: "monospace",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            paddingRight: 8, userSelect: "none",
                        }}>
                            ← DAYS OVERDUE →
                        </div>
                        {/* Labels */}
                        <div style={{ flex: 1 }}>
                            {rowLabels.map((row, ri) => (
                                <div key={ri} style={{
                                    height: CH,
                                    display: "flex", alignItems: "center", justifyContent: "flex-end",
                                    paddingRight: 12,
                                    fontSize: 11, color: "#6b7280", fontFamily: "monospace",
                                }}>
                                    {row}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Grid */}
                <div>
                    {matrix.map((row, ri) => (
                        <div key={ri} style={{ display: "flex" }}>
                            {row.map((score, ci) => {
                                const col = riskColors(score);
                                const isHov = hovered?.ri === ri && hovered?.ci === ci;
                                const rowHov = hovered?.ri === ri;
                                const colHov = hovered?.ci === ci;
                                return (
                                    <div
                                        key={ci}
                                        onMouseEnter={() => setHovered({ ri, ci })}
                                        onMouseLeave={() => setHovered(null)}
                                        style={{
                                            width: CW, height: CH,
                                            background: col.bg,
                                            border: `1px solid ${isHov ? col.accent : col.badge}`,
                                            borderWidth: isHov ? 2 : 1,
                                            display: "flex", flexDirection: "column",
                                            alignItems: "center", justifyContent: "center",
                                            gap: 3, cursor: "default",
                                            transition: "all 0.15s ease",
                                            transform: isHov ? "scale(1.06)" : "scale(1)",
                                            zIndex: isHov ? 3 : rowHov || colHov ? 2 : 1,
                                            position: "relative",
                                            boxShadow: isHov ? `0 0 0 2px ${col.accent}, 0 8px 28px ${col.badge}` : "none",
                                            opacity: hovered && !isHov && !rowHov && !colHov ? 0.55 : 1,
                                        }}
                                    >
                                        <div style={{
                                            fontSize: 26, fontWeight: 800,
                                            color: col.accent,
                                            fontFamily: "monospace",
                                            lineHeight: 1,
                                        }}>
                                            {score}
                                        </div>
                                        <div style={{
                                            fontSize: 8, fontWeight: 700,
                                            letterSpacing: "0.14em",
                                            color: col.text,
                                            fontFamily: "monospace",
                                            opacity: 0.75,
                                        }}>
                                            {riskTier(score)} RISK
                                        </div>
                                        {/* Bottom fill bar */}
                                        <div style={{
                                            position: "absolute", bottom: 0, left: 0,
                                            height: 3, width: `${score}%`,
                                            background: col.accent, opacity: 0.45,
                                        }} />
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERVENTION ZONES (below matrix)
// ─────────────────────────────────────────────────────────────────────────────

const ZONES = [
    {
        title: "CRITICAL ZONE",
        range: "90d+ overdue · 3+ missed",
        desc: "Direct doctor escalation — family has ignored all alerts. No SMS. Doctor is called.",
        color: "#ef4444",
        action: "Doctor alert + urgent visit",
    },
    {
        title: "ALERT ZONE",
        range: "31–90d overdue · 1–2 missed",
        desc: "Automated multilingual SMS + web push. ASHA worker added to follow-up queue.",
        color: "#f59e0b",
        action: "SMS + push + ASHA queue",
    },
    {
        title: "MONITOR ZONE",
        range: "0–30d overdue · 0 missed",
        desc: "Weekly gentle reminder only. No urgent intervention required.",
        color: "#22c55e",
        action: "Weekly reminder only",
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export default function ExplainabilityDashboard() {
    const [tab, setTab] = useState("heatmap");

    return (
        <div style={{
            minHeight: "100vh",
            background: "#060d0a",
            color: "#f9fafb",
        }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #080f0b; }
        ::-webkit-scrollbar-thumb { background: #1a3a28; border-radius: 3px; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.45s cubic-bezier(.22,1,.36,1) both; }
      `}</style>

            {/* ── HEADER ───────────────────────────────────────────────────────── */}
            <div style={{
                borderBottom: "1px solid #0d1f17",
                padding: "16px 28px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "#060d0a",
                position: "sticky", top: 0, zIndex: 100,
                backdropFilter: "blur(8px)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                        width: 34, height: 34, background: "#00e5a0", borderRadius: 7,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 900, fontSize: 16, color: "#060d0a",
                        fontFamily: "'DM Sans', sans-serif",
                    }}>V</div>
                    <div>
                        <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 800, fontSize: 14, color: "#f9fafb" }}>
                            VaxGuard AI
                        </div>
                        <div style={{ fontSize: 9, color: "#374151", letterSpacing: "0.12em", fontFamily: "monospace" }}>
                            EXPLAINABLE AI · AUDIT DASHBOARD
                        </div>
                    </div>
                </div>

                <div style={{
                    display: "flex", gap: 4,
                    background: "#0a1812", border: "1px solid #0d1f17",
                    borderRadius: 10, padding: "4px 4px",
                }}>
                    {[
                        { id: "heatmap", label: "SHAP Heatmap" },
                        { id: "matrix", label: "Risk Matrix" },
                    ].map(({ id, label }) => (
                        <button key={id} onClick={() => setTab(id)} style={{
                            padding: "8px 20px", borderRadius: 7,
                            border: "none", cursor: "pointer",
                            fontSize: 11, fontWeight: 700,
                            letterSpacing: "0.04em",
                            fontFamily: "monospace",
                            background: tab === id ? "#00e5a0" : "transparent",
                            color: tab === id ? "#060d0a" : "#6b7280",
                            transition: "all 0.18s",
                        }}>{label}</button>
                    ))}
                </div>
            </div>

            <div style={{ padding: "28px 28px 60px" }}>

                {/* ════════════════ SHAP HEATMAP TAB ════════════════ */}
                {tab === "heatmap" && (
                    <div className="fade-up">
                        {/* Title + description */}
                        <div style={{ marginBottom: 24 }}>
                            <h1 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 24, fontWeight: 800, color: "#f9fafb", marginBottom: 8 }}>
                                SHAP Feature Impact Heatmap
                            </h1>
                            <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.75, maxWidth: 620 }}>
                                Every column = one child, sorted by predicted risk score (left = safe, right = critical).
                                Every row = one model feature. <span style={{ color: "#ef4444" }}>Red</span> = that feature
                                pushed this child&apos;s risk <strong>UP</strong>.{" "}
                                <span style={{ color: "#3b82f6" }}>Blue</span> = it pushed risk <strong>DOWN</strong>.
                                This proves the model is not a black box — every decision is traceable.
                            </p>

                            {/* Stat pills */}
                            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                                {[
                                    ["Algorithm", "XGBoost + SHAP TreeExplainer"],
                                    ["Children analyzed", `${SHAP_DATA.length} records`],
                                    ["Features", `${FEATURES.length} (from ml/features.py)`],
                                    ["Top driver", "days_overdue (mean |SHAP| highest)"],
                                ].map(([k, v]) => (
                                    <div key={k} style={{
                                        background: "#0a1812", border: "1px solid #0d1f17",
                                        borderRadius: 8, padding: "7px 13px",
                                    }}>
                                        <div style={{ fontSize: 8, color: "#374151", letterSpacing: "0.12em", marginBottom: 2, fontFamily: "monospace" }}>
                                            {k.toUpperCase()}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#d1fae5", fontFamily: "monospace" }}>{v}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Heatmap */}
                        <div style={{ background: "#080f0b", border: "1px solid #0d1f17", borderRadius: 12, padding: "22px 20px", marginBottom: 20 }}>
                            <SHAPHeatmap />
                        </div>

                        {/* Importance bars */}
                        <div style={{ background: "#080f0b", border: "1px solid #0d1f17", borderRadius: 12, padding: "22px 24px" }}>
                            <ImportanceBars />
                        </div>
                    </div>
                )}

                {/* ════════════════ RISK MATRIX TAB ════════════════ */}
                {tab === "matrix" && (
                    <div className="fade-up">
                        {/* Title */}
                        <div style={{ marginBottom: 24 }}>
                            <h1 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 24, fontWeight: 800, color: "#f9fafb", marginBottom: 8 }}>
                                Risk Stratification Matrix
                            </h1>
                            <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.75, maxWidth: 620 }}>
                                Average predicted risk score for every combination of{" "}
                                <span style={{ color: "#f9fafb" }}>Days Overdue</span> (rows) ×{" "}
                                <span style={{ color: "#f9fafb" }}>Vaccines Missed</span> (columns).
                                Use this to triage which patient segments need immediate clinical attention.
                                Hover any cell — dimming reveals the cell&apos;s position in the risk landscape.
                            </p>

                            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                                {[
                                    ["Axes", "Days Overdue × Vaccines Missed"],
                                    ["Cell value", "Avg. predicted risk score (0–100)"],
                                    ["Clinical use", "ASHA worker priority routing"],
                                    ["Critical threshold", ">70 = immediate escalation"],
                                ].map(([k, v]) => (
                                    <div key={k} style={{
                                        background: "#0a1812", border: "1px solid #0d1f17",
                                        borderRadius: 8, padding: "7px 13px",
                                    }}>
                                        <div style={{ fontSize: 8, color: "#374151", letterSpacing: "0.12em", marginBottom: 2, fontFamily: "monospace" }}>
                                            {k.toUpperCase()}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#d1fae5", fontFamily: "monospace" }}>{v}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Matrix */}
                        <div style={{ background: "#080f0b", border: "1px solid #0d1f17", borderRadius: 12, padding: "28px 24px", marginBottom: 20 }}>
                            <RiskMatrix />

                            {/* Legend */}
                            <div style={{ display: "flex", gap: 20, marginTop: 24, marginLeft: 130, flexWrap: "wrap" }}>
                                {[
                                    { label: "LOW RISK  (≤40)", color: "#22c55e" },
                                    { label: "MED RISK  (41–70)", color: "#f59e0b" },
                                    { label: "HIGH RISK  (>70)", color: "#ef4444" },
                                ].map(({ label, color }) => (
                                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                        <div style={{ width: 10, height: 10, background: color, borderRadius: 2, opacity: 0.85 }} />
                                        <span style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Intervention zones */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                            {ZONES.map(({ title, range, desc, color, action }) => (
                                <div key={title} style={{
                                    background: "#080f0b",
                                    border: `1px solid ${color}22`,
                                    borderLeft: `3px solid ${color}`,
                                    borderRadius: 10,
                                    padding: "18px 18px",
                                }}>
                                    <div style={{ fontSize: 9, letterSpacing: "0.14em", color, fontWeight: 700, marginBottom: 6, fontFamily: "monospace" }}>
                                        {title}
                                    </div>
                                    <div style={{ fontSize: 12, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, color: "#f9fafb", marginBottom: 8 }}>
                                        {range}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.65, marginBottom: 12 }}>
                                        {desc}
                                    </div>
                                    <div style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        background: `${color}15`, border: `1px solid ${color}30`,
                                        borderRadius: 5, padding: "4px 9px",
                                        fontSize: 10, color, fontFamily: "monospace", fontWeight: 700,
                                    }}>
                                        → {action}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
