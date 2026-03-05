"use client";

/**
 * OCRScanner.tsx
 * ──────────────
 * In-browser OCR scanner using Tesseract.js.
 * Lets parents photograph paper vaccination cards and extract structured records.
 *
 * Flow: Camera/File → Tesseract.js (in-browser) → /ocr-clean API → Review → Save
 */

import { useState, useRef, useCallback } from "react";
import { Camera, Upload, Loader2, CheckCircle, XCircle, RefreshCcw, Save } from "lucide-react";
import { createWorker } from "tesseract.js";
import { cleanOCR, type OCRResponse } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

type ScanStage = "idle" | "capturing" | "processing" | "reviewing";

interface ExtractedRecord {
    vaccineName: string;
    vaccineCode: string;
    dateGiven: string;
    centerName: string;
    confidence: number;
    rawLine: string;
    accepted: boolean;
}

export default function OCRScanner() {
    const [stage, setStage] = useState<ScanStage>("idle");
    const [previewSrc, setPreviewSrc] = useState<string | null>(null);
    const [rawText, setRawText] = useState("");
    const [records, setRecords] = useState<ExtractedRecord[]>([]);
    const [unmatched, setUnmatched] = useState<string[]>([]);
    const [ocrProgress, setOcrProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Handle file/camera selection ─────────────────────────────────────────
    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Show preview
        const reader = new FileReader();
        reader.onload = () => setPreviewSrc(reader.result as string);
        reader.readAsDataURL(file);

        setStage("processing");
        setError(null);
        setOcrProgress(0);

        try {
            // Step 1: Run Tesseract.js in-browser
            const worker = await createWorker("eng", 1, {
                logger: (m) => {
                    if (m.status === "recognizing text") {
                        setOcrProgress(Math.round(m.progress * 100));
                    }
                },
            });

            const { data } = await worker.recognize(file);
            const text = data.text;
            setRawText(text);
            await worker.terminate();

            // Step 2: Send to backend for NLP cleaning
            const result: OCRResponse = await cleanOCR(text);

            setRecords(
                result.extracted_records.map((r) => ({
                    ...r,
                    accepted: r.confidence >= 0.80,
                }))
            );
            setUnmatched(result.unmatched_lines);
            setStage("reviewing");
        } catch (err: any) {
            console.error("OCR failed", err);
            setError(err.message || "OCR processing failed. Please try again.");
            setStage("idle");
        }
    }, []);

    // ── Toggle acceptance of a record ────────────────────────────────────────
    const toggleRecord = (index: number) => {
        setRecords((prev) =>
            prev.map((r, i) => (i === index ? { ...r, accepted: !r.accepted } : r))
        );
    };

    // ── Reset scanner ────────────────────────────────────────────────────────
    const reset = () => {
        setStage("idle");
        setPreviewSrc(null);
        setRawText("");
        setRecords([]);
        setUnmatched([]);
        setError(null);
        setOcrProgress(0);
    };

    // ── Save accepted records ────────────────────────────────────────────────
    const handleSave = () => {
        const accepted = records.filter((r) => r.accepted);
        // In production: call Firebase to save these vaccine records
        console.log("Saving accepted records:", accepted);
        alert(`${accepted.length} records saved successfully!`);
        reset();
    };

    return (
        <div className="space-y-8">
            {/* Idle State: Upload prompt */}
            {stage === "idle" && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-900 border-2 border-dashed border-white/10 rounded-[2.5rem] p-12 flex flex-col items-center text-center hover:border-blue-500/30 transition-all cursor-pointer group"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="w-20 h-20 bg-blue-600/10 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <Camera className="w-10 h-10 text-blue-400" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">Tap to Scan Card</h3>
                    <p className="text-slate-400 max-w-sm">
                        Take a photo of the vaccination card or upload an existing image.
                        Our AI will extract vaccine records automatically.
                    </p>

                    <div className="flex items-center gap-4 mt-8">
                        <button className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all">
                            <Camera className="w-5 h-5" /> Take Photo
                        </button>
                        <button className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-2xl font-bold flex items-center gap-2 border border-white/10 transition-all">
                            <Upload className="w-5 h-5" /> Upload File
                        </button>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                </motion.div>
            )}

            {/* Error State */}
            {error && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-3">
                    <XCircle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                    <button onClick={reset} className="ml-auto font-bold text-sm hover:text-rose-300">
                        Retry
                    </button>
                </div>
            )}

            {/* Processing State */}
            {stage === "processing" && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-12 flex flex-col items-center"
                >
                    {previewSrc && (
                        <img
                            src={previewSrc}
                            alt="Scanned card"
                            className="w-64 h-auto rounded-2xl border border-white/10 mb-8 shadow-2xl"
                        />
                    )}
                    <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
                    <h3 className="text-xl font-bold mb-2">Processing Card...</h3>
                    <p className="text-slate-400 text-sm mb-4">Running Tesseract.js OCR in your browser</p>

                    {/* Progress bar */}
                    <div className="w-64 h-2 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-blue-500"
                            animate={{ width: `${ocrProgress}%` }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>
                    <span className="text-xs text-slate-500 mt-2">{ocrProgress}% complete</span>
                </motion.div>
            )}

            {/* Review State */}
            {stage === "reviewing" && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                >
                    {/* Preview + Raw Text */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {previewSrc && (
                            <div className="bg-slate-900 border border-white/10 rounded-3xl p-4 overflow-hidden">
                                <img
                                    src={previewSrc}
                                    alt="Scanned card"
                                    className="w-full rounded-2xl"
                                />
                            </div>
                        )}
                        <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Raw OCR Text</h4>
                            <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
                                {rawText || "No text detected."}
                            </pre>
                        </div>
                    </div>

                    {/* Extracted Records */}
                    <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold">Extracted Records ({records.length})</h3>
                            <span className="text-xs text-slate-500 font-bold">
                                {records.filter((r) => r.accepted).length} accepted
                            </span>
                        </div>

                        <AnimatePresence>
                            {records.length > 0 ? (
                                <div className="space-y-3">
                                    {records.map((rec, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            onClick={() => toggleRecord(i)}
                                            className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border ${rec.accepted
                                                    ? "bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10"
                                                    : "bg-white/5 border-white/10 hover:bg-white/10 opacity-60"
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                {rec.accepted ? (
                                                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                                                ) : (
                                                    <XCircle className="w-5 h-5 text-slate-600 shrink-0" />
                                                )}
                                                <div>
                                                    <div className="font-bold">{rec.vaccineName}</div>
                                                    <div className="text-xs text-slate-500 flex items-center gap-2">
                                                        <span>{rec.vaccineCode}</span>
                                                        {rec.dateGiven && (
                                                            <>
                                                                <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                                                <span>{rec.dateGiven}</span>
                                                            </>
                                                        )}
                                                        {rec.centerName && (
                                                            <>
                                                                <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                                                <span>{rec.centerName}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${rec.confidence >= 0.80
                                                    ? "bg-emerald-500/10 text-emerald-400"
                                                    : rec.confidence >= 0.65
                                                        ? "bg-amber-500/10 text-amber-400"
                                                        : "bg-rose-500/10 text-rose-400"
                                                }`}>
                                                {Math.round(rec.confidence * 100)}%
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-slate-500 py-8">
                                    No vaccine records could be extracted. Try a clearer photo.
                                </div>
                            )}
                        </AnimatePresence>

                        {/* Unmatched lines */}
                        {unmatched.length > 0 && (
                            <div className="mt-6 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-2">
                                    Unmatched Lines ({unmatched.length})
                                </h4>
                                <div className="text-xs text-slate-500 space-y-1 font-mono">
                                    {unmatched.map((line, i) => (
                                        <div key={i}>• {line}</div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleSave}
                            disabled={records.filter((r) => r.accepted).length === 0}
                            className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-600/20"
                        >
                            <Save className="w-5 h-5" />
                            Save {records.filter((r) => r.accepted).length} Records
                        </button>
                        <button
                            onClick={reset}
                            className="py-4 px-6 bg-white/5 hover:bg-white/10 rounded-2xl font-bold flex items-center gap-2 border border-white/10 transition-all"
                        >
                            <RefreshCcw className="w-5 h-5" />
                            Rescan
                        </button>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
