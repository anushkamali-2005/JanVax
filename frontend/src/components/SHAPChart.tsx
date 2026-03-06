"use client";
// frontend/components/SHAPChart.tsx
// Horizontal bar chart showing SHAP feature contributions.
// Positive = increases risk (red), Negative = decreases risk (green).

import {
    BarChart, Bar, XAxis, YAxis, Cell,
    ReferenceLine, ResponsiveContainer, Tooltip,
} from "recharts";

const FEATURE_LABELS: Record<string, string> = {
    days_overdue: "Days overdue",
    district_outbreak_flag: "District outbreak",
    vaccines_missed_count: "Vaccines missed",
    age_months: "Child age",
    sibling_history: "Sibling history",
    gender_male: "Gender",
    state_high_risk: "State risk level",
    reminder_ignored_count: "Ignored reminders",
};

interface Props {
    shapValues: Record<string, number>;
}

export default function SHAPChart({ shapValues }: Props) {
    // Sort by absolute value descending, take top 6
    const data = Object.entries(shapValues)
        .map(([feature, value]) => ({
            feature: FEATURE_LABELS[feature] || feature,
            value: parseFloat(value.toFixed(3)),
        }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 6);

    const CustomTooltip = ({ active, payload }: any) => {
        if (!active || !payload?.length) return null;
        const val = payload[0].value;
        return (
            <div style={{
                background: "#fff", border: "1px solid var(--border)",
                borderRadius: "8px", padding: "8px 12px",
                fontSize: "0.8125rem", color: "var(--ink)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}>
                <p style={{ fontWeight: 500 }}>{payload[0].payload.feature}</p>
                <p style={{ color: val > 0 ? "var(--risk-high)" : "var(--green)", marginTop: "2px" }}>
                    {val > 0 ? "+" : ""}{val} risk contribution
                </p>
            </div>
        );
    };

    return (
        <div style={{ width: "100%", height: Math.max(data.length * 40 + 20, 180) }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                    barSize={14}
                >
                    <XAxis
                        type="number"
                        domain={["auto", "auto"]}
                        tick={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: "var(--ink-4)" }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        type="category"
                        dataKey="feature"
                        width={130}
                        tick={{ fontFamily: "var(--font-sans)", fontSize: 12, fill: "var(--ink-2)" }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--surface)" }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {data.map((entry, i) => (
                            <Cell
                                key={i}
                                fill={entry.value > 0 ? "#FCA5A5" : "#86EFAC"}
                                stroke={entry.value > 0 ? "#DC2626" : "#16A34A"}
                                strokeWidth={0.5}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
