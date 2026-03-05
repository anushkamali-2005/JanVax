"use client";

/**
 * HerdImmunityMap.tsx
 * ───────────────────
 * D3.js-powered India district map showing vaccination coverage heatmap.
 * Fetches live data from /community/coverage and renders an SVG with tooltips.
 *
 * Uses simplified India state boundaries (GeoJSON rectangles) as actual
 * district-level GeoJSON is very large. For the hackathon demo this provides
 * a clear visual representation of coverage zones.
 */

import { useEffect, useState, useRef } from "react";
import { getCommunityStats } from "@/lib/api";
import { Loader2 } from "lucide-react";

// ── Simplified India state data with coordinates for the map ─────────────
// In production, swap with actual India TopoJSON/GeoJSON
const INDIA_STATES: Array<{
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
}> = [
        { name: "Jammu & Kashmir", x: 180, y: 10, w: 60, h: 45 },
        { name: "Himachal Pradesh", x: 200, y: 55, w: 35, h: 25 },
        { name: "Punjab", x: 170, y: 60, w: 30, h: 30 },
        { name: "Uttarakhand", x: 235, y: 55, w: 40, h: 25 },
        { name: "Haryana", x: 175, y: 90, w: 35, h: 30 },
        { name: "Delhi", x: 210, y: 100, w: 15, h: 15 },
        { name: "Rajasthan", x: 120, y: 100, w: 80, h: 80 },
        { name: "Uttar Pradesh", x: 225, y: 85, w: 95, h: 65 },
        { name: "Bihar", x: 320, y: 100, w: 50, h: 35 },
        { name: "Sikkim", x: 355, y: 80, w: 15, h: 15 },
        { name: "Arunachal Pradesh", x: 400, y: 60, w: 45, h: 25 },
        { name: "Nagaland", x: 420, y: 85, w: 25, h: 20 },
        { name: "Manipur", x: 420, y: 105, w: 20, h: 20 },
        { name: "Mizoram", x: 415, y: 125, w: 20, h: 25 },
        { name: "Tripura", x: 395, y: 125, w: 15, h: 20 },
        { name: "Meghalaya", x: 370, y: 95, w: 35, h: 15 },
        { name: "Assam", x: 360, y: 75, w: 55, h: 20 },
        { name: "West Bengal", x: 330, y: 130, w: 35, h: 60 },
        { name: "Jharkhand", x: 300, y: 135, w: 40, h: 35 },
        { name: "Odisha", x: 290, y: 170, w: 55, h: 50 },
        { name: "Chhattisgarh", x: 250, y: 155, w: 45, h: 55 },
        { name: "Madhya Pradesh", x: 175, y: 150, w: 80, h: 50 },
        { name: "Gujarat", x: 90, y: 150, w: 65, h: 70 },
        { name: "Maharashtra", x: 145, y: 200, w: 95, h: 55 },
        { name: "Telangana", x: 225, y: 225, w: 55, h: 35 },
        { name: "Andhra Pradesh", x: 230, y: 255, w: 60, h: 55 },
        { name: "Karnataka", x: 160, y: 260, w: 60, h: 60 },
        { name: "Goa", x: 145, y: 275, w: 15, h: 15 },
        { name: "Kerala", x: 170, y: 320, w: 25, h: 55 },
        { name: "Tamil Nadu", x: 210, y: 310, w: 55, h: 55 },
    ];

interface DistrictData {
    district: string;
    totalChildren: number;
    mmrCoverage: number;
    polioOPV: number;
    bcgCoverage: number;
    dptCoverage: number;
    herdRisk: boolean;
    state: string;
}

function getCoverageColor(avg: number): string {
    if (avg >= 90) return "#10b981"; // emerald
    if (avg >= 70) return "#f59e0b"; // amber
    return "#ef4444"; // rose
}

function getCoverageBg(avg: number): string {
    if (avg >= 90) return "rgba(16, 185, 129, 0.15)";
    if (avg >= 70) return "rgba(245, 158, 11, 0.15)";
    return "rgba(239, 68, 68, 0.15)";
}

export default function HerdImmunityMap() {
    const [loading, setLoading] = useState(true);
    const [districts, setDistricts] = useState<DistrictData[]>([]);
    const [hovered, setHovered] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; data: DistrictData | null }>({
        x: 0, y: 0, data: null,
    });
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await getCommunityStats();
                setDistricts(res.districts);
            } catch {
                // Use demo data if API unavailable
                setDistricts(generateDemoData());
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Group district data by state for map coloring
    const stateAvg = new Map<string, number>();
    const stateData = new Map<string, DistrictData>();

    districts.forEach((d) => {
        const avg = (d.mmrCoverage + d.polioOPV + d.bcgCoverage + d.dptCoverage) / 4;
        const existing = stateAvg.get(d.state);
        if (!existing || avg < existing) {
            stateAvg.set(d.state, avg);
            stateData.set(d.state, d);
        }
    });

    const handleMouseMove = (e: React.MouseEvent, stateName: string) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const data = stateData.get(stateName) || null;
        setHovered(stateName);
        setTooltip({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top - 10,
            data,
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px]">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="relative w-full h-full min-h-[500px]">
            <svg
                ref={svgRef}
                viewBox="0 0 500 400"
                className="w-full h-full"
                style={{ minHeight: 500 }}
            >
                {/* Background */}
                <rect width="500" height="400" fill="transparent" />

                {INDIA_STATES.map((state) => {
                    const avg = stateAvg.get(state.name) ?? 85;
                    const isHovered = hovered === state.name;

                    return (
                        <g key={state.name}>
                            <rect
                                x={state.x}
                                y={state.y}
                                width={state.w}
                                height={state.h}
                                rx={4}
                                fill={getCoverageBg(avg)}
                                stroke={getCoverageColor(avg)}
                                strokeWidth={isHovered ? 2.5 : 1}
                                opacity={isHovered ? 1 : 0.85}
                                className="cursor-pointer transition-all duration-200"
                                onMouseMove={(e) => handleMouseMove(e, state.name)}
                                onMouseLeave={() => { setHovered(null); setTooltip({ x: 0, y: 0, data: null }); }}
                            />
                            {/* State label — only show if big enough */}
                            {state.w >= 35 && state.h >= 25 && (
                                <text
                                    x={state.x + state.w / 2}
                                    y={state.y + state.h / 2}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fill={getCoverageColor(avg)}
                                    fontSize={state.w > 60 ? 8 : 6}
                                    fontWeight="bold"
                                    className="pointer-events-none select-none"
                                >
                                    {state.name.length > 10 ? state.name.slice(0, 8) + "…" : state.name}
                                </text>
                            )}
                            {/* Coverage percentage */}
                            {state.w >= 40 && state.h >= 30 && (
                                <text
                                    x={state.x + state.w / 2}
                                    y={state.y + state.h / 2 + 10}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fill="#94a3b8"
                                    fontSize={6}
                                    className="pointer-events-none select-none"
                                >
                                    {Math.round(avg)}%
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Tooltip */}
            {tooltip.data && (
                <div
                    className="absolute pointer-events-none z-50 bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-2xl min-w-[200px]"
                    style={{
                        left: Math.min(tooltip.x, 280),
                        top: tooltip.y - 120,
                    }}
                >
                    <div className="font-bold text-sm mb-2">{hovered}</div>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-slate-500">MMR Coverage</span>
                            <span className="font-bold" style={{ color: getCoverageColor(tooltip.data.mmrCoverage) }}>
                                {tooltip.data.mmrCoverage}%
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Polio (OPV)</span>
                            <span className="font-bold" style={{ color: getCoverageColor(tooltip.data.polioOPV) }}>
                                {tooltip.data.polioOPV}%
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">BCG</span>
                            <span className="font-bold" style={{ color: getCoverageColor(tooltip.data.bcgCoverage) }}>
                                {tooltip.data.bcgCoverage}%
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">DPT</span>
                            <span className="font-bold" style={{ color: getCoverageColor(tooltip.data.dptCoverage) }}>
                                {tooltip.data.dptCoverage}%
                            </span>
                        </div>
                        {tooltip.data.herdRisk && (
                            <div className="mt-2 px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-[10px] font-bold text-center uppercase tracking-wider">
                                ⚠ Below Herd Immunity Threshold
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Demo data generator (used when API is unavailable) ────────────────────
function generateDemoData(): DistrictData[] {
    const states = INDIA_STATES.map((s) => s.name);
    return states.map((state) => {
        const base = 60 + Math.random() * 35;
        return {
            district: state,
            state: state,
            totalChildren: Math.floor(500 + Math.random() * 5000),
            mmrCoverage: Math.round(base + (Math.random() - 0.5) * 20),
            polioOPV: Math.round(base + (Math.random() - 0.5) * 15),
            bcgCoverage: Math.round(Math.min(99, base + Math.random() * 10)),
            dptCoverage: Math.round(base + (Math.random() - 0.5) * 18),
            herdRisk: base < 75,
        };
    });
}
