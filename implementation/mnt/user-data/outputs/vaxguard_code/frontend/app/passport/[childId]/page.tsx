"use client";
// frontend/app/passport/[childId]/page.tsx
// Shareable vaccine passport — QR + verified record list.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { getVaccineRecords } from "@/lib/firebase";
import { verifyChildRecords } from "@/lib/api";
import Nav from "@/components/Nav";

interface VaccineRecord {
  id:          string;
  vaccineName: string;
  vaccineCode: string;
  dateGiven:   string;
  centerName:  string;
  verified:    boolean;
  polygonHash: string;
  polygonTxId: string;
  isVerified?: boolean;
}

export default function PassportPage() {
  const params   = useParams();
  const childId  = params.childId as string;
  const [records,   setRecords]   = useState<VaccineRecord[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loading,   setLoading]   = useState(true);
  const [childName, setChildName] = useState("Child");

  const passportUrl = typeof window !== "undefined"
    ? `${window.location.origin}/verify/${childId}`
    : "";

  useEffect(() => {
    async function load() {
      try {
        // Get records with blockchain verification status
        const [rawRecords, verifyData] = await Promise.all([
          getVaccineRecords(childId),
          verifyChildRecords(childId).catch(() => ({ records: [] })),
        ]);

        // Merge verification status
        const verifyMap = new Map(
          (verifyData.records || []).map((r: any) => [r.id, r.isVerified])
        );
        const merged = rawRecords.map((r: any) => ({
          ...r,
          isVerified: verifyMap.get(r.id) ?? false,
        }));

        setRecords(merged);
        if (merged.length > 0) setChildName(merged[0]?.childId || "Child");

        // Generate QR code
        if (passportUrl) {
          const url = await QRCode.toDataURL(passportUrl, {
            width: 200, margin: 1,
            color: { dark: "#0A0A0A", light: "#FFFFFF" },
          });
          setQrDataUrl(url);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [childId, passportUrl]);

  if (loading) {
    return (
      <div className="page-shell">
        <Nav />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const verified   = records.filter(r => r.isVerified).length;
  const total      = records.length;

  return (
    <div className="page-shell">
      <Nav />
      <main className="page-content" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>

        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <p className="label fade-up" style={{ marginBottom: "6px" }}>Vaccine passport</p>
          <h1 className="headline fade-up fade-up-1" style={{ marginBottom: "2rem" }}>
            {childName}'s immunization record
          </h1>

          {/* Passport card */}
          <div className="card fade-up fade-up-2" style={{ padding: "2rem" }}>
            <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
              {/* QR code */}
              <div style={{ flexShrink: 0 }}>
                {qrDataUrl ? (
                  <div style={{
                    border: "1px solid var(--border)", borderRadius: "10px",
                    padding: "10px", background: "#fff",
                  }}>
                    <img src={qrDataUrl} alt="QR Code" width={120} height={120} />
                  </div>
                ) : (
                  <div className="skeleton" style={{ width: 120, height: 120, borderRadius: "10px" }} />
                )}
                <p style={{ fontSize: "0.625rem", color: "var(--ink-4)", marginTop: "6px", textAlign: "center" }}>
                  Scan to verify
                </p>
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: "1rem" }}>
                  <p className="label" style={{ marginBottom: "4px" }}>Child ID</p>
                  <p className="mono" style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>
                    {childId.slice(0, 16)}…
                  </p>
                </div>

                {/* Verification badge */}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  padding: "8px 14px", borderRadius: "100px",
                  background: verified > 0 ? "var(--green-muted)" : "var(--surface)",
                  border: `1px solid ${verified > 0 ? "#86EFAC" : "var(--border)"}`,
                }}>
                  <span style={{ fontSize: "0.875rem" }}>{verified > 0 ? "✅" : "⏳"}</span>
                  <span style={{
                    fontSize: "0.75rem", fontWeight: 500,
                    color: verified > 0 ? "var(--green)" : "var(--ink-3)",
                  }}>
                    {verified > 0
                      ? `${verified}/${total} blockchain verified`
                      : "Pending verification"}
                  </span>
                </div>
              </div>
            </div>

            <hr className="divider" style={{ margin: "1.5rem 0" }} />

            {/* Vaccine list */}
            <div>
              <p className="label" style={{ marginBottom: "12px" }}>Vaccination history</p>
              {records.length === 0 ? (
                <p style={{ fontSize: "0.875rem", color: "var(--ink-4)" }}>No records found.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  {records.map((rec, i) => (
                    <div key={rec.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 0",
                      borderBottom: i < records.length - 1 ? "1px solid var(--border-light)" : "none",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{
                          width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
                          background: rec.isVerified ? "var(--green)" : "var(--ink-4)",
                        }} />
                        <div>
                          <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>{rec.vaccineName}</p>
                          {rec.centerName && (
                            <p style={{ fontSize: "0.75rem", color: "var(--ink-4)" }}>{rec.centerName}</p>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p className="mono" style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>
                          {rec.dateGiven}
                        </p>
                        {rec.isVerified && (
                          <p style={{ fontSize: "0.625rem", color: "var(--green)", marginTop: "2px" }}>Verified</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", marginTop: "1.25rem" }} className="fade-up fade-up-3">
            <button
              className="btn-secondary"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => navigator.share?.({ url: passportUrl, title: "Vaccine Passport" })}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M10 4.5a2 2 0 1 0 0-3 2 2 0 0 0 0 3ZM4 7.5a2 2 0 1 0 0-3 2 2 0 0 0 0 3ZM10 12.5a2 2 0 1 0 0-3 2 2 0 0 0 0 3ZM5.9 6.5l2.2-1.5M5.9 8.5l2.2 1.5"
                  stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
              Share passport
            </button>
            <a
              href={`/verify/${childId}`}
              className="btn-secondary"
              style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5.5 7a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" stroke="currentColor" strokeWidth="1.25" />
                <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4S1 7 1 7Z" stroke="currentColor" strokeWidth="1.25" />
              </svg>
              Verify on chain
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
