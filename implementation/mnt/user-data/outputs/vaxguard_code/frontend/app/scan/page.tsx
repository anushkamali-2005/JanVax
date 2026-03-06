"use client";
// frontend/app/scan/page.tsx

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "@/lib/firebase";
import Nav from "@/components/Nav";
import OCRScanner from "@/components/OCRScanner";

export default function ScanPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const childId      = searchParams.get("childId") || "";
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const { auth } = require("@/lib/firebase");
    const unsub = onAuthStateChanged(auth, (u: any) => {
      if (!u) router.replace("/");
      else setUser(u);
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="page-shell">
      <Nav />
      <main className="page-content" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div style={{ maxWidth: "480px", margin: "0 auto" }}>
          <p className="label fade-up" style={{ marginBottom: "6px" }}>Paper card import</p>
          <h1 className="headline fade-up fade-up-1" style={{ marginBottom: "0.5rem" }}>
            Scan vaccination card
          </h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--ink-3)", marginBottom: "2rem", lineHeight: 1.7 }}
            className="fade-up fade-up-2"
          >
            Hold the paper card in front of your camera. Our AI will extract all vaccine records automatically.
          </p>

          <div className="card fade-up fade-up-3">
            {user && childId
              ? <OCRScanner childId={childId} onSaved={() => router.push("/dashboard")} />
              : !childId
              ? (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                  <p style={{ fontSize: "0.875rem", color: "var(--ink-3)", marginBottom: "1rem" }}>
                    Select which child's card you're scanning:
                  </p>
                  <a href="/dashboard" className="btn-secondary">Go to dashboard</a>
                </div>
              )
              : <div className="spinner" style={{ margin: "2rem auto", display: "block" }} />
            }
          </div>

          {/* How it works */}
          <div className="card-flat fade-up fade-up-4" style={{ marginTop: "1rem" }}>
            <p className="label" style={{ marginBottom: "12px" }}>How it works</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { step: "1", text: "Point camera at the vaccination card" },
                { step: "2", text: "AI reads dates, vaccine names, and center" },
                { step: "3", text: "Review and correct any errors" },
                { step: "4", text: "Save — records are added to your profile" },
              ].map(({ step, text }) => (
                <div key={step} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{
                    width: "22px", height: "22px", borderRadius: "50%",
                    background: "var(--ink)", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.6875rem", fontWeight: 600, flexShrink: 0,
                  }}>
                    {step}
                  </span>
                  <p style={{ fontSize: "0.875rem", color: "var(--ink-2)" }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
