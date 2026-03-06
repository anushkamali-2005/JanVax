"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Shield, Search, ArrowRight } from "lucide-react";

export default function VerifyIndexPage() {
    const [hash, setHash] = useState("");
    const router = useRouter();

    const handleVerify = (e: React.FormEvent) => {
        e.preventDefault();
        if (hash.trim()) {
            router.push(`/verify/${hash.trim()}`);
        }
    };

    return (
        <div className="page-shell">
            <Nav language="en" />
            <main className="page-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5rem", paddingBottom: "5rem" }}>
                <div style={{ width: "100%", maxWidth: "600px" }} className="fade-up card p-8 text-center">
                    <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Shield className="w-8 h-8 text-blue-500" />
                    </div>
                    <h1 className="text-3xl font-bold mb-4">Blockchain Verifier</h1>
                    <p className="text-slate-400 mb-8">
                        Enter a unique record hash or child ID below to verify its authenticity on the Polygon blockchain.
                    </p>

                    <form onSubmit={handleVerify} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                            <input
                                type="text"
                                value={hash}
                                onChange={(e) => setHash(e.target.value)}
                                placeholder="Enter hash (e.g. 0x... or child-123)"
                                className="w-full bg-slate-900 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!hash.trim()}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2"
                        >
                            Verify <ArrowRight className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}
