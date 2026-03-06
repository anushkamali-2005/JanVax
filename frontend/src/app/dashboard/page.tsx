"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Plus, Bell, Settings, LogOut, ChevronRight, AlertTriangle, CheckCircle, Clock, Globe, Smartphone, ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import { onAuthStateChanged, logOut, subscribeToChildren, db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";
import { getImmunityStatus, getNextDueVaccine } from '@/lib/immunityStatus';

export default function Dashboard() {
    const [user, setUser] = useState<any>({ displayName: "Demo User", email: "demo@janvax.in" });
    const [children, setChildren] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const router = useRouter();

    const STATUS_CONFIG: Record<string, any> = {
        green: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-500 text-white', label: 'Up to date', text: 'text-emerald-400' },
        yellow: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', dot: 'bg-amber-500 text-slate-900', label: 'Due soon', text: 'text-amber-400' },
        red: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', dot: 'bg-rose-500 text-white', label: 'Overdue', text: 'text-rose-400' },
        unknown: { bg: 'bg-white/5', border: 'border-white/10', dot: 'bg-slate-500 text-white', label: 'No data', text: 'text-slate-400' },
    };

    useEffect(() => {
        // Try Firebase in background — upgrades from demo to real user if signed in
        try {
            const unsubscribeAuth = onAuthStateChanged((firebaseUser) => {
                if (firebaseUser) {
                    setUser(firebaseUser);
                    const unsubscribeChildren = subscribeToChildren(firebaseUser.uid, (data) => {
                        setChildren(data);
                    });

                    // Register Web Push Notifications
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

                    return () => unsubscribeChildren();
                }
            });
            return () => unsubscribeAuth();
        } catch (e) {
            // Firebase unavailable — demo mode continues
        }
    }, [router]);

    const handleLogout = async () => {
        await logOut();
        router.push("/");
    };

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

                {/* ── Vaccine Roadmap Entry Banner ── */}
                <button
                    onClick={() => router.push('/roadmap')}
                    className='w-full bg-gradient-to-r from-blue-700 to-blue-900 border border-blue-600/50 text-white rounded-3xl p-6 md:p-8 mb-8 text-left shadow-2xl hover:shadow-blue-900/40 hover:-translate-y-1 transition-all group overflow-hidden relative'
                >
                    <div className='absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-blue-500/20 to-transparent pointer-events-none' />
                    <div className='flex items-center gap-6 relative z-10'>
                        <div className='bg-white/10 p-4 rounded-2xl shadow-inner'>
                            <span className='text-4xl'>💉</span>
                        </div>
                        <div className='flex-1'>
                            <h2 className='text-2xl font-black tracking-tight'>Get Your Child Vaccinated</h2>
                            <p className='text-blue-200 text-sm md:text-base mt-1 font-medium max-w-2xl'>
                                See your child's complete vaccination roadmap — from birth to 5 years. Know exactly what's due today.
                            </p>
                        </div>
                        <div className='hidden md:flex items-center justify-center w-12 h-12 rounded-full bg-white/10 group-hover:bg-white group-hover:text-blue-900 transition-colors'>
                            <ChevronRight className='w-6 h-6' />
                        </div>
                    </div>
                </button>

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
                                                <h3 className='font-bold text-white text-2xl'>{child.name}</h3>
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
                <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
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
                </div>
            </main>
        </div>
    );
}
