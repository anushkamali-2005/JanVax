"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Shield, Camera, RefreshCcw, Check, AlertCircle } from "lucide-react";
import OCRScanner from "@/components/OCRScanner";
import { motion } from "framer-motion";

export default function OCRPage() {
    const router = useRouter();
    const [scanning, setScanning] = useState(false);

    return (
        <div className="min-h-screen bg-[#0f172a] text-white">
            <nav className="border-b border-white/10 px-8 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur-md">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    Back
                </button>
                <div className="flex items-center gap-2">
                    <Camera className="w-5 h-5 text-blue-500" />
                    <span className="font-bold uppercase tracking-widest text-[10px]">AI OCR Scanner</span>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto px-6 py-12">
                <header className="mb-12 text-center">
                    <h1 className="text-4xl font-bold mb-4">Scan Vaccination Card</h1>
                    <p className="text-slate-400 max-w-xl mx-auto">
                        Convert your physical paper records into digital, verified assets instantly.
                        Point your camera at the card and let our AI handle the rest.
                    </p>
                </header>

                <OCRScanner />

                <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center text-center">
                        <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-4">
                            <Shield className="w-6 h-6 text-blue-500" />
                        </div>
                        <h3 className="font-bold mb-2">Verified Matching</h3>
                        <p className="text-xs text-slate-500">Fuzzy matching identifies vaccine names even with messy handwriting.</p>
                    </div>
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center text-center">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 flex items-center justify-center mb-4">
                            <RefreshCcw className="w-6 h-6 text-emerald-500" />
                        </div>
                        <h3 className="font-bold mb-2">In-Browser OCR</h3>
                        <p className="text-xs text-slate-500">Processing happens locally for maximum privacy and low latency.</p>
                    </div>
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center text-center">
                        <div className="w-12 h-12 rounded-2xl bg-amber-600/10 flex items-center justify-center mb-4">
                            <AlertCircle className="w-6 h-6 text-amber-500" />
                        </div>
                        <h3 className="font-bold mb-2">Human-in-the-loop</h3>
                        <p className="text-xs text-slate-500">Always review and confirm extracted data before saving to blockchain.</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
