"use client";
// frontend/app/ocr/page.tsx — renamed from /ocr in Nav
// (Actually I'll just keep it /ocr and update Nav if needed, but I already updated Nav to /scan)
// I'll rename the folder ocr -> scan

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Shield, RefreshCcw, AlertCircle } from "lucide-react";
import Nav from "@/components/Nav";
import OCRScanner from "@/components/OCRScanner";

export default function ScanPage() {
    const router = useRouter();
    const [language, setLanguage] = useState("en");

    return (
        <div className="page-shell">
            <Nav language={language} onLanguageChange={setLanguage} />

            <main className="page-content" style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
                <header style={{ textAlign: "center", marginBottom: "3rem" }} className="fade-up">
                    <h1 className="headline" style={{ marginBottom: "0.75rem" }}>Scan Vaccination Card</h1>
                    <p style={{ color: "var(--ink-3)", maxWidth: "480px", margin: "0 auto", fontSize: "0.9375rem" }}>
                        Point your camera at a paper record. Our AI will extract dates, vaccine names, and centers automatically.
                    </p>
                </header>

                <div className="fade-up fade-up-1" style={{ maxWidth: "600px", margin: "0 auto" }}>
                    <OCRScanner childId="latest" onSaved={() => router.push("/dashboard")} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 fade-up fade-up-2">
                    <div className="card-flat">
                        <div style={{ width: "32px", height: "32px", background: "var(--green-light)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                            <Shield size={18} className="text-green" />
                        </div>
                        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "8px" }}>Secure Import</h3>
                        <p style={{ fontSize: "0.8125rem", color: "var(--ink-3)", lineHeight: 1.6 }}>
                            Records are verified against known vaccine codes before being saved.
                        </p>
                    </div>
                    <div className="card-flat">
                        <div style={{ width: "32px", height: "32px", background: "var(--surface)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                            <RefreshCcw size={18} style={{ color: "var(--ink-2)" }} />
                        </div>
                        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "8px" }}>Local Processing</h3>
                        <p style={{ fontSize: "0.8125rem", color: "var(--ink-3)", lineHeight: 1.6 }}>
                            OCR happens in your browser. No images are sent to the server.
                        </p>
                    </div>
                    <div className="card-flat">
                        <div style={{ width: "32px", height: "32px", background: "#FEF2F2", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                            <AlertCircle size={18} style={{ color: "var(--risk-high)" }} />
                        </div>
                        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "8px" }}>Human Review</h3>
                        <p style={{ fontSize: "0.8125rem", color: "var(--ink-3)", lineHeight: 1.6 }}>
                            Always review the extracted data. AI can sometimes make mistakes.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
