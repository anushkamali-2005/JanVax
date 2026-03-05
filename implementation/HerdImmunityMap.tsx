"use client";
// frontend/components/HerdImmunityMap.tsx
// -----------------------------------------
// D3.js choropleth map of India districts showing vaccination coverage.
// Color: green >90%, yellow 70-90%, red <70% (herd immunity risk).
//
// CRITICAL: india-districts.geojson must be in /public/ directory.
// CRITICAL: D3 v7 API — not v5/v6. projection and path setup differs.
// CRITICAL: districtSlug in GeoJSON must match Firestore communityStats keys.
//           Both are lowercase with underscores e.g. "pune" "nashik"
// CRITICAL: useEffect cleanup must remove SVG to prevent double-render on hot reload.

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { DistrictCoverage } from "@/lib/api";

interface Props {
  districts: DistrictCoverage[];
  onDistrictClick?: (district: DistrictCoverage) => void;
}

// Coverage thresholds
const COLOR_HIGH   = "#22c55e";   // green  — >90%
const COLOR_MEDIUM = "#f59e0b";   // amber  — 70-90%
const COLOR_LOW    = "#ef4444";   // red    — <70% (herd immunity at risk)
const COLOR_NONE   = "#e5e7eb";   // gray   — no data

function getCoverageColor(mmr: number | undefined): string {
  if (mmr === undefined || mmr === null) return COLOR_NONE;
  if (mmr >= 0.90) return COLOR_HIGH;
  if (mmr >= 0.70) return COLOR_MEDIUM;
  return COLOR_LOW;
}

export default function HerdImmunityMap({ districts, onDistrictClick }: Props) {
  const svgRef     = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hoveredDistrict, setHoveredDistrict] = useState<DistrictCoverage | null>(null);

  // Build lookup map: district_slug → coverage data
  const coverageMap = new Map<string, DistrictCoverage>();
  districts.forEach((d) => coverageMap.set(d.district.toLowerCase(), d));

  useEffect(() => {
    if (!svgRef.current) return;

    const svg    = d3.select(svgRef.current);
    const width  = svgRef.current.clientWidth  || 800;
    const height = svgRef.current.clientHeight || 600;

    svg.selectAll("*").remove();   // Clean up on re-render

    const g = svg.append("g");

    // ── Projection: fit Maharashtra/India in viewport ──────────────────
    const projection = d3.geoMercator()
      .center([76.9, 19.7])        // Center on Maharashtra
      .scale(3500)
      .translate([width / 2, height / 2]);

    const pathGenerator = d3.geoPath().projection(projection);

    // ── Zoom + pan ─────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    // ── Load GeoJSON ───────────────────────────────────────────────────
    d3.json<any>("/india-districts.geojson").then((geoData) => {
      if (!geoData) return;

      g.selectAll("path")
        .data(geoData.features)
        .enter()
        .append("path")
        .attr("d", (d: any) => pathGenerator(d) || "")
        .attr("fill", (d: any) => {
          const slug     = d.properties?.district?.toLowerCase()?.replace(/\s+/g, "_") || "";
          const coverage = coverageMap.get(slug);
          return getCoverageColor(coverage?.mmrCoverage);
        })
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.5)
        .style("cursor", "pointer")
        .on("mouseover", function (event: MouseEvent, d: any) {
          d3.select(this).attr("stroke-width", 1.5).attr("stroke", "#1e293b");

          const slug     = d.properties?.district?.toLowerCase()?.replace(/\s+/g, "_") || "";
          const coverage = coverageMap.get(slug);

          if (tooltipRef.current) {
            tooltipRef.current.style.display = "block";
            tooltipRef.current.style.left    = `${event.offsetX + 12}px`;
            tooltipRef.current.style.top     = `${event.offsetY - 10}px`;
            tooltipRef.current.innerHTML     = coverage
              ? `<strong>${d.properties?.district}</strong><br/>
                 MMR: ${Math.round(coverage.mmrCoverage * 100)}%<br/>
                 Polio: ${Math.round(coverage.polioOPV * 100)}%<br/>
                 BCG: ${Math.round(coverage.bcgCoverage * 100)}%<br/>
                 Children: ${coverage.totalChildren}
                 ${coverage.herdRisk ? '<br/><span style="color:#ef4444">⚠️ Herd immunity at risk</span>' : ""}`
              : `<strong>${d.properties?.district}</strong><br/>No data`;
          }
          setHoveredDistrict(coverage || null);
        })
        .on("mousemove", function (event: MouseEvent) {
          if (tooltipRef.current) {
            tooltipRef.current.style.left = `${event.offsetX + 12}px`;
            tooltipRef.current.style.top  = `${event.offsetY - 10}px`;
          }
        })
        .on("mouseout", function () {
          d3.select(this).attr("stroke-width", 0.5).attr("stroke", "#fff");
          if (tooltipRef.current) tooltipRef.current.style.display = "none";
          setHoveredDistrict(null);
        })
        .on("click", (_event: MouseEvent, d: any) => {
          const slug     = d.properties?.district?.toLowerCase()?.replace(/\s+/g, "_") || "";
          const coverage = coverageMap.get(slug);
          if (coverage && onDistrictClick) onDistrictClick(coverage);
        });
    });

    // Cleanup on unmount
    return () => { svg.selectAll("*").remove(); };
  }, [districts]);   // Re-render when coverage data updates

  return (
    <div className="relative w-full h-full">
      {/* Map SVG */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ minHeight: "400px" }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm z-10"
        style={{ display: "none" }}
      />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow p-3 text-xs space-y-1">
        <p className="font-semibold text-gray-700 mb-2">MMR Coverage</p>
        {[
          { color: COLOR_HIGH,   label: "> 90%  (Safe)" },
          { color: COLOR_MEDIUM, label: "70–90% (Monitor)" },
          { color: COLOR_LOW,    label: "< 70%  (⚠️ At Risk)" },
          { color: COLOR_NONE,   label: "No data" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
