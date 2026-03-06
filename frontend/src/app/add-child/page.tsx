"use client";
// frontend/app/add-child/page.tsx
// ------------------------------
// Add a new family member.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Calendar, MapPin, Save, Info } from "lucide-react";
import { addChild, auth } from "@/lib/firebase";
import Nav from "@/components/Nav";

export default function AddChildPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [language, setLanguage] = useState("en");
    const [formData, setFormData] = useState({
        name: "",
        ageMonths: "",
        gender: "Male",
        state: "Maharashtra",
        district: "Mumbai",
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth.currentUser) return;

        setLoading(true);
        try {
            await addChild(auth.currentUser.uid, {
                ...formData,
                ageMonths: parseInt(formData.ageMonths),
                riskScore: 0,
                nextDueVaccine: "BCG",
                nextDueDate: new Date().toISOString().split("T")[0],
            });
            router.push("/dashboard");
        } catch (err) {
            console.error("Failed to add child:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-shell">
            <Nav language={language} onLanguageChange={setLanguage} />

            <main className="page-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "3rem" }}>

                <div style={{ width: "100%", maxWidth: "540px" }} className="fade-up">
                    <button onClick={() => router.back()} className="btn-ghost" style={{ marginBottom: "1.5rem", padding: "0" }}>
                        <ArrowLeft size={16} /> Back
                    </button>

                    <h1 className="headline" style={{ marginBottom: "0.5rem" }}>Register Family Member</h1>
                    <p style={{ color: "var(--ink-3)", marginBottom: "2.5rem" }}>
                        Add a child to start tracking their immunization status with AI-powered risk modeling.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="card" style={{ padding: "2rem" }}>
                            <div className="space-y-4">
                                <div>
                                    <label className="label" style={{ marginBottom: "8px", display: "block" }}>Full Name</label>
                                    <div style={{ position: "relative" }}>
                                        <User size={16} style={{ position: "absolute", left: "12px", top: "14px", color: "var(--ink-4)" }} />
                                        <input
                                            required
                                            className="input"
                                            style={{ paddingLeft: "36px" }}
                                            placeholder="e.g. Rahul Sharma"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                    <div>
                                        <label className="label" style={{ marginBottom: "8px", display: "block" }}>Age (Months)</label>
                                        <div style={{ position: "relative" }}>
                                            <Calendar size={16} style={{ position: "absolute", left: "12px", top: "14px", color: "var(--ink-4)" }} />
                                            <input
                                                required
                                                type="number"
                                                className="input"
                                                style={{ paddingLeft: "36px" }}
                                                placeholder="Months"
                                                value={formData.ageMonths}
                                                onChange={e => setFormData({ ...formData, ageMonths: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="label" style={{ marginBottom: "8px", display: "block" }}>Gender</label>
                                        <select
                                            className="input"
                                            value={formData.gender}
                                            onChange={e => setFormData({ ...formData, gender: e.target.value })}
                                        >
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                    <div>
                                        <label className="label" style={{ marginBottom: "8px", display: "block" }}>State</label>
                                        <input
                                            required
                                            className="input"
                                            placeholder="e.g. Maharashtra"
                                            value={formData.state}
                                            onChange={e => setFormData({ ...formData, state: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="label" style={{ marginBottom: "8px", display: "block" }}>District</label>
                                        <div style={{ position: "relative" }}>
                                            <MapPin size={16} style={{ position: "absolute", left: "12px", top: "14px", color: "var(--ink-4)" }} />
                                            <input
                                                required
                                                className="input"
                                                style={{ paddingLeft: "36px" }}
                                                placeholder="e.g. Mumbai"
                                                value={formData.district}
                                                onChange={e => setFormData({ ...formData, district: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: "2rem", display: "flex", gap: "12px", background: "var(--surface)", padding: "12px", borderRadius: "10px" }}>
                                <Info size={16} style={{ marginTop: "2px", color: "var(--ink-3)" }} />
                                <p style={{ fontSize: "0.75rem", color: "var(--ink-4)", lineHeight: 1.6 }}>
                                    Automated risk scores will be calculated using WHO/IAP schedules upon registration.
                                </p>
                            </div>
                        </div>

                        <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "14px" }} disabled={loading}>
                            {loading ? <div className="spinner" style={{ width: "18px", height: "18px" }} /> : <Save size={18} />}
                            {loading ? "Registering..." : "Add Family Member"}
                        </button>
                    </form>
                </div>

            </main>
        </div>
    );
}
