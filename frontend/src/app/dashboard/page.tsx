"use client";
// frontend/app/dashboard/page.tsx
// ------------------------------
// Main parent dashboard. Shows all children, their risk scores, and quick actions.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, subscribeToChildren, auth } from "@/lib/firebase";
import Nav from "@/components/Nav";
import RiskScoreCard from "@/components/RiskScoreCard";
import { Plus, LayoutGrid, Map as MapIcon, Scan, Activity, ArrowRight } from "lucide-react";

export default function Dashboard() {
    const [user, setUser] = useState<any>(null);
    const [children, setChildren] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [language, setLanguage] = useState("en");
    const router = useRouter();

    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, (user) => {
            if (!user) {
                router.push("/");
                return;
            }
            setUser(user);

            const unsubChildren = subscribeToChildren(user.uid, (data) => {
                setChildren(data);
                setLoading(false);
            });

            return () => unsubChildren();
        });

        return unsubAuth;
    }, [router]);

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

    // Derived stats
    const highRiskCount = children.filter(c => (c.riskScore || 0) >= 70).length;
    const dueSoonCount = children.filter(c => (c.riskScore || 0) >= 40 && (c.riskScore || 0) < 70).length;

    return (
        <div className="page-shell">
            <Nav language={language} onLanguageChange={setLanguage} />

            <main className="page-content" style={{ paddingTop: "2.5rem", paddingBottom: "4rem" }}>

                {/* Header section */}
                <header style={{ marginBottom: "2.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
                    <div className="fade-up">
                        <h1 className="headline" style={{ marginBottom: "0.5rem" }}>Family Health Vault</h1>
                        <p style={{ color: "var(--ink-3)", fontSize: "0.9375rem" }}>
                            Welcome back, {user?.displayName?.split(" ")[0] || "Parent"}. All records are blockchain-verified.
                        </p>
                    </div>
                    <button
                        onClick={() => router.push("/child/add")}
                        className="btn-primary fade-up fade-up-1"
                    >
                        <Plus size={18} />
                        Add Family Member
                    </button>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 fade-up fade-up-2">
                    <div className="card-flat" style={{ borderLeft: "4px solid var(--green)" }}>
                        <p className="label" style={{ marginBottom: "8px" }}>Status</p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                            <span style={{ fontSize: "1.75rem", fontWeight: 600 }}>{children.length}</span>
                            <span style={{ fontSize: "0.875rem", color: "var(--ink-4)" }}>Total Protected</span>
                        </div>
                    </div>
                    <div className="card-flat" style={{ borderLeft: `4px solid ${highRiskCount > 0 ? 'var(--risk-high)' : 'var(--border)'}` }}>
                        <p className="label" style={{ marginBottom: "8px" }}>Critical Risk</p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                            <span style={{ fontSize: "1.75rem", fontWeight: 600, color: highRiskCount > 0 ? "var(--risk-high)" : "inherit" }}>
                                {highRiskCount}
                            </span>
                            <span style={{ fontSize: "0.875rem", color: "var(--ink-4)" }}>Needs Attention</span>
                        </div>
                    </div>
                    <div className="card-flat" style={{ borderLeft: `4px solid ${dueSoonCount > 0 ? 'var(--risk-medium)' : 'var(--border)'}` }}>
                        <p className="label" style={{ marginBottom: "8px" }}>Due Soon</p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                            <span style={{ fontSize: "1.75rem", fontWeight: 600, color: dueSoonCount > 0 ? "var(--risk-medium)" : "inherit" }}>
                                {dueSoonCount}
                            </span>
                            <span style={{ fontSize: "0.875rem", color: "var(--ink-4)" }}>Upcoming Doses</span>
                        </div>
                    </div>
                </div>

                {/* Main Content: Children List vs Actions */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "2rem" }} className="flex-col md:flex-row">

                    {/* Left: Children list */}
                    <div className="fade-up fade-up-3">
                        <h2 className="label" style={{ marginBottom: "1.25rem", color: "var(--ink)" }}>Family Members</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            {children.length > 0 ? (
                                children.map((child, idx) => (
                                    <div key={child.id} className={`fade-up fade-up-${Math.min(idx + 3, 5)}`}>
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
                                        <div style={{
                                            marginTop: "-8px", padding: "16px 20px 12px",
                                            background: "#fff", border: "1px solid var(--border)",
                                            borderTop: "none", borderRadius: "0 0 10px 10px",
                                            display: "flex", justifyContent: "space-between", alignItems: "center"
                                        }}>
                                            <div style={{ display: "flex", gap: "1.5rem" }}>
                                                <div>
                                                    <p className="label" style={{ fontSize: "10px", marginBottom: "2px" }}>Next Dose</p>
                                                    <p style={{ fontSize: "12px", fontWeight: 500 }}>{child.nextDueVaccine || "None"}</p>
                                                </div>
                                                <div>
                                                    <p className="label" style={{ fontSize: "10px", marginBottom: "2px" }}>Due Date</p>
                                                    <p style={{ fontSize: "12px", color: "var(--ink-3)" }}>{child.nextDueDate || "N/A"}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => router.push(`/child/${child.id}`)}
                                                className="btn-ghost"
                                                style={{ padding: "4px 8px" }}
                                            >
                                                Details <ArrowRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="card" style={{ textAlign: "center", padding: "3rem", background: "var(--surface)", borderStyle: "dashed" }}>
                                    <p style={{ color: "var(--ink-3)", marginBottom: "1.5rem" }}>No family members added yet.</p>
                                    <button onClick={() => router.push("/child/add")} className="btn-secondary">Add your first child</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Quick actions & Outreach */}
                    <aside className="fade-up fade-up-4 space-y-6">
                        <div>
                            <h2 className="label" style={{ marginBottom: "1.25rem", color: "var(--ink)" }}>Quick Tools</h2>
                            <div className="card space-y-3" style={{ padding: "1rem" }}>
                                <button onClick={() => router.push("/scan")} className="btn-secondary" style={{ width: "100%", justifyContent: "flex-start" }}>
                                    <Scan size={16} /> Scan Health Card
                                </button>
                                <button onClick={() => router.push("/map")} className="btn-secondary" style={{ width: "100%", justifyContent: "flex-start" }}>
                                    <MapIcon size={16} /> Nearby Centers
                                </button>
                                <button onClick={() => router.push("/community")} className="btn-secondary" style={{ width: "100%", justifyContent: "flex-start" }}>
                                    <Activity size={16} /> Community Coverage
                                </button>
                            </div>
                        </div>

                        <div className="card" style={{ background: "linear-gradient(135deg, var(--green-light) 0%, #fff 100%)", borderColor: "var(--green-muted)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                                <Activity size={18} className="text-green" />
                                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>AI Health Guard</span>
                            </div>
                            <p style={{ fontSize: "0.8125rem", color: "var(--ink-3)", lineHeight: 1.6 }}>
                                Your records are being monitored for outbreak risks. We'll alert you via SMS if your district has a reported case.
                            </p>
                        </div>
                    </aside>

                </div>
            </main>
        </div>
    );
}
