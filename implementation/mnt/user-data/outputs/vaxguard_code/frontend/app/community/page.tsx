"use client";
// frontend/app/community/page.tsx

import { useEffect, useState } from "react";
import { getCommunityStats, type DistrictCoverage } from "@/lib/api";
import Nav from "@/components/Nav";
import HerdImmunityMap from "@/components/HerdImmunityMap";

export default function CommunityPage() {
  const [districts, setDistricts]       = useState<DistrictCoverage[]>([]);
  const [selected,  setSelected]        = useState<DistrictCoverage | null>(null);
  const [loading,   setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated]   = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getCommunityStats();
        setDistricts(data.districts);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
    // Poll every 30 minutes
    const interval = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const atRisk = districts.filter(d => d.herdRisk).length;
  const total  = districts.length;

  return (
    <div className="page-shell">
      <Nav />
      <main className="page-content" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "2rem" }}
          className="fade-up"
        >
          <div>
            <p className="label" style={{ marginBottom: "6px" }}>Community health</p>
            <h1 style={{ fontWeight: 500, fontSize: "1.5rem", letterSpacing: "-0.025em" }}>
              Herd immunity map
            </h1>
          </div>
          {lastUpdated && (
            <p className="mono" style={{ fontSize: "0.6875rem", color: "var(--ink-4)" }}>
              Updated {lastUpdated}
            </p>
          )}
        </div>

        {/* Alert strip */}
        {atRisk > 0 && !loading && (
          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "12px 16px", borderRadius: "10px",
            background: "#FEF2F2", border: "1px solid #FECACA",
            marginBottom: "1.5rem",
          }}
            className="fade-up fade-up-1"
          >
            <span style={{ fontSize: "1rem" }}>⚠️</span>
            <p style={{ fontSize: "0.875rem", color: "#991B1B" }}>
              <strong>{atRisk} of {total} districts</strong> are below the 70% herd immunity threshold for MMR.
            </p>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem", alignItems: "start" }}
          className="fade-up fade-up-2"
        >
          {/* Map */}
          <div className="card" style={{ padding: "1rem", height: "520px", position: "relative" }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <div className="spinner" />
              </div>
            ) : (
              <HerdImmunityMap districts={districts} onDistrictClick={setSelected} />
            )}
          </div>

          {/* District detail panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {selected ? (
              <div className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <h3 style={{ fontWeight: 600, fontSize: "1rem", textTransform: "capitalize" }}>
                    {selected.district}
                  </h3>
                  {selected.herdRisk && (
                    <span className="badge badge-high">At risk</span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[
                    { label: "MMR coverage",   value: selected.mmrCoverage,  threshold: 0.70 },
                    { label: "Polio coverage",  value: selected.polioOPV,    threshold: 0.85 },
                    { label: "BCG coverage",    value: selected.bcgCoverage,  threshold: 0.90 },
                  ].map(({ label, value, threshold }) => (
                    <div key={label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span style={{ fontSize: "0.8125rem", color: "var(--ink-2)" }}>{label}</span>
                        <span className="mono" style={{
                          fontSize: "0.8125rem", fontWeight: 500,
                          color: value >= threshold ? "var(--green)" : "var(--risk-high)",
                        }}>
                          {Math.round(value * 100)}%
                        </span>
                      </div>
                      <div style={{ height: "4px", background: "var(--border)", borderRadius: "2px" }}>
                        <div style={{
                          height: "100%", borderRadius: "2px",
                          width: `${Math.round(value * 100)}%`,
                          background: value >= threshold ? "var(--green)" : "var(--risk-high)",
                          transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                        }} />
                      </div>
                    </div>
                  ))}

                  <hr className="divider" />
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.8125rem", color: "var(--ink-3)" }}>Children tracked</span>
                    <span className="mono" style={{ fontSize: "0.8125rem" }}>{selected.totalChildren.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card-flat" style={{ textAlign: "center", padding: "2rem 1rem" }}>
                <p style={{ fontSize: "0.875rem", color: "var(--ink-4)" }}>
                  Click a district to see coverage details
                </p>
              </div>
            )}

            {/* Top risky districts */}
            {districts.filter(d => d.herdRisk).length > 0 && (
              <div className="card" style={{ padding: "1.25rem" }}>
                <p className="label" style={{ marginBottom: "12px" }}>Below threshold</p>
                {districts
                  .filter(d => d.herdRisk)
                  .sort((a, b) => a.mmrCoverage - b.mmrCoverage)
                  .slice(0, 5)
                  .map(d => (
                    <button
                      key={d.district}
                      onClick={() => setSelected(d)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        width: "100%", padding: "8px 0",
                        borderBottom: "1px solid var(--border-light)",
                        background: "none", border: "none", cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: "0.875rem", color: "var(--ink-2)", textTransform: "capitalize" }}>
                        {d.district}
                      </span>
                      <span className="mono" style={{ fontSize: "0.8125rem", color: "var(--risk-high)" }}>
                        {Math.round(d.mmrCoverage * 100)}%
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
