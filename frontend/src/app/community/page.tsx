"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Globe, Info, AlertTriangle, Shield, CheckCircle } from "lucide-react";
import HerdImmunityMap from "@/components/HerdImmunityMap";
import { motion } from "framer-motion";

export default function CommunityPage() {
    const router = useRouter();

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
                    <Globe className="w-5 h-5 text-blue-500" />
                    <span className="font-bold uppercase tracking-widest text-[10px]">Community Herd Immunity</span>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-6 py-12">
                <div className="grid lg:grid-cols-4 gap-10">

                    {/* Legend and Info */}
                    <div className="lg:col-span-1 space-y-8">
                        <header>
                            <h1 className="text-4xl font-bold mb-4">India Coverage Map</h1>
                            <p className="text-slate-400">
                                Real-time vaccination monitoring by district. We use anonymous user data to predict community risk zones.
                            </p>
                        </header>

                        <div className="bg-slate-900 border border-white/10 rounded-[2rem] p-6 space-y-4">
                            <h3 className="font-bold text-sm uppercase tracking-widest text-slate-500 mb-2">Legend</h3>

                            <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <div className="w-4 h-4 rounded-md bg-rose-500"></div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-rose-400">High Risk Zone</div>
                                    <div className="text-[10px] text-rose-500/70 uppercase font-bold tracking-tighter">Under 70% Coverage</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <div className="w-4 h-4 rounded-md bg-amber-500"></div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-amber-400">Warning Zone</div>
                                    <div className="text-[10px] text-amber-500/70 uppercase font-bold tracking-tighter">70% - 90% Coverage</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <div className="w-4 h-4 rounded-md bg-emerald-500"></div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-emerald-400">Safe Zone</div>
                                    <div className="text-[10px] text-emerald-500/70 uppercase font-bold tracking-tighter">Above 90% Coverage</div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 rounded-[2rem] bg-indigo-600/10 border border-indigo-600/20 flex gap-4">
                            <Info className="w-6 h-6 text-indigo-400 shrink-0" />
                            <p className="text-xs text-slate-400 leading-relaxed">
                                <strong>How it works:</strong> Every time a parent updates their child's record, it's anonymously added to their district's pool. Like Waze, our users are our live data sensors.
                            </p>
                        </div>

                        <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 space-y-4">
                            <h4 className="font-bold text-sm">Active Outbreaks</h4>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors">
                                    <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></div>
                                    <span className="text-sm font-medium">Measles in Mumbai</span>
                                </div>
                                <div className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors">
                                    <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                                    <span className="text-sm font-medium">Polio Warning - Pune</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Map Area */}
                    <div className="lg:col-span-3">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-slate-900 border border-white/10 rounded-[3rem] p-8 min-h-[600px] flex flex-col"
                        >
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h2 className="text-2xl font-bold flex items-center gap-3">
                                        <Shield className="w-6 h-6 text-blue-500" />
                                        Community Dashboard
                                    </h2>
                                    <p className="text-sm text-slate-500">Zoom and hover over districts for detailed metrics</p>
                                </div>
                                <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-400">
                                    Live Updates Active
                                </div>
                            </div>

                            <div className="flex-1 relative bg-black/20 rounded-[2rem] border border-white/5 overflow-hidden">
                                <HerdImmunityMap />
                            </div>
                        </motion.div>
                    </div>
                </div>
            </main>
        </div>
    );
}
