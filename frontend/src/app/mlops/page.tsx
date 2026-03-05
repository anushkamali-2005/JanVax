"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    BarChart2, Activity, Database, Clock, CheckCircle,
    AlertTriangle, ArrowLeft, RefreshCcw, Cpu
} from "lucide-react";
import { onAuthStateChanged } from "@/lib/firebase";
import type { User } from "firebase/auth";
import { getModelStats, triggerReminders, getReminderStatus, type ModelStats } from "@/lib/api";
import { motion } from "framer-motion";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from "recharts";

// Mock historical accuracy data for the chart (in production this comes from MLflow runs)
const MOCK_HISTORY = [
    { version: "v1.0", accuracy: 0.88 },
    { version: "v1.1", accuracy: 0.91 },
    { version: "v1.2", accuracy: 0.93 },
    { version: "v1.3", accuracy: 0.95 },
    { version: "v1.4", accuracy: 0.94 },
    { version: "v1.5", accuracy: 0.97 },
    { version: "v2.0", accuracy: 0.999 },
];

export default function MLOpsDashboardPage() {
    const router = useRouter();
    const [stats, setStats] = useState<ModelStats | null>(null);
    const [schedulerStatus, setSchedulerStatus] = useState<{ running: boolean; jobs: Array<{ id: string; next_run: string }> } | null>(null);
    const [loading, setLoading] = useState(true);
    const [triggering, setTriggering] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged((user: User | null) => {
            if (!user) { router.push("/"); return; }
            fetchData();
        });
        return () => unsub();
    }, [router]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [modelData, schedulerData] = await Promise.allSettled([
                getModelStats(),
                getReminderStatus(),
            ]);
            if (modelData.status === "fulfilled") setStats(modelData.value);
            if (schedulerData.status === "fulfilled") {
                setSchedulerStatus({
                    running: schedulerData.value.scheduler_running,
                    jobs: schedulerData.value.jobs,
                });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleTriggerReminders = async () => {
        setTriggering(true);
        try {
            await triggerReminders();
        } finally {
            setTriggering(false);
        }
    };

    const accuracy = stats?.validation_accuracy ?? 0;
    const accuracyPct = (accuracy * 100).toFixed(1);

    return (
        <div className="min-h-screen bg-[#0f172a] text-white">
            {/* Header */}
            <nav className="border-b border-white/10 px-8 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur-md">
                <button
                    onClick={() => router.push("/dashboard")}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    Back to Dashboard
                </button>
                <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-blue-500" />
                    <span className="font-bold">MLOps & Model Health</span>
                </div>
                <button
                    onClick={fetchData}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all"
                >
                    <RefreshCcw className="w-4 h-4 text-slate-400" />
                </button>
            </nav>

            <main className="max-w-7xl mx-auto px-8 py-10 space-y-8">
                {loading ? (
                    <div className="flex items-center justify-center h-80">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
                    </div>
                ) : (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            {[
                                {
                                    icon: <Activity className="w-6 h-6 text-emerald-400" />,
                                    label: "Validation Accuracy",
                                    value: `${accuracyPct}%`,
                                    sub: accuracy >= 0.90 ? "Above gate ✓" : "Below gate ✗",
                                    color: accuracy >= 0.90 ? "text-emerald-400" : "text-rose-400",
                                    bg: accuracy >= 0.90 ? "bg-emerald-500/10" : "bg-rose-500/10",
                                },
                                {
                                    icon: <BarChart2 className="w-6 h-6 text-blue-400" />,
                                    label: "Training Records",
                                    value: (stats?.training_records ?? 0).toLocaleString(),
                                    sub: "Synthetic + real",
                                    color: "text-blue-400",
                                    bg: "bg-blue-500/10",
                                },
                                {
                                    icon: <Database className="w-6 h-6 text-indigo-400" />,
                                    label: "Model Version",
                                    value: stats?.model_version ?? "—",
                                    sub: "Currently deployed",
                                    color: "text-indigo-400",
                                    bg: "bg-indigo-500/10",
                                },
                                {
                                    icon: stats?.drift_detected ? <AlertTriangle className="w-6 h-6 text-amber-400" /> : <CheckCircle className="w-6 h-6 text-emerald-400" />,
                                    label: "Data Drift",
                                    value: stats?.drift_detected ? "Detected" : "None",
                                    sub: stats?.drift_detected ? "Retraining needed" : "Model is stable",
                                    color: stats?.drift_detected ? "text-amber-400" : "text-emerald-400",
                                    bg: stats?.drift_detected ? "bg-amber-500/10" : "bg-emerald-500/10",
                                },
                            ].map((card, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className={`p-6 rounded-3xl border border-white/10 ${card.bg}`}
                                >
                                    <div className="mb-4">{card.icon}</div>
                                    <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">{card.label}</div>
                                    <div className={`text-3xl font-black ${card.color}`}>{card.value}</div>
                                    <div className="text-xs text-slate-500 mt-1">{card.sub}</div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Accuracy History Chart */}
                        <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8">
                            <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                                <Activity className="w-6 h-6 text-blue-400" />
                                Model Accuracy History
                            </h2>
                            <div className="h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={MOCK_HISTORY}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                                        <XAxis dataKey="version" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                                        <YAxis domain={[0.85, 1.0]} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #ffffff15", borderRadius: "12px" }}
                                            formatter={(v) => [`${((v as number) * 100).toFixed(1)}%`, "Accuracy"]}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="accuracy"
                                            stroke="#3b82f6"
                                            strokeWidth={3}
                                            dot={{ r: 5, fill: "#3b82f6", strokeWidth: 0 }}
                                            activeDot={{ r: 8, fill: "#60a5fa" }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Scheduler Status */}
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8">
                                <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                                    <Clock className="w-6 h-6 text-indigo-400" />
                                    Scheduler Status
                                </h2>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`w-3 h-3 rounded-full ${schedulerStatus?.running ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
                                    <span className="font-bold">{schedulerStatus?.running ? "Running" : "Stopped"}</span>
                                </div>
                                <div className="space-y-3">
                                    {(schedulerStatus?.jobs ?? []).map((job, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                                            <div className="text-sm font-medium text-slate-300">{job.id}</div>
                                            <div className="text-xs text-slate-500 font-bold">{job.next_run}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8">
                                <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                                    <Cpu className="w-6 h-6 text-blue-400" />
                                    Manual Controls
                                </h2>
                                <div className="space-y-4">
                                    <button
                                        onClick={handleTriggerReminders}
                                        disabled={triggering}
                                        className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-2xl font-bold transition-all flex items-center justify-center gap-3"
                                    >
                                        {triggering ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
                                        {triggering ? "Sending..." : "Trigger Daily Reminders Now"}
                                    </button>
                                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-sm text-amber-300">
                                        <strong>Retraining:</strong> Triggered automatically every Sunday at 2 AM via GitHub Actions, or push a commit with <code>[retrain]</code> in the message.
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-2xl text-xs text-slate-500 space-y-1">
                                        <div>Last trained: <span className="text-slate-300">{stats?.last_trained ? new Date(stats.last_trained).toLocaleString("en-IN") : "—"}</span></div>
                                        <div>Training accuracy: <span className="text-slate-300">{stats ? `${(stats.training_accuracy * 100).toFixed(1)}%` : "—"}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
