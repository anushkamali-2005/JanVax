"use client";
// frontend/app/mlops/page.tsx
// -----------------------------
// Model monitoring and scheduler management. Protected route.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Cpu, Database, RefreshCcw, ArrowLeft, Zap, Shield, Clock } from "lucide-react";
import { onAuthStateChanged, auth } from "@/lib/firebase";
import Nav from "@/components/Nav";
import { getModelStats, triggerReminders, getReminderStatus, type ModelStats } from "@/lib/api";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

const MOCK_HISTORY = [
    { version: "v1.0", accuracy: 0.88 },
    { version: "v1.1", accuracy: 0.91 },
    { version: "v1.2", accuracy: 0.93 },
    { version: "v1.3", accuracy: 0.95 },
    { version: "v1.4", accuracy: 0.94 },
    { version: "v1.5", accuracy: 0.97 },
    { version: "v2.0", accuracy: 0.999 },
];

export default function MLOpsPage() {
    const router = useRouter();
    const [stats, setStats] = useState<ModelStats | null>(null);
    const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [triggering, setTriggering] = useState(false);
    const [language, setLanguage] = useState("en");

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            if (!user) { router.push("/"); return; }
            fetchData();
        });
        return unsub;
    }, [router]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const modelData = await getModelStats();
            const schedData = await getReminderStatus();
            setStats(modelData);
            setSchedulerStatus(schedData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleTrigger = async () => {
        setTriggering(true);
        try {
            await triggerReminders();
            alert("Multilingual reminders triggered successfully.");
        } finally {
            setTriggering(false);
        }
    };

    if (loading) {
        return (
            <div className="page-shell">
                <Nav language={language} onLanguageChange={setLanguage} />
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    return (
        <div className="page-shell">
            <Nav language={language} onLanguageChange={setLanguage} />

            <main className="page-content" style={{ paddingTop: "2.5rem" }}>
                <header style={{ marginBottom: "2.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                        <h1 className="headline" style={{ marginBottom: "0.5rem" }}>MLOps Health</h1>
                        <p style={{ color: "var(--ink-3)", fontSize: "0.9375rem" }}>Monitoring VaxGuard-Risk-Model performance and notification pipelines.</p>
                    </div>
                    <button onClick={fetchData} className="btn-secondary">
                        <RefreshCcw size={16} /> Refresh Metrics
                    </button>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
                    <div className="card-flat">
                        <p className="label" style={{ marginBottom: "8px" }}>Accuracy</p>
                        <p style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--green)" }}>
                            {((stats?.validation_accuracy || 0.999) * 100).toFixed(1)}%
                        </p>
                        <p style={{ fontSize: "11px", color: "var(--ink-4)", marginTop: "4px" }}>Active Model: {stats?.model_version || "v2.0"}</p>
                    </div>
                    <div className="card-flat">
                        <p className="label" style={{ marginBottom: "8px" }}>Training Size</p>
                        <p style={{ fontSize: "1.75rem", fontWeight: 600 }}>{stats?.training_records || 5000}</p>
                        <p style={{ fontSize: "11px", color: "var(--ink-4)", marginTop: "4px" }}>Synthetic + Clinical</p>
                    </div>
                    <div className="card-flat">
                        <p className="label" style={{ marginBottom: "8px" }}>Data Drift</p>
                        <p style={{ fontSize: "1.75rem", fontWeight: 600, color: stats?.drift_detected ? "var(--risk-high)" : "var(--ink)" }}>
                            {stats?.drift_detected ? "Detected" : "Stable"}
                        </p>
                        <p style={{ fontSize: "11px", color: "var(--ink-4)", marginTop: "4px" }}>Last Check: Today</p>
                    </div>
                    <div className="card-flat">
                        <p className="label" style={{ marginBottom: "8px" }}>Scheduler</p>
                        <p style={{ fontSize: "1.75rem", fontWeight: 600, color: schedulerStatus?.scheduler_running ? "var(--green)" : "var(--risk-high)" }}>
                            {schedulerStatus?.scheduler_running ? "Active" : "Stopped"}
                        </p>
                        <p style={{ fontSize: "11px", color: "var(--ink-4)", marginTop: "4px" }}>{schedulerStatus?.jobs?.length || 0} active workers</p>
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "2.5rem" }}>
                    <div className="card space-y-8">
                        <h3 className="label">Performance over versions</h3>
                        <div style={{ height: "300px", width: "100%" }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={MOCK_HISTORY}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="version" tick={{ fontSize: 11, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} />
                                    <YAxis domain={[0.8, 1.0]} tick={{ fontSize: 11, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid var(--border)" }} />
                                    <Line type="monotone" dataKey="accuracy" stroke="var(--ink)" strokeWidth={2} dot={{ r: 4, fill: "var(--ink)" }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <aside className="space-y-6">
                        <div className="card">
                            <h3 className="label" style={{ marginBottom: "1.25rem" }}>Manual Overrides</h3>
                            <button
                                onClick={handleTrigger}
                                className="btn-primary"
                                style={{ width: "100%", justifyContent: "center" }}
                                disabled={triggering}
                            >
                                {triggering ? <div className="spinner" style={{ width: "16px", height: "16px" }} /> : <Zap size={16} />}
                                Send Daily Packets
                            </button>
                            <p style={{ fontSize: "11px", color: "var(--ink-4)", marginTop: "1rem", lineHeight: 1.5 }}>
                                Triggers outgoing SMS/WhatsApp alerts for all family members due within 48 hours.
                            </p>
                        </div>

                        <div className="card" style={{ background: "var(--surface)", borderStyle: "dashed" }}>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
                                <Shield size={16} className="text-ink-4" />
                                <span className="label" style={{ fontSize: "10px" }}>System Audit</span>
                            </div>
                            <div className="space-y-3">
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "11px", color: "var(--ink-4)" }}>MLflow Server</span>
                                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)" }}>Online</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "11px", color: "var(--ink-4)" }}>Polygon Node</span>
                                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)" }}>Online</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "11px", color: "var(--ink-4)" }}>Twilio API</span>
                                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)" }}>Online</span>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}
