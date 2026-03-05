"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Shield, CheckCircle, XCircle, Loader2, ExternalLink, Clock, Tag } from "lucide-react";
import { motion } from "framer-motion";
import { verifyHash, verifyChildRecords, type VerifyResponse, type ChildVerifyResponse } from "@/lib/api";

export default function VerifyPage() {
    const { hash } = useParams<{ hash: string }>();
    const [loading, setLoading] = useState(true);
    const [hashResult, setHashResult] = useState<VerifyResponse | null>(null);
    const [childRecords, setChildRecords] = useState<ChildVerifyResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!hash) return;

        const run = async () => {
            setLoading(true);
            try {
                // Try verifying as a record hash first
                const result = await verifyHash(hash).catch(() => null);
                if (result) {
                    setHashResult(result);
                    // If it's a child entity, also load their records
                    if (result.entity_type === "vaccine_record" || result.entity_type === "prediction") {
                        const records = await verifyChildRecords(result.entity_id).catch(() => null);
                        setChildRecords(records);
                    }
                } else {
                    // Try as a child ID directly (QR passport scan)
                    const records = await verifyChildRecords(hash);
                    setChildRecords(records);
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
        <main className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center p-6">
            <div className="w-full max-w-2xl">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <div className="flex justify-center mb-4">
                        <div className="p-4 bg-blue-600/10 rounded-3xl border border-blue-600/20">
                            <Shield className="w-10 h-10 text-blue-400" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-black mb-2">JanVax Blockchain Verifier</h1>
                    <p className="text-slate-400">Cryptographic proof that this vaccination record has not been tampered with.</p>
                </motion.div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
                        <p className="text-slate-400 font-medium">Querying Polygon blockchain...</p>
                    </div>
                ) : error ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-8 text-center"
                    >
                        <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold mb-2">Record Not Found</h2>
                        <p className="text-slate-400">{error}</p>
                    </motion.div>
                ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                        {/* Hash verification card */}
                        {hashResult && (
                            <div className={`rounded-3xl p-8 border ${hashResult.is_valid ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                <div className="flex items-center gap-4 mb-6">
                                    {hashResult.is_valid
                                        ? <CheckCircle className="w-10 h-10 text-emerald-400 shrink-0" />
                                        : <XCircle className="w-10 h-10 text-rose-400 shrink-0" />}
                                    <div>
                                        <h2 className="text-2xl font-bold">{hashResult.is_valid ? "Record Verified ✓" : "Verification Failed"}</h2>
                                        <p className="text-slate-400 text-sm">{hashResult.is_valid ? "This record matches its hash on the Polygon blockchain." : "This record does not match what was stored on-chain."}</p>
                                    </div>
                                </div>

                                <div className="space-y-4 text-sm">
                                    <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl">
                                        <Tag className="w-4 h-4 text-slate-400 shrink-0" />
                                        <div>
                                            <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">SHA-256 Hash</div>
                                            <div className="font-mono text-xs break-all text-slate-300">{hashResult.hash}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl">
                                        <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
                                        <div>
                                            <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Polygon Transaction</div>
                                            <a
                                                href={`https://mumbai.polygonscan.com/tx/${hashResult.polygon_tx_id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-mono text-xs text-blue-400 hover:underline break-all"
                                            >
                                                {hashResult.polygon_tx_id || "Pending..."}
                                            </a>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl">
                                        <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                                        <div>
                                            <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Stored At</div>
                                            <div className="text-slate-300">{hashResult.stored_at ? new Date(hashResult.stored_at).toLocaleString("en-IN") : "—"}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Child vaccine records */}
                        {childRecords && childRecords.records.length > 0 && (
                            <div className="bg-slate-900 border border-white/10 rounded-3xl p-8">
                                <h3 className="text-xl font-bold mb-6">Vaccination Records ({childRecords.total})</h3>
                                <div className="space-y-3">
                                    {childRecords.records.map((rec, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-3 h-3 rounded-full ${rec.isVerified ? "bg-emerald-400" : "bg-slate-600"}`} />
                                                <div>
                                                    <div className="font-bold">{rec.vaccineName}</div>
                                                    <div className="text-sm text-slate-500">{rec.dateGiven} · {rec.centerName}</div>
                                                </div>
                                            </div>
                                            {rec.isVerified
                                                ? <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                                                : <span className="text-xs text-slate-600 font-bold">UNVERIFIED</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* No data fallback */}
                        {!hashResult && (!childRecords || childRecords.records.length === 0) && (
                            <div className="text-center py-16 text-slate-500">
                                <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                <p>No verification data found for this identifier.</p>
                            </div>
                        )}
                    </motion.div>
                )}

                <p className="text-center text-xs text-slate-700 mt-10">
                    Powered by Polygon Mumbai Testnet · JanVax Platform
                </p>
            </div>
        </main>
    );
}
