"use client";
// frontend/app/dashboard/page.tsx
// ------------------------------
// Main parent dashboard. Shows all children, their risk scores, and quick actions.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, logOut, subscribeToChildren, auth, db } from "@/lib/firebase";
import Nav from "@/components/Nav";
import RiskScoreCard from "@/components/RiskScoreCard";
import {
    Plus, LayoutGrid, Map as MapIcon, Scan, Activity, ArrowRight,
    Shield, Bell, Settings, LogOut as LogOutIcon, ChevronRight,
    AlertTriangle, CheckCircle, Clock, Globe, Smartphone,
    ChevronDown, ChevronUp, BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getImmunityStatus, getNextDueVaccine } from '@/lib/immunityStatus';

export default function Dashboard() {
    const [user, setUser] = useState<any>({ displayName: "Demo User", email: "demo@janvax.in" });
    const [children, setChildren] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [language, setLanguage] = useState("en");
    const [expanded, setExpanded] = useState<string | null>(null);
    const router = useRouter();

    const STATUS_CONFIG: Record<string, any> = {
        green: { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500 text-white', label: 'Up to date', text: 'text-emerald-700' },
        yellow: { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500 text-slate-900', label: 'Due soon', text: 'text-amber-700' },
        red: { bg: 'bg-rose-50', border: 'border-rose-200', dot: 'bg-rose-500 text-white', label: 'Overdue', text: 'text-rose-700' },
        unknown: { bg: 'bg-slate-50', border: 'border-slate-200', dot: 'bg-slate-500 text-white', label: 'No data', text: 'text-slate-700' },
    };

    useEffect(() => {
        // demo mode bypass
        if (typeof window !== "undefined" && localStorage.getItem("janvax_demo_mode") === "true") {
            const unsubscribeChildren = subscribeToChildren("demo", (data) => {
                setChildren(data);
                setLoading(false);
            });
            return () => unsubscribeChildren();
        }

        // Safety timeout: if auth/data takes > 5s, show the dashboard anyway
        const timer = setTimeout(() => {
            setLoading(false);
        }, 5000);

        const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                try {
                    const unsubscribeChildren = subscribeToChildren(firebaseUser.uid, (data) => {
                        setChildren(data);
                        setLoading(false);
                        clearTimeout(timer);
                    });

                    // Register Web Push Notifications (From Friend's Code)
                    if ('serviceWorker' in navigator && 'PushManager' in window && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
                        navigator.serviceWorker.register('/sw.js').then(async reg => {
                            const permission = await Notification.requestPermission();
                            if (permission !== 'granted') return;
                            try {
                                const sub = await reg.pushManager.subscribe({
                                    userVisibleOnly: true,
                                    applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
                                });
                                // Save subscription to backend so it can push later
                                await fetch('http://localhost:8000/reminders/subscribe', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ subscription: sub, userId: firebaseUser.uid })
                                }).catch(() => console.log("Backend sync failed"));
                            } catch (e) {
                                console.log("Push subscription failed", e);
                            }
                        });
                    }

                    return () => {
                        unsubscribeChildren();
                        clearTimeout(timer);
                    }
                } catch (err) {
                    console.error("Firestore error:", err);
                    setLoading(false);
                    clearTimeout(timer);
                }
            } else {
                router.push("/");
                clearTimeout(timer);
            }
        });
        return () => {
            unsubscribeAuth();
            clearTimeout(timer);
        };
    }, [router]);

    if (loading) {
        return (
            <div className="page-shell">
                <Nav language={language} onLanguageChange={setLanguage} />
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    // Derived stats
    const highRiskCount = children.filter(c => (c.riskScore || 0) >= 70).length;
    const dueSoonCount = children.filter(c => (c.riskScore || 0) >= 40 && (c.riskScore || 0) < 70).length;

    return (
        <div className="page-shell">
            <Nav language={language} onLanguageChange={setLanguage} />

            <main className="page-content" style={{ paddingTop: "2.5rem", paddingBottom: "4rem" }}>

                {/* Header section */}
                <header style={{ marginBottom: "2.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
                    <div className="fade-up">
                        <h1 className="headline" style={{ marginBottom: "0.5rem" }}>Family Health Vault</h1>
                        <p style={{ color: "var(--ink-3)", fontSize: "0.9375rem" }}>
                            Welcome back, {user?.displayName?.split(" ")[0] || "Parent"}. All records are blockchain-verified.
                        </p>
                    </div>
                    <button
                        onClick={() => router.push("/child/add")}
                        className="btn-primary fade-up fade-up-1"
                    >
                        <Plus size={18} />
                        Add Family Member
                    </button>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 fade-up fade-up-2">
                    <div className="card-flat" style={{ borderLeft: "4px solid var(--green)" }}>
                        <p className="label" style={{ marginBottom: "8px" }}>Status</p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                            <span style={{ fontSize: "1.75rem", fontWeight: 600 }}>{children.length}</span>
                            <span style={{ fontSize: "0.875rem", color: "var(--ink-4)" }}>Total Protected</span>
                        </div>
                    </div>
                    <div className="card-flat" style={{ borderLeft: `4px solid ${highRiskCount > 0 ? 'var(--risk-high)' : 'var(--border)'}` }}>
                        <p className="label" style={{ marginBottom: "8px" }}>Critical Risk</p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                            <span style={{ fontSize: "1.75rem", fontWeight: 600, color: highRiskCount > 0 ? "var(--risk-high)" : "inherit" }}>
                                {highRiskCount}
                            </span>
                            <span style={{ fontSize: "0.875rem", color: "var(--ink-4)" }}>Needs Attention</span>
                        </div>
                    </div>
                    <div className="card-flat" style={{ borderLeft: `4px solid ${dueSoonCount > 0 ? 'var(--risk-medium)' : 'var(--border)'}` }}>
                        <p className="label" style={{ marginBottom: "8px" }}>Due Soon</p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                            <span style={{ fontSize: "1.75rem", fontWeight: 600, color: dueSoonCount > 0 ? "var(--risk-medium)" : "inherit" }}>
                                {dueSoonCount}
                            </span>
                            <span style={{ fontSize: "0.875rem", color: "var(--ink-4)" }}>Upcoming Doses</span>
                        </div>
                    </div>
                </div>

                {/* Children List */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <AnimatePresence>
                        {children.length > 0 ? (
                            children.map((child) => {
                                const status = getImmunityStatus(child);
                                const nextDue = getNextDueVaccine(child);
                                const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
                                const isOpen = expanded === child.id;

                                return (
                                    <motion.div
                                        key={child.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className={`rounded-[2rem] border-2 ${cfg.border} ${cfg.bg} shadow-sm overflow-hidden transition-all`}
                                    >
                                        {/* Card header — always visible */}
                                        <div className='flex items-center gap-6 p-8 cursor-pointer' onClick={() => setExpanded(isOpen ? null : child.id)}>
                                            <div className={`w-16 h-16 rounded-2xl ${cfg.dot} flex items-center justify-center font-bold text-2xl shadow-lg`}>
                                                {child.name?.[0]?.toUpperCase()}
                                            </div>
                                            <div className='flex-1'>
                                                <h3 className='font-bold text-slate-800 text-2xl'>{child.name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-bold uppercase tracking-wider border border-white/5 ${cfg.text}`}>{cfg.label}</span>
                                                </div>
                                                {nextDue && (
                                                    <p className='text-sm text-slate-400 mt-2 font-medium'>
                                                        Next: <span className="text-white">{nextDue.name}</span>
                                                        {nextDue.daysUntil < 0
                                                            ? <span className="text-rose-400"> — {Math.abs(nextDue.daysUntil)} days overdue</span>
                                                            : ` — in ${nextDue.daysUntil} days`}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-slate-500">
                                                {isOpen ? <ChevronUp className="w-8 h-8" /> : <ChevronDown className="w-8 h-8" />}
                                            </div>
                                        </div>

                                        {/* Expanded vaccine history */}
                                        <AnimatePresence>
                                            {isOpen && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className='border-t border-white/10 p-8'>
                                                        <p className='font-bold text-slate-300 mb-4 uppercase text-xs tracking-widest'>Vaccination History</p>
                                                        {(child.vaccines || []).length === 0 ? (
                                                            <p className='text-slate-500 text-sm'>No vaccines recorded yet.</p>
                                                        ) : (
                                                            <div className='space-y-3 mb-8'>
                                                                {child.vaccines.map((v: any, i: number) => (
                                                                    <div key={i} className='flex justify-between items-center bg-white/5 rounded-xl px-4 py-3 text-sm border border-white/5'>
                                                                        <span className='font-bold text-slate-200'>{v.name}</span>
                                                                        <div className="flex items-center gap-4">
                                                                            <span className='text-slate-400 font-medium'>{v.givenDate}</span>
                                                                            <CheckCircle className='w-5 h-5 text-emerald-500' />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <div className='flex flex-col sm:flex-row gap-4'>
                                                            <button onClick={() => router.push(`/child/${child.id}`)} className='flex-1 py-4 bg-blue-600 hover:bg-blue-500 transition-colors text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20'>
                                                                View Full Auto-Extracted Record
                                                            </button>
                                                            <button onClick={() => router.push(`/roadmap?dob=${child.dateOfBirth}`)} className='flex-1 py-4 border-2 border-slate-600 hover:border-slate-400 hover:text-white transition-colors text-slate-300 rounded-xl text-sm font-bold'>
                                                                See Personalized Roadmap
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                );
                            })
                        ) : (
                            <div className="col-span-1 lg:col-span-2 py-20 bg-slate-900/50 border-2 border-dashed border-white/10 rounded-[3rem] flex flex-col items-center justify-center text-center">
                                <div className="bg-blue-600/10 p-6 rounded-full mb-6">
                                    <Plus className="w-12 h-12 text-blue-500" />
                                </div>
                                <p style={{ color: "var(--ink-3)", marginBottom: "1.5rem" }}>No family members added yet.</p>
                                <button onClick={() => router.push("/child/add")} className="btn-secondary">Add your first child</button>
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Global Features Section */}
                <div className="mt-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                                Open Map <ChevronRight className="w-4 h-4" />
                            </div>
                        </div>
                    </div>

                    <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-rose-600/20 to-orange-600/20 border border-white/10 group cursor-pointer" onClick={() => router.push("/scan")}>
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

                    <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-purple-600/20 to-fuchsia-600/20 border border-white/10 group cursor-pointer" onClick={() => router.push("/glossary")}>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-4 bg-purple-500 rounded-3xl group-hover:scale-110 transition-transform shadow-lg shadow-purple-500/20">
                                <BookOpen className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold">AI Glossary</h3>
                                <p className="text-slate-400 text-sm">Translations & simple explanations</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end">
                            <div className="px-4 py-2 bg-white/10 rounded-xl text-sm font-bold flex items-center gap-2 group-hover:bg-white/20 transition-all">
                                Open Glossary <ChevronRight className="w-4 h-4" />
                            </div>
                        </div>
                    </div>

                    <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-white/10 group cursor-pointer" onClick={() => router.push("/explainability")}>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-4 bg-emerald-500 rounded-3xl group-hover:scale-110 transition-transform shadow-lg shadow-emerald-500/20">
                                <Activity className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold">Explainability</h3>
                                <p className="text-slate-400 text-sm">SHAP heatmap & risk stratification</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end">
                            <div className="px-4 py-2 bg-white/10 rounded-xl text-sm font-bold flex items-center gap-2 group-hover:bg-white/20 transition-all">
                                View XAI <ChevronRight className="w-4 h-4" />
                            </div>
                        </div>
                    </div>

                    <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-white/10 group cursor-pointer" onClick={() => router.push("/verify")}>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-4 bg-blue-500 rounded-3xl group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/20">
                                <Shield className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold">Blockchain Verifier</h3>
                                <p className="text-slate-400 text-sm">Check authenticity of any record</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end">
                            <div className="px-4 py-2 bg-white/10 rounded-xl text-sm font-bold flex items-center gap-2 group-hover:bg-white/20 transition-all">
                                Verify Record <ChevronRight className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
