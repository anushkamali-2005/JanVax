"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Plus, Bell, Settings, LogOut, ChevronRight, AlertTriangle, CheckCircle, Clock, Globe, Smartphone } from "lucide-react";
import { onAuthStateChanged, logOut, subscribeToChildren, db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
    const [user, setUser] = useState<any>(null);
    const [children, setChildren] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged((user) => {
            if (!user) {
                router.push("/");
                return;
            }
            setUser(user);

            const unsubscribeChildren = subscribeToChildren(user.uid, (data) => {
                setChildren(data);
                setLoading(false);
            });

            return () => unsubscribeChildren();
        });

        return () => unsubscribeAuth();
    }, [router]);

    const handleLogout = async () => {
        await logOut();
        router.push("/");
    };

    if (loading) return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0f172a] text-white">
            {/* Sidebar / Nav */}
            <nav className="border-b border-white/10 px-8 py-4 flex items-center justify-between bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push("/")}>
                        <div className="bg-blue-600 p-1.5 rounded-lg">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight">JanVax</span>
                    </div>

                    <div className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                        <button className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-semibold shadow-lg shadow-blue-600/20">Dashboard</button>
                        <button className="px-4 py-2 hover:bg-white/5 rounded-lg text-sm font-medium text-slate-400 hover:text-white transition-all">Records</button>
                        <button className="px-4 py-2 hover:bg-white/5 rounded-lg text-sm font-medium text-slate-400 hover:text-white transition-all">Map</button>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button className="p-2 hover:bg-white/5 rounded-full relative group">
                        <Bell className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-[#0f172a]"></span>
                    </button>

                    <div className="h-8 w-[1px] bg-white/10 mx-2"></div>

                    <div className="flex items-center gap-3 pl-2 group cursor-pointer">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-bold">{user?.displayName || "Parent"}</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Premium Plan</div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 border-2 border-white/10 shadow-lg flex items-center justify-center text-lg font-bold">
                            {user?.displayName?.[0] || "P"}
                        </div>
                        <button onClick={handleLogout} className="p-2 hover:bg-rose-500/10 rounded-full text-slate-400 hover:text-rose-400 transition-all">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-8 py-10">
                <header className="flex flex-col md:row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <h1 className="text-4xl font-bold mb-2">Family Immunity Vault</h1>
                        <p className="text-slate-400">Manage and track vaccination status for all family members.</p>
                    </div>
                    <button
                        onClick={() => router.push("/add-child")}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 transition-all rounded-2xl font-bold shadow-xl shadow-blue-600/20 w-fit"
                    >
                        <Plus className="w-5 h-5" />
                        Add Family Member
                    </button>
                </header>

                {/* Family Summary Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                    <div className="p-8 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 relative overflow-hidden group">
                        <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                            <CheckCircle className="w-32 h-32" />
                        </div>
                        <div className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-4">Up to Date</div>
                        <div className="text-4xl font-bold text-emerald-400 mb-1">
                            {children.filter(c => (c.riskScore || 0) < 40).length}
                        </div>
                        <div className="text-sm text-emerald-500/70 font-medium">Safe & Protected</div>
                    </div>

                    <div className="p-8 rounded-3xl bg-amber-500/10 border border-amber-500/20 relative overflow-hidden group">
                        <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                            <Clock className="w-32 h-32" />
                        </div>
                        <div className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-4">Due Soon</div>
                        <div className="text-4xl font-bold text-amber-400 mb-1">
                            {children.filter(c => (c.riskScore || 0) >= 40 && (c.riskScore || 0) < 70).length}
                        </div>
                        <div className="text-sm text-amber-500/70 font-medium">Action Required Soon</div>
                    </div>

                    <div className="p-8 rounded-3xl bg-rose-500/10 border border-rose-500/20 relative overflow-hidden group">
                        <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                            <AlertTriangle className="w-32 h-32" />
                        </div>
                        <div className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-4">Critical Risk</div>
                        <div className="text-4xl font-bold text-rose-400 mb-1">
                            {children.filter(c => (c.riskScore || 0) >= 70).length}
                        </div>
                        <div className="text-sm text-rose-500/70 font-medium">Immediate Attention</div>
                    </div>
                </div>

                {/* Children List */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <AnimatePresence>
                        {children.length > 0 ? (
                            children.map((child) => (
                                <motion.div
                                    key={child.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    onClick={() => router.push(`/child/${child.id}`)}
                                    className="bg-slate-900 border border-white/10 rounded-[2rem] p-8 hover:border-blue-500/50 transition-all cursor-pointer group relative overflow-hidden"
                                >
                                    <div className="flex items-start justify-between mb-8">
                                        <div className="flex items-center gap-5">
                                            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${child.gender?.toLowerCase() === 'female' ? 'from-rose-500 to-pink-600' : 'from-blue-500 to-indigo-600'} flex items-center justify-center text-2xl font-bold shadow-lg shadow-black/20`}>
                                                {child.name?.[0]}
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-bold">{child.name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border border-white/5">{child.ageMonths} Months</span>
                                                    <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border border-white/5">{child.gender}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className={`text-3xl font-black ${(child.riskScore || 0) >= 70 ? 'text-rose-500' : (child.riskScore || 0) >= 40 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                {child.riskScore || 0}<span className="text-sm opacity-50 ml-1 font-bold">/100</span>
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Risk Score</div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between group-hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <Clock className="w-5 h-5 text-blue-400" />
                                                <div>
                                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Next Dose Due</div>
                                                    <div className="font-bold">{child.nextDueVaccine || "None Scheduled"}</div>
                                                </div>
                                            </div>
                                            <div className="text-right font-bold text-blue-400">{child.nextDueDate || "N/A"}</div>
                                        </div>

                                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between group-hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <Shield className="w-5 h-5 text-emerald-400" />
                                                <div>
                                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Last Vaccination</div>
                                                    <div className="font-bold">{child.lastVaccine || "N/A"}</div>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-white transition-colors" />
                                        </div>
                                    </div>

                                    {/* Risk Progress Bar */}
                                    <div className="mt-8 h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${child.riskScore || 0}%` }}
                                            transition={{ duration: 1, delay: 0.5 }}
                                            className={`h-full ${(child.riskScore || 0) >= 70 ? 'bg-rose-500' : (child.riskScore || 0) >= 40 ? 'bg-amber-500' : 'bg-emerald-500'} shadow-[0_0_12px_rgba(255,255,255,0.2)]`}
                                        />
                                    </div>
                                </motion.div>
                            ))
                        ) : (
                            <div className="col-span-1 lg:col-span-2 py-20 bg-slate-900/50 border-2 border-dashed border-white/10 rounded-[3rem] flex flex-col items-center justify-center text-center">
                                <div className="bg-blue-600/10 p-6 rounded-full mb-6">
                                    <Plus className="w-12 h-12 text-blue-500" />
                                </div>
                                <h3 className="text-2xl font-bold mb-2">No family members added</h3>
                                <p className="text-slate-400 max-w-xs mb-8">Start by adding your first child or family member to track their health status.</p>
                                <button
                                    onClick={() => router.push("/add-child")}
                                    className="px-8 py-3 bg-blue-600 hover:bg-blue-500 transition-all rounded-2xl font-bold shadow-xl shadow-blue-600/20"
                                >
                                    Add Child Now
                                </button>
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Global Features Section */}
                <div className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-indigo-600/20 to-blue-600/20 border border-white/10 group cursor-pointer" onClick={() => router.push("/map")}>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-4 bg-indigo-500 rounded-3xl group-hover:scale-110 transition-transform shadow-lg shadow-indigo-500/20">
                                <Globe className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold">Vaccination Centers</h3>
                                <p className="text-slate-400 text-sm">Find nearby clinics and stock status</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end">
                            <div className="px-4 py-2 bg-white/10 rounded-xl text-sm font-bold flex items-center gap-2 group-hover:bg-white/20 transition-all">
                                Open Maps <ChevronRight className="w-4 h-4" />
                            </div>
                        </div>
                    </div>

                    <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-rose-600/20 to-orange-600/20 border border-white/10 group cursor-pointer" onClick={() => router.push("/ocr")}>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-4 bg-rose-500 rounded-3xl group-hover:scale-110 transition-transform shadow-lg shadow-rose-500/20">
                                <Smartphone className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold">OCR Card Scanner</h3>
                                <p className="text-slate-400 text-sm">Import records from paper cards</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end">
                            <div className="px-4 py-2 bg-white/10 rounded-xl text-sm font-bold flex items-center gap-2 group-hover:bg-white/20 transition-all">
                                Start Scan <ChevronRight className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
