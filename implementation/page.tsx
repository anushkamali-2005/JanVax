"use client";
// frontend/app/page.tsx — Login / Landing

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle, onAuthStateChanged } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(undefined as any, (user: any) => {
      if (user) router.replace("/dashboard");
      else setChecking(false);
    });
    return unsub;
  }, [router]);

  if (checking) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" />
      </div>
    );
  }

  async function handleGoogle() {
    setLoading(true);
    setError("");
    try {
      await signInWithGoogle();
      router.replace("/dashboard");
    } catch (e: any) {
      setError("Sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      background: "#ffffff",
    }}>
      {/* Left — hero copy */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "clamp(2rem, 5vw, 4rem)",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
      }}
        className="hidden md:flex"
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            width: "28px", height: "28px", background: "var(--ink)", borderRadius: "7px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L9.5 4.5H11.5L12.5 7L11.5 9.5H9.5L7 13L4.5 9.5H2.5L1.5 7L2.5 4.5H4.5L7 1Z" fill="white" />
            </svg>
          </span>
          <span style={{ fontWeight: 600, fontSize: "1rem", letterSpacing: "-0.02em" }}>VaxGuard AI</span>
        </div>

        {/* Main copy */}
        <div style={{ maxWidth: "400px" }}>
          <p className="label" style={{ marginBottom: "1.25rem" }}>India's vaccination platform</p>
          <h1 className="display" style={{ marginBottom: "1.5rem" }}>
            Every child,<br />
            <span style={{ color: "var(--green)" }}>protected.</span>
          </h1>
          <p style={{ fontSize: "1.0625rem", color: "var(--ink-2)", lineHeight: 1.7, fontWeight: 300 }}>
            AI-powered risk prediction, multilingual reminders, and a tamper-proof
            vaccination record for every family in India.
          </p>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "2.5rem", marginTop: "2.5rem" }}>
            {[
              { value: "94%",    label: "Model accuracy" },
              { value: "5 lang", label: "Supported" },
              { value: "USSD",   label: "Feature phones" },
            ].map(({ value, label }) => (
              <div key={label}>
                <div style={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.02em" }}>{value}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-4)", marginTop: "2px" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer credit */}
        <p style={{ fontSize: "0.75rem", color: "var(--ink-4)" }}>
          Built for India Healthcare Hackathon 2024
        </p>
      </div>

      {/* Right — sign in */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(2rem, 5vw, 4rem)",
      }}>
        <div style={{ width: "100%", maxWidth: "340px" }} className="fade-up">

          {/* Mobile logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2.5rem" }}
            className="md:hidden"
          >
            <span style={{
              width: "24px", height: "24px", background: "var(--ink)", borderRadius: "6px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L9.5 4.5H11.5L12.5 7L11.5 9.5H9.5L7 13L4.5 9.5H2.5L1.5 7L2.5 4.5H4.5L7 1Z" fill="white" />
              </svg>
            </span>
            <span style={{ fontWeight: 600, fontSize: "0.9375rem", letterSpacing: "-0.02em" }}>VaxGuard AI</span>
          </div>

          <h2 style={{ fontWeight: 500, fontSize: "1.375rem", letterSpacing: "-0.025em", marginBottom: "0.5rem" }}>
            Welcome back
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--ink-3)", marginBottom: "2rem", lineHeight: 1.6 }}>
            Sign in to manage your family's vaccination records.
          </p>

          {error && (
            <div style={{
              background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px",
              padding: "10px 14px", fontSize: "0.8125rem", color: "#DC2626", marginBottom: "1rem",
            }}>
              {error}
            </div>
          )}

          {/* Google sign-in */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              padding: "0.75rem 1.25rem",
              background: "#ffffff",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              fontSize: "0.9375rem",
              fontWeight: 500,
              color: "var(--ink)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "all 0.12s",
              fontFamily: "var(--font-sans)",
            }}
          >
            {loading ? (
              <div className="spinner" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
              </svg>
            )}
            {loading ? "Signing in…" : "Continue with Google"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "1.25rem 0" }}>
            <hr className="divider" style={{ flex: 1 }} />
            <span style={{ fontSize: "0.75rem", color: "var(--ink-4)" }}>or</span>
            <hr className="divider" style={{ flex: 1 }} />
          </div>

          {/* Phone sign-in placeholder */}
          <button
            className="btn-secondary"
            style={{ width: "100%", justifyContent: "center", padding: "0.75rem" }}
            onClick={() => alert("Phone OTP: enter your number in the next step")}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 2h3l1.5 3.5-1.75 1.25a9 9 0 0 0 3.5 3.5L10.5 8.5 14 10v3a1 1 0 0 1-1 1A12 12 0 0 1 2 3a1 1 0 0 1 1-1Z"
                stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            Continue with phone
          </button>

          <p style={{ fontSize: "0.75rem", color: "var(--ink-4)", textAlign: "center", marginTop: "1.5rem", lineHeight: 1.7 }}>
            By signing in you agree to our terms of service.
            <br />Your data is encrypted and never sold.
          </p>
        </div>
      </div>
    </div>
  );
}
