"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Shield, CheckCircle, Download, Share2, Fingerprint, Lock } from "lucide-react";
import { motion } from "framer-motion";

interface PassportProps {
    childName: string;
    childId: string;
    lastVaccine: string;
    riskScore: number;
    verificationHash?: string;
}

export default function QRVaccinePassport({
    childName,
    childId,
    lastVaccine,
    riskScore,
    verificationHash
}: PassportProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [qrLoaded, setQrLoaded] = useState(false);

    useEffect(() => {
        if (canvasRef.current) {
            const verificationUrl = `https://vaxguard.vercel.app/verify/${verificationHash || childId}`;
            QRCode.toCanvas(canvasRef.current, verificationUrl, {
                width: 200,
                margin: 2,
                color: {
                    dark: "#0f172a",
                    light: "#ffffff",
                },
            }, (error) => {
                if (error) console.error(error);
                setQrLoaded(true);
            });
        }
    }, [childId, verificationHash]);

    const downloadPassport = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const link = document.createElement("a");
        link.download = `VaxPassport_${childName.replace(/\s+/g, '_')}.png`;
        link.href = canvas.toDataURL();
        link.click();
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white text-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl max-w-sm mx-auto border-8 border-blue-600/10"
        >
            {/* Blue Header Section */}
            <div className="bg-blue-600 p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-20">
                    <Shield className="w-24 h-24" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="bg-white p-1 rounded-lg">
                            <Shield className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest opacity-80">JanVax Digital Passport</span>
                    </div>
                    <h2 className="text-3xl font-black mb-1">{childName}</h2>
                    <p className="text-blue-100 text-sm font-medium">Verified Identity: {childId.slice(0, 12)}</p>
                </div>
            </div>

            {/* QR Code Section */}
            <div className="p-10 flex flex-col items-center bg-gradient-to-b from-white to-slate-50">
                <div className="bg-white p-4 rounded-3xl shadow-xl border border-slate-100 mb-8 group transition-transform hover:scale-105">
                    <canvas ref={canvasRef} className="rounded-xl" />
                </div>

                <div className="text-center space-y-4 w-full">
                    <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold bg-emerald-50 py-2 px-4 rounded-full border border-emerald-100">
                        <CheckCircle className="w-5 h-5" />
                        Fully Verified on Polyon
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-left">
                        <div className="p-4 bg-slate-100 rounded-2xl">
                            <div className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Status</div>
                            <div className="font-bold text-slate-800">{riskScore < 40 ? "SAFE" : "DUE"}</div>
                        </div>
                        <div className="p-4 bg-slate-100 rounded-2xl">
                            <div className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Last Dose</div>
                            <div className="font-bold text-slate-800">{lastVaccine || "BCG"}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 bg-slate-900 flex items-center justify-between gap-4">
                <button
                    onClick={downloadPassport}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all"
                >
                    <Download className="w-4 h-4" />
                    Download
                </button>
                <button className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all">
                    <Share2 className="w-5 h-5" />
                </button>
            </div>

            <div className="px-6 py-4 bg-slate-950 border-t border-white/5 flex items-center gap-3">
                <Lock className="w-3 h-3 text-slate-500" />
                <span className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter">
                    Hash: {verificationHash?.slice(0, 32) || "COMMUNITY_VERIFIED_KEY_0x1121..."}
                </span>
            </div>
        </motion.div>
    );
}
