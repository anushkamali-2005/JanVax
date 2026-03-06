"use client";
// frontend/app/verify/[hash]/page.tsx
// ------------------------------------
// Public-facing blockchain verification page. No login required.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shield, CheckCircle, XCircle, ExternalLink, Clock, ArrowLeft } from "lucide-react";
import { verifyHash, verifyChildRecords, type VerifyResponse, type ChildVerifyResponse } from "@/lib/api";

export default function VerifyPage() {
    const { hash } = useParams<{ hash: string }>();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [hashResult, setHashResult] = useState<VerifyResponse | null>(null);
    const [childRecords, setChildRecords] = useState<ChildVerifyResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!hash) return;

        const run = async () => {
            setLoading(true);
            try {
                const result = await verifyHash(hash).catch(() => null);
                if (result) {
                    setHashResult(result);
                    if (result.entity_type === "vaccine_record" || result.entity_type === "prediction") {
                        const children = await verifyChildRecords(result.entity_id).catch(() => null);
                        setChildRecords(children);
                    }
                } else {
                    const children = await verifyChildRecords(hash);
                    setChildRecords(children);
                }
            } catch (e: any) {
                setError(e.message || "Record not found on blockchain.");
            } finally {
                setLoading(false);
            }
        };

        run();
    }, [hash]);

    return (
        <div className="page-shell" style={{ background: "var(--surface)" }}>
            <main className="page-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5rem", paddingBottom: "5rem" }}>

                <div style={{ width: "100%", maxWidth: "600px" }} className="fade-up">
                    <div style={{ textAlign: "center", marginBottom: "3rem" }}>
                        <div style={{ width: "56px", height: "56px", background: "#fff", border: "1px solid var(--border)", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                            <Shield size={28} className="text-green" />
                        </div>
                        <h1 className="headline" style={{ marginBottom: "0.5rem" }}>Blockchain Verifier</h1>
                        <p style={{ color: "var(--ink-4)", fontSize: "0.875rem" }}>
                            Verifying record authenticity via Polygon Mumbai Proof-of-Stake.
                        </p>
                    </div>

                    {loading ? (
                        <div className="card" style={{ textAlign: "center", padding: "4rem" }}>
                            <div className="spinner" style={{ marginInline: "auto", marginBottom: "1rem" }} />
                            <p style={{ color: "var(--ink-3)", fontSize: "0.9375rem" }}>Querying on-chain registry...</p>
                        </div>
                    ) : error ? (
                        <div className="card" style={{ textAlign: "center", padding: "3rem", borderColor: "var(--risk-high)" }}>
                            <XCircle size={40} style={{ color: "var(--risk-high)", marginInline: "auto", marginBottom: "1rem" }} />
                            <h3 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Verification Unavailable</h3>
                            <p style={{ color: "var(--ink-3)", fontSize: "0.875rem" }}>{error}</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {hashResult && (
                                <div className="card" style={{ borderColor: hashResult.is_valid ? "var(--green-muted)" : "var(--risk-high)" }}>
                                    <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.5rem" }}>
                                        {hashResult.is_valid ? <CheckCircle size={28} className="text-green" /> : <XCircle size={28} style={{ color: "var(--risk-high)" }} />}
                                        <div>
                                            <h2 style={{ fontSize: "1.125rem", fontWeight: 700 }}>{hashResult.is_valid ? "Record Authenticated" : "Integrity Failure"}</h2>
                                            <p style={{ fontSize: "0.8125rem", color: "var(--ink-4)" }}>Verified on {hashResult.stored_at ? new Date(hashResult.stored_at).toLocaleDateString() : "Pending"}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="card-flat" style={{ background: "var(--surface)" }}>
                                            <p className="label" style={{ fontSize: "10px", marginBottom: "4px" }}>On-Chain Hash (SHA-256)</p>
                                            <p className="mono" style={{ fontSize: "10px", wordBreak: "break-all" }}>{hashResult.hash}</p>
                                        </div>
                                        <div className="card-flat" style={{ background: "var(--surface)" }}>
                                            <p className="label" style={{ fontSize: "10px", marginBottom: "4px" }}>Transaction ID</p>
                                            <a
                                                href={`https://mumbai.polygonscan.com/tx/${hashResult.polygon_tx_id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ fontSize: "10px", color: "var(--green)", textDecoration: "underline", display: "block", wordBreak: "break-all" }}
                                            >
                                                {hashResult.polygon_tx_id} <ExternalLink size={10} style={{ display: "inline" }} />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {childRecords && (
                                <div className="card">
                                    <h3 className="label" style={{ marginBottom: "1.25rem" }}>Identity Records</h3>
                                    <div className="space-y-2">
                                        {childRecords.records.map((rec: any, i: number) => (
                                            <div key={i} className="card-flat" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div>
                                                    <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>{rec.vaccineName}</p>
                                                    <p style={{ fontSize: "0.75rem", color: "var(--ink-4)" }}>{rec.centerName}</p>
                                                </div>
                                                {rec.isVerified ? <CheckCircle size={14} className="text-green" /> : <Clock size={14} style={{ color: "var(--ink-4)" }} />}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ marginTop: "3rem", textAlign: "center" }}>
                        <button onClick={() => router.push("/")} className="btn-ghost">
                            <ArrowLeft size={16} /> Return to Home
                        </button>
                    </div>
                </div>

            </main>
        </div>
    );
}
