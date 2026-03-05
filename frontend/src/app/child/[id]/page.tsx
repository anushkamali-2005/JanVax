"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Shield, AlertTriangle, CheckCircle, Clock,
    Info, BarChart3, Fingerprint, Zap, MessageSquare,
    RefreshCcw, Search, ExternalLink
} from "lucide-react";
import { db, onAuthStateChanged } from "@/lib/firebase";
import { doc, getDoc, collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { predictRisk, explainRisk, triggerAgent, type PredictResponse, type ExplainResponse } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from "recharts";

export default function ChildDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const [child, setChild] = useState<any>(null);
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [prediction, setPrediction] = useState<PredictResponse | null>(null);
    const [explanation, setExplanation] = useState<ExplainResponse | null>(null);
    const [activeTab, setActiveTab] = useState<"history" | "analysis" | "agent">("history");

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged((user) => {
            if (!user) {
                router.push("/");
                return;
            }

            const childRef = doc(db, "children", id as string);
            getDoc(childRef).then((docSnap) => {
                if (docSnap.exists()) {
                    setChild({ id: docSnap.id, ...docSnap.data() });
                }
                setLoading(false);
            });

            const recordsRef = collection(db, "children", id as string, "vaccineRecords");
            const q = query(recordsRef, orderBy("dateGiven", "desc"));
            const unsubscribeRecords = onSnapshot(q, (snapshot) => {
                setRecords(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            });

            return () => unsubscribeRecords();
        });

        return () => unsubscribeAuth();
    }, [id, router]);

    const runAnalysis = async () => {
        if (!child) return;
        setAnalyzing(true);
        try {
            const res = await predictRisk({
                child_id: id as string,
                age_months: child.ageMonths,
                gender: child.gender,
                vaccines_missed_count: child.vaccinesMissedCount || 0,
                days_overdue: child.daysOverdue || 0,
                district_outbreak_flag: child.districtOutbreakFlag || 0,
                sibling_history: child.siblingHistory || 0,
                top_missed_vaccine: child.nextDueVaccine || "None",
            });
            setPrediction(res);
            setActiveTab("analysis");

            // Auto-fetch explanation if prediction successful
            // In a real app, prediction_id would be returned
            const exp = await explainRisk(0, id as string, "en");
            setExplanation(exp);
        } catch (err) {
            console.error("Analysis failed", err);
        } finally {
            setAnalyzing(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
    );

    const riskColor = (score: number) => score >= 70 ? 'text-rose-500' : score >= 40 ? 'text-amber-500' : 'text-emerald-500';
    const riskBg = (score: number) => score >= 70 ? 'bg-rose-500' : score >= 40 ? 'bg-amber-500' : 'bg-emerald-500';

    return (
        <div className="min-h-screen bg-[#0f172a] text-white">
            {/* Header */}
            <nav className="border-b border-white/10 px-8 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur-md">
                <button
                    onClick={() => router.push("/dashboard")}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    Back to Vault
                </button>
                <div className="flex items-center gap-2">
                    <Fingerprint className="w-5 h-5 text-blue-500" />
                    <span className="font-bold">Child Record ID: {id?.slice(0, 8)}</span>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-8 py-10">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

                    {/* Left Column: Profile Card */}
                    <div className="lg:col-span-1 space-y-8">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4">
                                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${riskBg(child?.riskScore || 0)}/10 ${riskColor(child?.riskScore || 0)} border border-current`}>
                                    {child?.riskScore >= 70 ? 'Critical' : child?.riskScore >= 40 ? 'Warning' : 'Protected'}
                                </div>
                            </div>

                            <div className="flex flex-col items-center text-center mt-4">
                                <div className={`w-32 h-32 rounded-[2.5rem] bg-gradient-to-br ${child?.gender?.toLowerCase() === 'female' ? 'from-rose-500 to-pink-600' : 'from-blue-500 to-indigo-600'} flex items-center justify-center text-5xl font-bold shadow-2xl shadow-black/40 mb-6`}>
                                    {child?.name?.[0]}
                                </div>
                                <h1 className="text-3xl font-bold">{child?.name}</h1>
                                <div className="flex items-center gap-3 mt-2 text-slate-400 font-medium">
                                    <span>{child?.ageMonths} Months</span>
                                    <span className="w-1.5 h-1.5 bg-slate-700 rounded-full"></span>
                                    <span>{child?.gender}</span>
                                </div>
                            </div>

                            <div className="mt-10 pt-10 border-t border-white/5 space-y-6">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Current Risk Score</span>
                                    <span className={`font-black text-2xl ${riskColor(child?.riskScore || 0)}`}>{child?.riskScore || 0}%</span>
                                </div>
                                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div className={`h-full ${riskBg(child?.riskScore || 0)}`} style={{ width: `${child?.riskScore || 0}%` }}></div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Missed</div>
                                        <div className="text-xl font-bold">{child?.vaccinesMissedCount || 0}</div>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Overdue</div>
                                        <div className="text-xl font-bold">{child?.daysOverdue || 0}d</div>
                                    </div>
                                </div>

                                <button
                                    onClick={runAnalysis}
                                    disabled={analyzing}
                                    className="w-full py-4 bg-white/5 hover:bg-white/10 transition-all rounded-2xl font-bold flex items-center justify-center gap-3 border border-white/10"
                                >
                                    {analyzing ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 text-blue-400" />}
                                    {analyzing ? "Running AI Engine..." : "Run AI Risk Analysis"}
                                </button>
                            </div>
                        </motion.div>

                        <div className="p-6 rounded-3xl bg-blue-600/10 border border-blue-600/20 flex gap-4">
                            <Info className="w-6 h-6 text-blue-400 shrink-0" />
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Our <strong>VaxGuard AI</strong> model retrains weekly. This prediction is based on Model v2.3 with 94.2% accuracy on Indian demographics.
                            </p>
                        </div>
                    </div>

                    {/* Right Column: Tabs & Content */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex p-1 bg-slate-900 border border-white/10 rounded-2xl w-fit">
                            <button
                                onClick={() => setActiveTab("history")}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "history" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-400 hover:text-white"}`}
                            >
                                Vaccine History
                            </button>
                            <button
                                onClick={() => setActiveTab("analysis")}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "analysis" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-400 hover:text-white"}`}
                            >
                                AI Risk Detail
                            </button>
                            <button
                                onClick={() => setActiveTab("agent")}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "agent" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-400 hover:text-white"}`}
                            >
                                Agent Decision
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
                                                        <h3 className="font-bold text-lg">{rec.vaccineName}</h3>
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
                                            <button className="mt-4 text-blue-400 font-bold hover:underline">Scan Paper Card</button>
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
                                    className="space-y-8"
                                >
                                    {explanation ? (
                                        <>
                                            {/* SHAP Chart */}
                                            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8">
                                                <div className="flex items-center justify-between mb-8">
                                                    <div>
                                                        <h3 className="text-xl font-bold flex items-center gap-3">
                                                            <BarChart3 className="w-6 h-6 text-blue-400" />
                                                            Why this score? (SHAP Analysis)
                                                        </h3>
                                                        <p className="text-sm text-slate-500">Feature contributions to the risk prediction</p>
                                                    </div>
                                                </div>

                                                <div className="h-[300px] w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart
                                                            layout="vertical"
                                                            data={Object.entries(explanation.shap_values).map(([name, value]) => ({ name, value }))}
                                                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                                        >
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                                                            <XAxis type="number" hide />
                                                            <YAxis
                                                                dataKey="name"
                                                                type="category"
                                                                axisLine={false}
                                                                tickLine={false}
                                                                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}
                                                            />
                                                            <Tooltip
                                                                cursor={{ fill: '#ffffff05' }}
                                                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                                            />
                                                            <ReferenceLine x={0} stroke="#ffffff20" />
                                                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                                {Object.entries(explanation.shap_values).map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry[1] > 0 ? '#f43f5e' : '#10b981'} />
                                                                ))}
                                                            </Bar>
                                                        </BarChart>
                                                    </ResponsiveContainer>
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
                                                        "{explanation.nl_explanation}"
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
                                                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 transition-all rounded-2xl font-bold shadow-xl shadow-blue-600/20"
                                            >
                                                Run Engine
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
                                    <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 text-center">
                                        <div className="w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                            <Shield className="w-10 h-10 text-indigo-500" />
                                        </div>
                                        <h3 className="text-2xl font-bold mb-4">Multi-Agent Debate Pipeline</h3>
                                        <p className="text-slate-400 max-w-lg mx-auto mb-10">
                                            Our system doesn't just predict—it debates. Independent AI agents analyze risk, challenge assumptions, and decide on the best course of action.
                                        </p>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                                            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                                <Search className="w-6 h-6 text-blue-400 mb-3 mx-auto" />
                                                <div className="font-bold">Risk Analyst</div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Gathers Evidence</div>
                                            </div>
                                            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                                <AlertTriangle className="w-6 h-6 text-rose-400 mb-3 mx-auto" />
                                                <div className="font-bold">Devil's Advocate</div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Tests Assumptions</div>
                                            </div>
                                            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                                <Zap className="w-6 h-6 text-amber-400 mb-3 mx-auto" />
                                                <div className="font-bold">Final Arbiter</div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Orchestrates Action</div>
                                            </div>
                                        </div>

                                        <button className="px-10 py-4 bg-white/5 hover:bg-white/10 transition-all rounded-2xl font-bold border border-white/10 flex items-center gap-3 mx-auto">
                                            View Agent History <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </main>
        </div>
    );
}

function ChevronRight(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m9 18 6-6-6-6" />
        </svg>
    );
}
