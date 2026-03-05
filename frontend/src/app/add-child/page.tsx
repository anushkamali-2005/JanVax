"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, ArrowLeft, Save, User as UserIcon, Calendar, Info } from "lucide-react";
import { addChild, getCurrentUser } from "@/lib/firebase";
import { motion } from "framer-motion";

export default function AddChildPage() {
    const [formData, setFormData] = useState({
        name: "",
        ageMonths: "",
        gender: "Male",
        state: "Maharashtra",
        district: "Mumbai",
    });
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const user = getCurrentUser();
        if (!user) return;

        setLoading(true);
        try {
            await addChild(user.uid, {
                ...formData,
                ageMonths: parseInt(formData.ageMonths),
                riskScore: 0,
                nextDueVaccine: "BCG",
                nextDueDate: new Date().toISOString().split('T')[0],
            });
            router.push("/dashboard");
        } catch (err) {
            console.error("Failed to add child", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] text-white">
            <nav className="border-b border-white/10 px-8 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur-md">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    Back to Dashboard
                </button>
                <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-500" />
                    <span className="font-bold">JanVax</span>
                </div>
            </nav>

            <main className="max-w-2xl mx-auto px-6 py-16">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl"
                >
                    <header className="mb-10 text-center">
                        <div className="w-20 h-20 bg-blue-600/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <UserIcon className="w-10 h-10 text-blue-500" />
                        </div>
                        <h1 className="text-3xl font-bold mb-2">Add Family Member</h1>
                        <p className="text-slate-400">Register a child or family member to start tracking their immunization journey.</p>
                    </header>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-400 uppercase tracking-widest pl-2">Full Name</label>
                            <div className="relative">
                                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    required
                                    type="text"
                                    placeholder="Enter name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-600"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-400 uppercase tracking-widest pl-2">Age (Months)</label>
                                <div className="relative">
                                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                    <input
                                        required
                                        type="number"
                                        placeholder="Months"
                                        value={formData.ageMonths}
                                        onChange={(e) => setFormData({ ...formData, ageMonths: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-600"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-400 uppercase tracking-widest pl-2">Gender</label>
                                <select
                                    value={formData.gender}
                                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 focus:border-blue-500 focus:outline-none transition-all appearance-none"
                                >
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-400 uppercase tracking-widest pl-2">State</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="State"
                                    value={formData.state}
                                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 focus:border-blue-500 focus:outline-none transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-400 uppercase tracking-widest pl-2">District</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="District"
                                    value={formData.district}
                                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 focus:border-blue-500 focus:outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-3 mb-8">
                                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    Initial risk score will be calculated based on WHO/IAP standard schedules. You can update records via OCR scanning later.
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-all rounded-2xl font-bold text-lg shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3"
                            >
                                {loading ? "Registering..." : (
                                    <>
                                        <Save className="w-6 h-6" />
                                        Complete Registration
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </main>
        </div>
    );
}
