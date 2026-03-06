"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmail, signUpWithEmail } from "@/lib/firebase";
import { ArrowLeft, Mail, Lock } from "lucide-react";

export default function EmailLoginPage() {
    const router = useRouter();
    const [mode, setMode] = useState<"login" | "signup">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setMsg("");
        try {
            if (mode === "signup") {
                await signUpWithEmail(email, password);
                setMsg("Verification email sent! Please check your inbox.");
            } else {
                await signInWithEmail(email, password);
                router.push("/dashboard");
            }
        } catch (err: any) {
            setError(err.message || "Authentication failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <div style={{ width: "100%", maxWidth: "400px", padding: "40px", background: "#fff", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)" }}>
                <button onClick={() => router.push("/")} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#64748b", fontSize: "14px", border: "none", background: "none", cursor: "pointer", marginBottom: "32px" }}>
                    <ArrowLeft size={16} /> Back to standard login
                </button>

                <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>
                    {mode === "login" ? "Sign In" : "Create Account"}
                </h2>
                <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "32px" }}>
                    Manage child records with JanVax secure login.
                </p>

                {error && <div style={{ padding: "12px", background: "#fef2f2", color: "#ef4444", borderRadius: "12px", border: "1px solid #fee2e2", marginBottom: "20px", fontSize: "14px" }}>{error}</div>}
                {msg && <div style={{ padding: "12px", background: "#f0fdf4", color: "#16a34a", borderRadius: "12px", border: "1px solid #dcfce7", marginBottom: "20px", fontSize: "14px" }}>{msg}</div>}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "8px", textTransform: "uppercase" }}>Email Address</label>
                        <div style={{ position: "relative" }}>
                            <Mail size={16} style={{ position: "absolute", left: "14px", top: "14px", color: "#94a3b8" }} />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                style={{ width: "100%", padding: "12px 12px 12px 42px", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "15px", outline: "none" }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "8px", textTransform: "uppercase" }}>Password</label>
                        <div style={{ position: "relative" }}>
                            <Lock size={16} style={{ position: "absolute", left: "14px", top: "14px", color: "#94a3b8" }} />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ width: "100%", padding: "12px 12px 12px 42px", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "15px", outline: "none" }}
                            />
                        </div>
                    </div>

                    <button
                        disabled={loading}
                        style={{ width: "100%", background: "#2563eb", color: "#fff", padding: "14px", borderRadius: "14px", border: "none", fontWeight: 600, fontSize: "16px", cursor: "pointer", marginTop: "12px" }}
                    >
                        {loading ? "Processing..." : mode === "login" ? "Login" : "Register Child Vault"}
                    </button>
                </form>

                <p style={{ textAlign: "center", marginTop: "32px", fontSize: "14px", color: "#64748b" }}>
                    {mode === "login" ? "New to JanVax?" : "Already have a vault?"} {' '}
                    <button
                        onClick={() => setMode(mode === "login" ? "signup" : "login")}
                        style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
                    >
                        {mode === "login" ? "Create an account" : "Sign in instead"}
                    </button>
                </p>
            </div>
        </div>
    );
}
