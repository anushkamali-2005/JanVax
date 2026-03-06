"use client";
// frontend/app/dashboard/page.tsx
// Family health dashboard — the main parent view

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, subscribeToChildren, type auth } from "@/lib/firebase";
import { predictRisk } from "@/lib/api";
import Nav from "@/components/Nav";
import RiskScoreCard from "@/components/RiskScoreCard";

interface Child {
  id:                  string;
  name:                string;
  ageMonths:           number;
  gender:              string;
  district:            string;
  nextDueVaccine:      string;
  nextDueDate:         string;
  riskScore:           number;
  riskDisease:         string;
  vaccinesMissedCount: number;
  daysOverdue:         number;
  modelVersion?:       string;
}

function getImmunityStatus(child: Child): "up-to-date" | "due-soon" | "overdue" {
  if (child.vaccinesMissedCount === 0) return "up-to-date";
  if (child.daysOverdue > 0)          return "overdue";
  return "due-soon";
}

function ChildCard({ child, language }: { child: Child; language: string }) {
  const status = getImmunityStatus(child);

  const statusConfig = {
    "up-to-date": { color: "var(--green)",        bg: "var(--green-muted)",  dot: "#16A34A", label: "Up to date"  },
    "due-soon":   { color: "var(--risk-medium)",   bg: "#FEF9C3",             dot: "#D97706", label: "Due soon"   },
    "overdue":    { color: "var(--risk-high)",      bg: "#FEF2F2",             dot: "#DC2626", label: "Overdue"    },
  }[status];

  return (
    <div className="card fade-up" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Avatar */}
          <div style={{
            width: "40px", height: "40px", borderRadius: "50%",
            background: "var(--surface)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.125rem", flexShrink: 0,
          }}>
            {child.gender === "female" ? "👧" : "👦"}
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: "0.9375rem", letterSpacing: "-0.01em" }}>{child.name}</p>
            <p style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginTop: "1px" }}>
              {child.ageMonths} months · {child.district}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <span style={{
          display: "flex", alignItems: "center", gap: "5px",
          fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.04em",
          textTransform: "uppercase", color: statusConfig.color,
          background: statusConfig.bg, padding: "4px 10px", borderRadius: "100px",
        }}>
          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: statusConfig.dot }} />
          {statusConfig.label}
        </span>
      </div>

      {/* Vaccine bar */}
      {child.nextDueVaccine && (
        <div style={{
          background: "var(--surface)", borderRadius: "8px", padding: "10px 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <p className="label" style={{ marginBottom: "2px" }}>Next due</p>
            <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>{child.nextDueVaccine}</p>
          </div>
          {child.nextDueDate && (
            <p className="mono" style={{ color: status === "overdue" ? "var(--risk-high)" : "var(--ink-3)" }}>
              {child.nextDueDate}
            </p>
          )}
        </div>
      )}

      {/* Risk score (only if elevated) */}
      {child.riskScore >= 40 && (
        <RiskScoreCard child={child} language={language} compact />
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginTop: "auto" }}>
        <Link
          href={`/passport/${child.id}`}
          className="btn-secondary"
          style={{ flex: 1, justifyContent: "center", fontSize: "0.8125rem" }}
        >
          Passport
        </Link>
        <Link
          href={`/scan?childId=${child.id}`}
          className="btn-secondary"
          style={{ flex: 1, justifyContent: "center", fontSize: "0.8125rem" }}
        >
          Scan card
        </Link>
      </div>
    </div>
  );
}

function EmptyState({ onAddChild }: { onAddChild: () => void }) {
  return (
    <div style={{
      gridColumn: "1 / -1", textAlign: "center",
      padding: "5rem 2rem",
    }}>
      <div style={{
        width: "48px", height: "48px", background: "var(--surface)",
        border: "1px solid var(--border)", borderRadius: "12px",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 1.25rem", fontSize: "1.375rem",
      }}>
        👶
      </div>
      <h2 style={{ fontWeight: 500, fontSize: "1.125rem", letterSpacing: "-0.02em", marginBottom: "0.5rem" }}>
        No children added yet
      </h2>
      <p style={{ fontSize: "0.875rem", color: "var(--ink-3)", marginBottom: "1.5rem" }}>
        Add your first child to start tracking vaccinations.
      </p>
      <button className="btn-primary" onClick={onAddChild}>
        Add a child
      </button>
    </div>
  );
}

function AddChildModal({ onClose, onAdd, uid }: { onClose: () => void; onAdd: (child: any) => void; uid: string }) {
  const [form, setForm] = useState({ name: "", dob: "", gender: "male", district: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!form.name || !form.dob) return;
    setSaving(true);
    try {
      const { addChild } = await import("@/lib/firebase");
      const dob = new Date(form.dob);
      const ageMonths = Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const childId = await addChild(uid, {
        name: form.name, dob: form.dob, gender: form.gender,
        district: form.district, ageMonths,
        vaccinesMissedCount: 0, daysOverdue: 0,
        riskScore: 0, nextDueVaccine: "", nextDueDate: "",
      });
      onAdd({ id: childId, ...form, ageMonths });
      onClose();
    } catch (e) {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
    }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card fade-up" style={{ width: "100%", maxWidth: "380px", padding: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <h3 style={{ fontWeight: 600, fontSize: "1.0625rem", letterSpacing: "-0.02em" }}>Add a child</h3>
          <button onClick={onClose} className="btn-ghost">✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="label" style={{ display: "block", marginBottom: "6px" }}>Name</label>
            <input className="input" placeholder="Arjun" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label" style={{ display: "block", marginBottom: "6px" }}>Date of birth</label>
            <input className="input" type="date" value={form.dob}
              onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          </div>
          <div>
            <label className="label" style={{ display: "block", marginBottom: "6px" }}>Gender</label>
            <select className="input" value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label" style={{ display: "block", marginBottom: "6px" }}>District</label>
            <input className="input" placeholder="Pune" value={form.district}
              onChange={(e) => setForm({ ...form, district: e.target.value })} />
          </div>
        </div>

        <button className="btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: "1.5rem" }}
          onClick={handleSubmit} disabled={saving || !form.name || !form.dob}>
          {saving ? <><div className="spinner" /> Saving…</> : "Add child"}
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router   = useRouter();
  const [user,     setUser]     = useState<any>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    const { auth: firebaseAuth } = require("@/lib/firebase");
    const unsub = onAuthStateChanged(firebaseAuth, (u: any) => {
      if (!u) { router.replace("/"); return; }
      setUser(u);
      // Subscribe to children real-time
      const unsubChildren = subscribeToChildren(u.uid, (kids) => {
        setChildren(kids as Child[]);
        setLoading(false);
      });
      return () => unsubChildren();
    });
    return () => unsub();
  }, [router]);

  const summary = {
    upToDate: children.filter(c => c.vaccinesMissedCount === 0).length,
    dueSoon:  children.filter(c => c.vaccinesMissedCount > 0 && c.daysOverdue === 0).length,
    overdue:  children.filter(c => c.daysOverdue > 0).length,
  };

  return (
    <div className="page-shell">
      <Nav language={language} onLanguageChange={setLanguage} />

      <main className="page-content" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "2rem" }}
          className="fade-up"
        >
          <div>
            <p className="label" style={{ marginBottom: "4px" }}>Family dashboard</p>
            <h1 style={{ fontWeight: 500, fontSize: "1.5rem", letterSpacing: "-0.025em" }}>
              {user?.displayName?.split(" ")[0]
                ? `${user.displayName.split(" ")[0]}'s family`
                : "Your family"}
            </h1>
          </div>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            Add child
          </button>
        </div>

        {/* Summary strip */}
        {children.length > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1px", background: "var(--border)", borderRadius: "10px",
            overflow: "hidden", marginBottom: "2rem",
          }}
            className="fade-up fade-up-1"
          >
            {[
              { count: summary.upToDate, label: "Up to date",   color: "var(--green)"       },
              { count: summary.dueSoon,  label: "Due soon",     color: "var(--risk-medium)"  },
              { count: summary.overdue,  label: "Overdue",      color: "var(--risk-high)"    },
            ].map(({ count, label, color }) => (
              <div key={label} style={{ background: "#fff", padding: "1rem 1.25rem" }}>
                <p style={{ fontWeight: 600, fontSize: "1.5rem", color, letterSpacing: "-0.03em" }}>
                  {count}
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginTop: "2px" }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Children grid */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
            {[1, 2].map(i => (
              <div key={i} className="card" style={{ height: "220px" }}>
                <div className="skeleton" style={{ height: "40px", width: "60%", marginBottom: "12px" }} />
                <div className="skeleton" style={{ height: "56px", marginBottom: "12px" }} />
                <div className="skeleton" style={{ height: "36px", width: "40%" }} />
              </div>
            ))}
          </div>
        ) : children.length === 0 ? (
          <EmptyState onAddChild={() => setShowAdd(true)} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
            {children.map((child, i) => (
              <div key={child.id} className={`fade-up fade-up-${Math.min(i + 2, 5)}`}>
                <ChildCard child={child} language={language} />
              </div>
            ))}
          </div>
        )}
      </main>

      {showAdd && user && (
        <AddChildModal
          onClose={() => setShowAdd(false)}
          onAdd={() => {}}
          uid={user.uid}
        />
      )}
    </div>
  );
}
