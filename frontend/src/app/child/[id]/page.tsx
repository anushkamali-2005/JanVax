"use client";
// frontend/app/child/[id]/page.tsx
// ---------------------------------
// Detailed view for a single family member.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Shield, Clock, Activity, Zap, FileText, CheckCircle, Smartphone } from "lucide-react";
import { onAuthStateChanged, auth, subscribeToChildRecords, getChildDoc } from "@/lib/firebase";
import Nav from "@/components/Nav";
import RiskScoreCard from "@/components/RiskScoreCard";
import SHAPChart from "@/components/SHAPChart";
import QRVaccinePassport from "@/components/QRVaccinePassport";
import { predictRisk, explainRisk, type PredictResponse, type ExplainResponse } from "@/lib/api";

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
    const [activeTab, setActiveTab] = useState<Tab>("history");
    const [language, setLanguage] = useState("en");

    useEffect(() => {
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

                    {/* Left: Content Tabs */}
                    <div className="fade-up">
                        <div style={{ display: "flex", gap: "1.5rem", borderBottom: "1px solid var(--border)", marginBottom: "2rem" }}>
                            {(["history", "analysis", "passport"] as Tab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    style={{
                                        padding: "12px 4px", fontSize: "0.9375rem", fontWeight: 600,
                                        color: activeTab === tab ? "var(--ink)" : "var(--ink-4)",
                                        borderBottom: activeTab === tab ? "2px solid var(--ink)" : "2px solid transparent",
                                        transition: "all 0.2s"
                                    }}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>

                        {activeTab === "history" && (
                            <div className="space-y-3 fade-up">
                                {records.length > 0 ? (
                                    records.map((rec, i) => (
                                        <div key={i} className="card-flat" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                                                <div style={{ width: "36px", height: "36px", background: "var(--green-light)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    <CheckCircle size={18} className="text-green" />
                                                </div>
                                                <div>
                                                    <p style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{rec.vaccineName}</p>
                                                    <p style={{ fontSize: "0.75rem", color: "var(--ink-4)" }}>{rec.centerName} • {rec.dateGiven}</p>
                                                </div>
                                            </div>
                                            {rec.verified && (
                                                <div title="Blockchain Verified" style={{ color: "var(--green)" }}>
                                                    <Shield size={16} />
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="card" style={{ textAlign: "center", padding: "3rem", background: "var(--surface)", borderStyle: "dashed" }}>
                                        <p style={{ color: "var(--ink-4)", marginBottom: "1.25rem" }}>No records found.</p>
                                        <button onClick={() => router.push("/scan")} className="btn-secondary">Scan paper card</button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === "analysis" && (
                            <div className="space-y-6 fade-up">
                                {explanation ? (
                                    <>
                                        <div className="card">
                                            <h3 className="label" style={{ marginBottom: "1.5rem" }}>Feature Weights (SHAP)</h3>
                                            <SHAPChart shapValues={explanation.shap_values} />
                                        </div>
                                        <div className="card" style={{ background: "linear-gradient(135deg, var(--green-light) 0%, #fff 100%)", borderColor: "var(--green-muted)" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
                                                <Zap size={20} className="text-green" />
                                                <span style={{ fontWeight: 600 }}>JanVax AI Explainer</span>
                                            </div>
                                            <p style={{ fontSize: "1.0625rem", lineHeight: 1.6, color: "var(--ink-2)", fontStyle: "italic" }}>
                                                "{explanation.nl_explanation}"
                                            </p>
                                        </div>
                                        <div className="card">
                                            <h3 className="label" style={{ marginBottom: "1.25rem" }}>Actionable Steps</h3>
                                            <div className="space-y-3">
                                                {explanation.counterfactuals.map((cf, i) => (
                                                    <div key={i} className="card-flat" style={{ borderLeft: "4px solid var(--green)" }}>
                                                        <p style={{ fontSize: "0.875rem", color: "var(--ink-2)" }}>{cf.change_description}</p>
                                                        <p style={{ fontSize: "0.75rem", color: "var(--ink-4)", marginTop: "4px" }}>
                                                            Potential risk reduction to <strong>{cf.new_score}%</strong>
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="card" style={{ textAlign: "center", padding: "4rem" }}>
                                        <Activity size={32} style={{ color: "var(--ink-4)", marginBottom: "1rem", marginInline: "auto" }} />
                                        <h3 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No Analysis Available</h3>
                                        <p style={{ color: "var(--ink-4)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>Run the AI engine to generate a deep-dive analysis of health metrics.</p>
                                        <button onClick={runAnalysis} className="btn-primary" disabled={analyzing}>
                                            {analyzing ? <div className="spinner" style={{ width: "16px", height: "16px" }} /> : <Zap size={16} />}
                                            {analyzing ? "Analyzing..." : "Compute AI Insights"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === "passport" && (
                            <div className="fade-up" style={{ display: "flex", justifyContent: "center", paddingBlock: "2rem" }}>
                                <QRVaccinePassport
                                    childId={id as string}
                                    childName={child.name}
                                    lastVaccine={records[0]?.vaccineName || "BCG"}
                                    riskScore={child.riskScore || 0}
                                    verificationHash={child.polygonHash}
                                />
                            </div>
                        )}
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
