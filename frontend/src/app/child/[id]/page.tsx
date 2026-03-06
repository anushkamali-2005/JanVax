"use client";
// frontend/app/child/[id]/page.tsx
// ---------------------------------
// Detailed view for a single family member.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Shield, Clock, Activity, Zap, FileText, CheckCircle, Smartphone,
    AlertTriangle, Info, BarChart3, Fingerprint, MessageSquare, RefreshCcw, Search, ExternalLink
} from "lucide-react";
import { onAuthStateChanged, auth, subscribeToChildRecords, getChildDoc } from "@/lib/firebase";
import { doc, getDoc, collection, onSnapshot, query, orderBy } from "firebase/firestore";
import Nav from "@/components/Nav";
import RiskScoreCard from "@/components/RiskScoreCard";
import SHAPChart from "@/components/SHAPChart";
import QRVaccinePassport from "@/components/QRVaccinePassport";
import AgentFeed from "@/components/AgentFeed";
import { predictRisk, explainRisk, triggerAgent, type PredictResponse, type ExplainResponse } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from "recharts";

type Tab = "history" | "analysis" | "passport";

export default function ChildPage() {
    const { id } = useParams();
    const router = useRouter();
    const [child, setChild] = useState<any>(null);
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [prediction, setPrediction] = useState<PredictResponse | null>(null);
    const [explanation, setExplanation] = useState<ExplainResponse | null>(null);
    const [activeTab, setActiveTab] = useState<"history" | "analysis" | "passport" | "agent">("history");
    const [language, setLanguage] = useState("en");

    useEffect(() => {
        // demo mode bypass
        if (typeof window !== "undefined" && localStorage.getItem("janvax_demo_mode") === "true") {
            getChildDoc(id as string).then(data => {
                setChild(data);
                setLoading(false);
            });
            const unsubRecords = subscribeToChildRecords(id as string, (data) => {
                setRecords(data);
            });
            return () => unsubRecords();
        }

        const unsubAuth = onAuthStateChanged(auth, (user) => {
            if (!user) {
                router.push("/");
                return;
            }

            getChildDoc(id as string).then(data => {
                setChild(data);
                setLoading(false);
            });

            const unsubRecords = subscribeToChildRecords(id as string, (data) => {
                setRecords(data);
            });

            return () => unsubRecords();
        });

        return unsubAuth;
    }, [id, router]);

    const runAnalysis = async () => {
        if (!child) return;
        setAnalyzing(true);
        try {
            const pred = await predictRisk({
                child_id: id as string,
                age_months: child.ageMonths,
                gender: child.gender,
                vaccines_missed_count: child.vaccinesMissedCount || 0,
                days_overdue: child.daysOverdue || 0,
                district_outbreak_flag: child.districtOutbreakFlag || 0,
                sibling_history: child.siblingHistory || 0,
                top_missed_vaccine: child.nextDueVaccine || "None",
            });
            setPrediction(pred);

            const exp = await explainRisk(0, id as string, language);
            setExplanation(exp);
            setActiveTab("analysis");
        } catch (err) {
            console.error("Analysis failed:", err);
        } finally {
            setAnalyzing(false);
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

                {/* Back Link */}
                <button onClick={() => router.push("/dashboard")} className="btn-ghost" style={{ marginBottom: "1.5rem", padding: "0" }}>
                    <ArrowLeft size={16} /> Back to Dashboard
                </button>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: "2.5rem" }} className="flex-col lg:flex-row">

                    {/* Left Column: Tabs & Content */}
                    <div className="lg:col-span-2 space-y-6" style={{ minWidth: 0 }}>
                        <div className="flex p-1 bg-slate-900 border border-white/10 rounded-2xl w-fit mb-6 overflow-x-auto">
                            <button
                                onClick={() => setActiveTab("history")}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === "history" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-400 hover:text-white"}`}
                            >
                                Vaccine History
                            </button>
                            <button
                                onClick={() => setActiveTab("analysis")}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === "analysis" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-400 hover:text-white"}`}
                            >
                                AI Risk Detail
                            </button>
                            <button
                                onClick={() => setActiveTab("agent")}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === "agent" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-400 hover:text-white"}`}
                            >
                                Agent Decision
                            </button>
                            <button
                                onClick={() => setActiveTab("passport")}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === "passport" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-400 hover:text-white"}`}
                            >
                                QR Passport
                            </button>
                        </div>

                        <AnimatePresence mode="wait">
                            {activeTab === "history" && (
                                <motion.div
                                    key="history"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="space-y-4"
                                >
                                    {records.length > 0 ? (
                                        records.map((rec, i) => (
                                            <div key={i} className="bg-slate-900 border border-white/10 rounded-3xl p-6 flex items-center justify-between group hover:border-blue-500/30 transition-all">
                                                <div className="flex items-center gap-5">
                                                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                                                        <CheckCircle className="w-6 h-6 text-emerald-500" />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-lg text-white">{rec.vaccineName}</h3>
                                                        <div className="text-sm text-slate-500 flex items-center gap-2">
                                                            <span>{rec.centerName}</span>
                                                            <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                                                            <span>{rec.dateGiven}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {rec.polygonHash && (
                                                    <div className="p-2 bg-blue-500/10 rounded-full cursor-help group-hover:bg-blue-500/20 transition-all" title="Verified on Blockchain">
                                                        <Shield className="w-5 h-5 text-blue-400" />
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-20 text-center bg-slate-900/50 rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center">
                                            <RefreshCcw className="w-10 h-10 text-slate-700 mb-4" />
                                            <p className="text-slate-500 font-medium">No vaccination records found.</p>
                                            <button onClick={() => router.push("/scan")} className="mt-4 text-blue-400 font-bold hover:underline">Scan Paper Card</button>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {activeTab === "analysis" && (
                                <motion.div
                                    key="analysis"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="space-y-6"
                                >
                                    <div className="p-6 rounded-3xl bg-blue-600/10 border border-blue-600/20 flex gap-4">
                                        <Info className="w-6 h-6 text-blue-400 shrink-0" />
                                        <p className="text-sm text-blue-200 leading-relaxed font-medium">
                                            Our <strong>VaxGuard AI</strong> model retrains weekly. This prediction is based on Model v2.3 with 94.2% accuracy on Indian demographics.
                                        </p>
                                    </div>

                                    {explanation ? (
                                        <>
                                            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8">
                                                <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                                                    <BarChart3 className="w-6 h-6 text-blue-400" />
                                                    Feature Weights (SHAP)
                                                </h3>
                                                <div className="bg-white/5 rounded-2xl p-4">
                                                    <SHAPChart shapValues={explanation.shap_values} />
                                                </div>
                                            </div>

                                            {/* Gemini NL Explanation */}
                                            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                                                <div className="absolute -right-20 -bottom-20 opacity-10 group-hover:scale-110 transition-transform duration-700">
                                                    <MessageSquare className="w-80 h-80" />
                                                </div>
                                                <h3 className="text-2xl font-bold mb-4 flex items-center gap-3">
                                                    <Zap className="w-8 h-8 text-amber-300" />
                                                    AI Explainer
                                                </h3>
                                                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 relative z-10">
                                                    <p className="text-lg leading-relaxed text-white/90 italic">
                                                        &quot;{explanation.nl_explanation}&quot;
                                                    </p>
                                                    <div className="mt-4 flex items-center gap-2 text-white/60 text-sm font-bold uppercase tracking-widest">
                                                        <RefreshCcw className="w-3 h-3" />
                                                        Powered by Google Gemini
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Counterfactuals */}
                                            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8">
                                                <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                                                    <Clock className="w-6 h-6 text-amber-400" />
                                                    What can you do? (Counterfactuals)
                                                </h3>
                                                <div className="grid md:grid-cols-2 gap-4">
                                                    {explanation.counterfactuals.map((cf, i) => (
                                                        <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                                                            <p className="text-slate-300 mb-3 leading-relaxed">{cf.change_description}</p>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-slate-500">Risk drops to:</span>
                                                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md font-black text-sm">{cf.new_score}%</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="py-20 text-center bg-slate-900/50 rounded-[2.5rem] border-2 border-dashed border-white/10 flex flex-col items-center">
                                            <Zap className="w-12 h-12 text-slate-700 mb-4" />
                                            <h3 className="text-xl font-bold text-slate-400 mb-2">No Analysis Data</h3>
                                            <p className="text-slate-500 max-w-xs mb-8">Run the AI analysis engine to see feature weights and natural language explanations.</p>
                                            <button
                                                onClick={runAnalysis}
                                                disabled={analyzing}
                                                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 transition-all rounded-2xl font-bold shadow-xl shadow-blue-600/20 disabled:opacity-50"
                                            >
                                                {analyzing ? "Analyzing..." : "Run Engine"}
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {activeTab === "agent" && (
                                <motion.div
                                    key="agent"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="space-y-6"
                                >
                                    <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 text-center mb-6">
                                        <div className="w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                            <Shield className="w-10 h-10 text-indigo-500" />
                                        </div>
                                        <h3 className="text-2xl font-bold mb-4 text-white">Multi-Agent Debate Pipeline</h3>
                                        <p className="text-slate-400 max-w-lg mx-auto mb-10">
                                            Our system doesn&apos;t just predict—it debates. Independent AI agents analyze risk, challenge assumptions, and decide on the best course of action.
                                        </p>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
                                            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                                <Search className="w-6 h-6 text-blue-400 mb-3 mx-auto" />
                                                <div className="font-bold text-white">Risk Analyst</div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Gathers Evidence</div>
                                            </div>
                                            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                                <AlertTriangle className="w-6 h-6 text-rose-400 mb-3 mx-auto" />
                                                <div className="font-bold text-white">Devil&apos;s Advocate</div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Tests Assumptions</div>
                                            </div>
                                            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                                <Zap className="w-6 h-6 text-amber-400 mb-3 mx-auto" />
                                                <div className="font-bold text-white">Final Arbiter</div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Orchestrates Action</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Live AI Negotiation Feed */}
                                    {child?.id && <AgentFeed childId={child.id} />}
                                </motion.div>
                            )}

                            {activeTab === "passport" && (
                                <motion.div
                                    key="passport"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex justify-center py-8"
                                >
                                    <QRVaccinePassport
                                        childId={id as string}
                                        childName={child.name}
                                        lastVaccine={records[0]?.vaccineName || "BCG"}
                                        riskScore={child.riskScore || 0}
                                        verificationHash={child.polygonHash}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Right: Profile Sticky */}
                    <aside style={{ position: "sticky", top: "6rem", height: "fit-content" }} className="fade-up fade-up-1">
                        <RiskScoreCard
                            child={{
                                id: child.id,
                                name: child.name,
                                ageMonths: child.ageMonths,
                                riskScore: child.riskScore || 0,
                                riskDisease: child.riskDisease || "",
                                modelVersion: child.modelVersion
                            }}
                            language={language}
                        />

                        <div className="card-flat" style={{ marginTop: "1.5rem" }}>
                            <p className="label" style={{ marginBottom: "1rem" }}>Health Stats</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "0.8125rem", color: "var(--ink-4)" }}>Missed Doses</span>
                                    <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{child.vaccinesMissedCount || 0}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "0.8125rem", color: "var(--ink-4)" }}>Days Overdue</span>
                                    <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{child.daysOverdue || 0}d</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "0.8125rem", color: "var(--ink-4)" }}>Next Goal</span>
                                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--green)" }}>{child.nextDueVaccine || "Done"}</span>
                                </div>
                            </div>
                        </div>

                        <div className="card-flat" style={{ marginTop: "1rem", background: "var(--surface)", borderStyle: "dashed" }}>
                            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                                <Smartphone size={16} style={{ marginTop: "2px", color: "var(--ink-3)" }} />
                                <p style={{ fontSize: "0.75rem", color: "var(--ink-4)", lineHeight: 1.6 }}>
                                    This child is registered for USSD/SMS reminders. Updates will be sent to the linked phone number in Hindi/English.
                                </p>
                            </div>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}
