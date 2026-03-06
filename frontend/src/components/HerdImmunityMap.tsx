"use client";

import React, { useEffect, useState, useRef } from "react";
import * as d3 from "d3";
import { Loader2, Users, AlertTriangle, ShieldCheck } from "lucide-react";


import { DistrictCoverage } from "@/lib/api";

interface HerdImmunityMapProps {
    districts?: DistrictCoverage[];
}

export default function HerdImmunityMap({ districts }: HerdImmunityMapProps) {
    const [coverageData, setCoverageData] = useState<DistrictCoverage[]>(districts || []);
    const [isLoading, setIsLoading] = useState(!districts);
    const [error, setError] = useState<string | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (districts) {
            setCoverageData(districts);
            setIsLoading(false);
            return;
        }

        const fetchCoverage = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
                const res = await fetch(`${apiUrl}/community/coverage`);
                if (!res.ok) throw new Error("Failed to fetch coverage data");
                const data = await res.json();
                setCoverageData(data.districts);
            } catch (err: any) {
                setError("Unable to load live community stats.");
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCoverage();
    }, [districts]);

    // Average stats for display
    const avgMmr = coverageData.length
        ? coverageData.reduce((acc, d) => acc + d.mmrCoverage, 0) / coverageData.length
        : 0;

    const riskDistricts = coverageData.filter(d => d.herdRisk).length;

    return (
        <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] relative overflow-hidden">
            {/* Visual background gradient */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--blue-light)] opacity-20 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 relative z-10">
                <div>
                    <h2 className="text-xl font-bold text-[var(--ink-1)]">Community Immunity Tracking</h2>
                    <p className="text-sm text-[var(--ink-3)] mt-1 max-w-md">
                        Real-time risk aggregation based on NFHS-5 data and latest predictive models across Maharashtra.
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex items-center gap-2 text-[var(--blue)] bg-[var(--blue-light)]/10 px-4 py-2 rounded-full text-sm font-medium">
                        <Loader2 className="animate-spin" size={16} />
                        Syncing Nodes...
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 bg-[var(--green-light)] rounded-full flex items-center gap-2">
                            <ShieldCheck size={16} className="text-[var(--green)]" />
                            <span className="text-sm font-semibold text-[var(--green-dark)]">
                                {(avgMmr * 100).toFixed(1)}% Safe Target
                            </span>
                        </div>
                        {riskDistricts > 0 && (
                            <div className="px-4 py-2 bg-red-50 rounded-full flex items-center gap-2">
                                <AlertTriangle size={16} className="text-red-500" />
                                <span className="text-sm font-semibold text-red-700">
                                    {riskDistricts} Zone{riskDistricts > 1 ? 's' : ''} at Risk
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 mb-6">
                    {error}
                </div>
            )}

            {/* D3 Map Placeholder / Real-world data visualization */}
            <div className="relative aspect-[2/1] w-full bg-[#FAFAFA] rounded-2xl border border-[var(--border)] overflow-hidden flex items-center justify-center">

                {isLoading ? (
                    <div className="animate-pulse flex items-center gap-3 text-[var(--ink-3)]">
                        <div className="w-4 h-4 rounded-full bg-[var(--border)]" />
                        <div className="w-4 h-4 rounded-full bg-[var(--border)] delay-75" />
                        <div className="w-4 h-4 rounded-full bg-[var(--border)] delay-150" />
                    </div>
                ) : coverageData.length > 0 ? (
                    <div className="w-full h-full p-4 md:p-8 flex items-center justify-center overflow-auto">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                            {coverageData.slice(0, 12).map((district, idx) => {
                                const isRisk = district.herdRisk;
                                const isSafe = district.mmrCoverage >= 0.95;

                                return (
                                    <div
                                        key={idx}
                                        className={`p-4 rounded-xl border transition-all duration-300 transform hover:scale-105 ${isRisk
                                            ? 'bg-red-50/50 border-red-200 shadow-[0_4px_20px_-4px_rgba(239,68,68,0.2)]'
                                            : isSafe
                                                ? 'bg-green-50/50 border-green-200'
                                                : 'bg-white border-[var(--border)]'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-semibold text-[var(--ink-1)] tracking-tight capitalize">
                                                {district.district}
                                            </h3>
                                        </div>
                                        <div className="flex items-end gap-1">
                                            <span className={`text-2xl font-bold ${isRisk ? 'text-red-600' : isSafe ? 'text-green-600' : 'text-[var(--ink-1)]'}`}>
                                                {(district.mmrCoverage * 100).toFixed(0)}%
                                            </span>
                                            <span className="text-[10px] text-[var(--ink-3)] font-medium uppercase tracking-wider mb-1">
                                                Coverage
                                            </span>
                                        </div>
                                        <p className="text-xs text-[var(--ink-3)] mt-2 flex items-center gap-1">
                                            <Users size={12} />
                                            {district.totalChildren} tracked
                                        </p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="text-[var(--ink-3)] flex flex-col items-center">
                        <Users size={32} className="mb-3 opacity-50" />
                        <p>No community data available.</p>
                    </div>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-[var(--ink-3)]">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-green-50 border border-green-200" />
                    Optimal (&ge;95%)
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-white border border-[var(--border)]" />
                    Acceptable (90-94%)
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-red-50 border border-red-200" />
                    High Risk (&lt;90%)
                </div>
            </div>
        </div>
    );
}
