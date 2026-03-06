"use client";

import React, { useState, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import Tesseract from "tesseract.js";
import { Camera, CheckCircle2, Loader2, Upload, X } from "lucide-react";

interface OCRScannerProps {
    childId: string;
    onSaved: () => void;
}

export default function OCRScanner({ childId, onSaved }: OCRScannerProps) {
    const webcamRef = useRef<Webcam>(null);
    const [image, setImage] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [extractedData, setExtractedData] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadMode, setUploadMode] = useState(false);

    // Capture from Webcam
    const capture = useCallback(() => {
        if (webcamRef.current) {
            const imageSrc = webcamRef.current.getScreenshot();
            setImage(imageSrc);
            processImage(imageSrc);
        }
    }, [webcamRef]);

    // Handle File Upload
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result as string;
                setImage(base64data);
                processImage(base64data);
            };
            reader.readAsDataURL(file);
        }
    };

    // Run Tesseract OCR in Browser, then send to backend NLP
    const processImage = async (imgSrc: string | null) => {
        if (!imgSrc) return;
        setIsScanning(true);
        setError(null);
        setExtractedData(null);
        setScanProgress(0);

        try {
            // 1. Client-side OCR with Tesseract
            const result = await Tesseract.recognize(imgSrc, "eng", {
                logger: (m) => {
                    if (m.status === "recognizing text") {
                        setScanProgress(Math.round(m.progress * 100));
                    }
                },
            });

            const rawText = result.data.text;

            if (rawText.trim().length < 10) {
                throw new Error("Could not read enough text. Try a clearer image.");
            }

            // 2. Send Raw Text to Backend for spaCy NLP extraction
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
            const response = await fetch(`${apiUrl}/ocr-clean`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ raw_text: rawText }),
            });

            if (!response.ok) {
                throw new Error("Failed to process data securely.");
            }

            const cleanData = await response.json();
            setExtractedData(cleanData.extracted_entities);

        } catch (err: any) {
            setError(err.message || "An error occurred during scanning. Please try again.");
            setImage(null);
        } finally {
            setIsScanning(false);
        }
    };

    const handleSave = () => {
        // In a real app we would merge this data into Firebase here
        onSaved();
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden">
            <div className="p-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface)]">
                <h2 className="font-semibold text-[var(--ink-1)]">Vaccine Card Scanner</h2>
                {!image && (
                    <button
                        onClick={() => setUploadMode(!uploadMode)}
                        className="text-xs font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] flex items-center gap-1"
                    >
                        {uploadMode ? <Camera size={14} /> : <Upload size={14} />}
                        {uploadMode ? "Use Camera" : "Upload File"}
                    </button>
                )}
            </div>

            <div className="p-6">
                {/* STATE 1: CAMERA OR UPLOAD READY */}
                {!image && !uploadMode && (
                    <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
                        <Webcam
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            videoConstraints={{ facingMode: "environment" }}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 pointer-events-none border-2 border-white/20 rounded-xl m-4 border-dashed" />
                    </div>
                )}

                {!image && uploadMode && (
                    <div className="aspect-video border-2 border-dashed border-[var(--border)] rounded-xl flex flex-col items-center justify-center bg-[var(--surface)] p-6 text-center">
                        <Upload size={32} className="text-[var(--ink-3)] mb-4" />
                        <p className="text-sm font-medium text-[var(--ink-1)] mb-1">Upload Card Image</p>
                        <p className="text-xs text-[var(--ink-3)] mb-4">JPEG, PNG up to 10MB</p>
                        <label className="btn-primary cursor-pointer text-sm py-2 px-4 shadow-none">
                            Select File
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                        </label>
                    </div>
                )}

                {/* STATE 2: IMAGE CAPTURED & SCANNING */}
                {image && isScanning && (
                    <div className="relative rounded-xl overflow-hidden aspect-video border border-[var(--border)]">
                        <img src={image} alt="Captured" className="w-full h-full object-cover opacity-50 grayscale" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white">
                            <Loader2 className="animate-spin mb-4" size={32} />
                            <p className="font-medium text-sm tracking-wide">ANALYZING TEXT</p>
                            <div className="w-48 h-1.5 bg-white/20 rounded-full mt-4 overflow-hidden">
                                <div
                                    className="h-full bg-[var(--blue)] transition-all duration-300"
                                    style={{ width: `${scanProgress}%` }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* STATE 3: RESULTS EXTRACTED */}
                {image && !isScanning && extractedData && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-3 mb-6 p-4 rounded-xl bg-green-50/50 border border-green-100">
                            <CheckCircle2 className="text-[var(--green)]" size={24} />
                            <div>
                                <h3 className="font-semibold text-[var(--ink-1)]">Scan Complete</h3>
                                <p className="text-sm text-[var(--ink-3)]">Review extracted details below</p>
                            </div>
                        </div>

                        <div className="space-y-4 mb-8">
                            {Object.entries(extractedData).map(([key, value]: [string, any]) => {
                                // Skip empty arrays from NLP extraction
                                if (Array.isArray(value) && value.length === 0) return null;

                                return (
                                    <div key={key} className="flex justify-between items-center py-3 border-b border-[var(--border)] last:border-0">
                                        <span className="text-sm font-medium text-[var(--ink-3)] capitalize">
                                            {key.replace(/_/g, " ")}
                                        </span>
                                        <span className="text-sm font-semibold text-[var(--ink-1)] text-right">
                                            {Array.isArray(value) ? value.join(", ") : value}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* STATE 4: ERROR */}
                {error && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 mt-4 text-center flex flex-col items-center">
                        <AlertCircle className="mb-2" size={24} />
                        <p className="font-medium">{error}</p>
                    </div>
                )}
            </div>

            {/* ACTION FOOTER */}
            <div className="bg-[var(--surface)] p-6 border-t border-[var(--border)] flex gap-3">
                {(!image || error) ? (
                    <button
                        onClick={capture}
                        className="btn-primary w-full flex justify-center items-center gap-2"
                        disabled={uploadMode}
                    >
                        <Camera size={18} />
                        Capture Record
                    </button>
                ) : (
                    <>
                        <button
                            onClick={() => { setImage(null); setExtractedData(null); setError(null); }}
                            className="px-6 py-3 rounded-xl border border-[var(--border)] font-medium text-[var(--ink-2)] hover:bg-[var(--border)] transition-colors w-1/3"
                            disabled={isScanning}
                        >
                            Retake
                        </button>
                        <button
                            onClick={handleSave}
                            className="btn-primary flex-1 shadow-md shadow-blue-500/20"
                            disabled={isScanning || !extractedData}
                        >
                            Import to Profile
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
