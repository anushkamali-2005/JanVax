"use client";
// frontend/app/community/page.tsx
// ------------------------------
// Herd immunity monitor map.

import { useState, useEffect } from "react";
import { getCommunityStats, type DistrictCoverage } from "@/lib/api";
import Nav from "@/components/Nav";
import HerdImmunityMap from "@/components/HerdImmunityMap";
import { Shield, Info, ArrowUpRight } from "lucide-react";

export default function CommunityPage() {
    const [districts, setDistricts] = useState<DistrictCoverage[]>([]);
    const [loading, setLoading] = useState(true);
    const [language, setLanguage] = useState("en");

    useEffect(() => {
        getCommunityStats().then(data => {
            setDistricts(data.districts);
            setLoading(false);
        });
    }, []);

    return (
        <div className="page-shell">
            <Nav language={language} onLanguageChange={setLanguage} />

            <main className="page-content" style={{ paddingTop: "2.5rem", paddingBottom: "4rem" }}>

                <header style={{ marginBottom: "2.5rem" }} className="fade-up">
                    <p className="label" style={{ marginBottom: "0.75rem" }}>Public Health Surveillance</p>
                    <h1 className="headline" style={{ marginBottom: "0.5rem" }}>India Coverage Map</h1>
                    <p style={{ color: "var(--ink-3)", fontSize: "0.9375rem", maxWidth: "600px" }}>
                        Real-time monitoring of community vaccination levels. We use anonymous records to identify districts below herd immunity thresholds.
                    </p>
                </header>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "2rem" }} className="flex-col md:flex-row">

                    {/* Map Section */}
                    <div className="fade-up fade-up-1">
                        <div className="card" style={{ padding: "0", height: "600px", overflow: "hidden" }}>
                            {loading ? (
                                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <div className="spinner" />
                                </div>
                            ) : (
                                <HerdImmunityMap districts={districts} />
                            )}
                        </div>
                    </div>

                    {/* Sidebar Info */}
                    <aside className="fade-up fade-up-2 space-y-6">
                        <div className="card-flat" style={{ background: "var(--green-light)", borderColor: "var(--green-muted)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                                <Shield size={18} className="text-green" />
                                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Herd Immunity Alert</span>
                            </div>
                            <p style={{ fontSize: "0.8125rem", color: "var(--ink-2)", lineHeight: 1.6 }}>
                                Districts in <span style={{ color: "var(--risk-high)", fontWeight: 600 }}>red</span> have MMR coverage below 70%. High risk of measles transmission.
                            </p>
                        </div>

                        <div className="card">
                            <h3 className="label" style={{ marginBottom: "1.25rem", color: "var(--ink)" }}>Active Outbreaks</h3>
                            <div className="space-y-4">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>Mumbai District</p>
                                        <p style={{ fontSize: "0.75rem", color: "var(--risk-high)" }}>Measles (Active)</p>
                                    </div>
                                    <div style={{ width: "8px", height: "8px", background: "var(--risk-high)", borderRadius: "50%" }} />
                                </div>
                                <hr className="divider" />
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>Pune District</p>
                                        <p style={{ fontSize: "0.75rem", color: "var(--risk-medium)" }}>Polio Warning</p>
                                    </div>
                                    <div style={{ width: "8px", height: "8px", background: "var(--risk-medium)", borderRadius: "50%" }} />
                                </div>
                            </div>
                        </div>

                        <div className="card-flat" style={{ borderStyle: "dashed" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                                <Info size={16} className="text-ink-4" />
                                <span className="label" style={{ fontSize: "10px" }}>Data Transparency</span>
                            </div>
                            <p style={{ fontSize: "0.75rem", color: "var(--ink-4)", lineHeight: 1.7 }}>
                                Data is aggregated from JanVax users. For official government statistics, please visit Cowin.gov.in
                            </p>
                            <button className="btn-ghost" style={{ padding: "8px 0", marginTop: "8px" }}>
                                Official Stats <ArrowUpRight size={14} />
                            </button>
                        </div>
                    </aside>

                </div>
            </main>
        </div>
    );
}
