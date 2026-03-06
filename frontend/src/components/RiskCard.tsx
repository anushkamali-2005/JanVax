'use client';
import { useState } from 'react';
import ExplainPanel from './ExplainPanel';

interface Props {
    childId: string; childName: string;
    features: Record<string, any>; language?: string;
}

export default function RiskCard({ childId, childName, features, language = 'english' }: Props) {
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showXAI, setShowXAI] = useState(false);

    const runPrediction = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:8000/predict', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ child_id: childId, ...features, language }),
            });
            const data = await res.json();
            // Backend returns top_score as the main number, and risk_scores record contains SHAP contributions
            setResult({
                ...data,
                risk_score: data.risk_score,
                shap_values: data.shap_values
            });
        } catch (err) {
            console.error("Prediction failed:", err);
        } finally {
            setLoading(false);
        }
    };

    const scoreColor = (s: number) => s >= 70 ? 'red' : s >= 40 ? 'amber' : 'green';
    const COLOR: Record<string, string> = { red: 'border-red-500 bg-red-50', amber: 'border-amber-500 bg-amber-50', green: 'border-green-500 bg-green-50' };
    const SCORE_TEXT: Record<string, string> = { red: 'text-red-700', amber: 'text-amber-700', green: 'text-green-700' };
    const score = result?.risk_score ?? null;
    const col = score !== null ? scoreColor(score) : 'green';

    return (
        <div className='space-y-3'>
            <div className={`rounded-2xl border-2 p-5 ${COLOR[col]}`}>
                <div className='flex items-center justify-between mb-3'>
                    <div>
                        <h3 className='font-bold text-gray-900 text-xl'>{childName}</h3>
                        <p className='text-xs text-gray-400 mt-0.5'>XGBoost · Model v2.3</p>
                    </div>
                    {score !== null && (
                        <div className={`text-right`}>
                            <p className={`text-5xl font-black ${SCORE_TEXT[col]}`}>{score}</p>
                            <p className='text-xs text-gray-400'>/ 100  RISK</p>
                        </div>
                    )}
                </div>

                {result?.who_flag_active && (
                    <div className='bg-red-100 border border-red-300 rounded-lg px-3 py-2 mb-3 text-sm text-red-800 font-medium'>
                        ⚠ WHO Disease Outbreak Active in Region
                    </div>
                )}

                <div className='flex gap-2'>
                    {!result ? (
                        <button onClick={runPrediction} disabled={loading}
                            className='flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-50 transition-all'>
                            {loading ? 'Analysing...' : 'Check Risk Score'}
                        </button>
                    ) : (
                        <button onClick={() => setShowXAI(true)}
                            className='flex-1 py-2.5 bg-gray-900 text-white rounded-xl font-medium text-sm transition-all'>
                            🧠 Explain This Score
                        </button>
                    )}
                </div>
            </div>

            {showXAI && result && (
                <ExplainPanel
                    childName={childName}
                    riskScore={result.risk_score}
                    shapValues={result.shap_values}
                    features={features}
                    language={language}
                    onClose={() => setShowXAI(false)}
                />
            )}
        </div>
    );
}
