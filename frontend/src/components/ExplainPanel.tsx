'use client';
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';

interface Props {
    childName: string; riskScore: number; shapValues: Record<string, number>;
    features: Record<string, any>; language: string; onClose: () => void;
}

export default function ExplainPanel({ childName, riskScore, shapValues, features, language, onClose }: Props) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:8000/explain', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                child_name: childName,
                risk_score: Math.round(riskScore),
                shap_values: shapValues || {},
                features: features || {},
                language: language || 'english'
            }),
        }).then(async r => {
            const json = await r.json();
            if (!r.ok) console.error("Explain error:", json);
            return json;
        }).then(d => {
            // The backend returns { nl_explanation: "..." }
            setData({
                ...d,
                explanation: d.nl_explanation || d.explanation
            });
            setLoading(false);
        });
    }, []);

    // Prepare SHAP chart data — sorted by absolute contribution
    const chartData = data?.shap_features?.map((f: any) => ({
        name: f.feature.replace('Child ', '').replace(' so far', ''),
        value: parseFloat(f.contribution.toFixed(3)),
    })) ?? [];

    return (
        <div className='bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden mt-4 animate-in slide-in-from-top-4 duration-300'>

            {/* Header */}
            <div className='bg-gray-900 text-white px-5 py-4 flex justify-between items-center'>
                <div>
                    <h3 className='font-bold text-lg'>Why {childName} has this risk score</h3>
                    <p className='text-gray-400 text-xs mt-0.5'>SHAP  ·  DiCE  ·  Gemini — Three-layer AI explanation</p>
                </div>
                <button onClick={onClose} className='text-gray-400 text-2xl hover:text-white cursor-pointer'>×</button>
            </div>

            {loading ? (
                <div className='flex flex-col items-center justify-center py-16 gap-3'>
                    <div className='animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent' />
                    <p className='text-gray-500 text-sm'>Generating explanation...</p>
                </div>
            ) : data && (
                <div className='p-5 space-y-5'>

                    {/* ── LAYER 1: SHAP Chart ─────────────────────────────── */}
                    <div className='bg-gray-50 rounded-xl p-4'>
                        <div className='flex items-center gap-2 mb-3'>
                            <span className='bg-blue-600 text-white text-xs px-2 py-0.5 rounded font-bold'>SHAP</span>
                            <p className='text-sm font-semibold text-gray-800'>Feature Contributions to Risk Score</p>
                        </div>
                        <ResponsiveContainer width='100%' height={220}>
                            <BarChart layout='vertical' data={chartData}
                                margin={{ top: 0, right: 30, bottom: 0, left: 20 }}>
                                <XAxis type='number' tick={{ fontSize: 11 }} tickFormatter={v => `${v > 0 ? '+' : ''}${v}`} />
                                <YAxis dataKey='name' type='category' width={160} tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(v: any) => [(v > 0 ? '+' : '') + Number(v).toFixed(3), 'SHAP contribution']} />
                                <Bar dataKey='value' radius={[0, 4, 4, 0]}>
                                    {chartData.map((_: any, i: number) => (
                                        <Cell key={i} fill={chartData[i].value > 0 ? '#DC2626' : '#16A34A'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        <p className='text-xs text-gray-400 mt-2 text-center'>Red = increases risk  ·  Green = reduces risk</p>
                    </div>

                    {/* ── LAYER 2: DiCE Counterfactuals ─────────────────── */}
                    <div className='bg-blue-50 rounded-xl p-4'>
                        <div className='flex items-center gap-2 mb-3'>
                            <span className='bg-blue-700 text-white text-xs px-2 py-0.5 rounded font-bold'>DiCE</span>
                            <p className='text-sm font-semibold text-gray-800'>What Would Lower the Risk</p>
                        </div>
                        <div className='space-y-2'>
                            {data.counterfactuals?.map((cf: any) => (
                                <div key={cf.scenario} className='bg-white rounded-lg px-4 py-3 border border-blue-200'>
                                    <p className='text-sm text-gray-800'>{cf.action}</p>
                                    <p className='text-xs text-blue-600 mt-1 font-medium'>
                                        New score: {cf.new_score}/100
                                        {cf.new_score < 40 ? ' — Low Risk ✓' : ' — Reduced Risk'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── LAYER 3: Gemini Natural Language ─────────────── */}
                    <div className='bg-purple-50 rounded-xl p-4 border border-purple-200'>
                        <div className='flex items-center gap-2 mb-3'>
                            <span className='bg-purple-700 text-white text-xs px-2 py-0.5 rounded font-bold'>Gemini</span>
                            <p className='text-sm font-semibold text-gray-800'>In Plain Language</p>
                            <span className='ml-auto text-xs text-purple-500 capitalize'>{data.language}</span>
                        </div>
                        <p className='text-base text-gray-800 leading-relaxed'>{data.explanation}</p>
                    </div>

                </div>
            )}
        </div>
    );
}
