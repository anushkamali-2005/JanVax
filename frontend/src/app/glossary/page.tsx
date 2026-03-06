'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Sparkles, AlertCircle, ArrowLeft, Globe, Activity, Stethoscope } from 'lucide-react';
import glossaryData from '@/data/glossary.json';

const LANGUAGES = [
    { code: 'english', label: 'English', flag: '🇬🇧' },
    { code: 'hindi', label: 'हिंदी', flag: '🇮🇳' },
    { code: 'tamil', label: 'தமிழ்', flag: '🌺' },
    { code: 'marathi', label: 'मराठी', flag: '🟠' },
    { code: 'bengali', label: 'বাংলা', flag: '🐯' },
    { code: 'telugu', label: 'తెలుగు', flag: '⭐' },
];

export default function GlossaryPage() {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [language, setLanguage] = useState('english');
    const [selected, setSelected] = useState<string | null>(null);
    const [aiResult, setAiResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const vaccineKeys = Object.keys(glossaryData as any);

    // Filter vaccine list by search term
    const filtered = useMemo(() =>
        vaccineKeys.filter(k => k.toLowerCase().includes(search.toLowerCase())),
        [search, vaccineKeys]
    );

    const handleAskAI = async () => {
        setLoading(true);
        setAiResult(null);
        setSelected(null);
        try {
            const res = await fetch(`http://localhost:8000/glossary/explain?name=${search}&language=${language}`);
            const data = await res.json();
            setAiResult(data);
        } catch (e) {
            setAiResult({ explanation: "Error reaching AI API. Please try again." });
        }
        setLoading(false);
    };

    const activeData = selected ? (glossaryData as any)[selected] : null;

    return (
        <div className='min-h-screen bg-slate-950 text-white p-6 md:p-12 font-sans'>
            {/* ── Header ── */}
            <header className='max-w-3xl mx-auto mb-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6'>
                <div>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className='flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm font-bold uppercase tracking-widest'
                    >
                        <ArrowLeft className='w-4 h-4' /> Back to Dashboard
                    </button>
                    <div className='flex items-center gap-4'>
                        <div className='w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20'>
                            <Globe className='w-8 h-8 text-white' />
                        </div>
                        <div>
                            <h1 className='text-3xl md:text-5xl font-black tracking-tight text-white mb-2'>AI Glossary</h1>
                            <p className='text-slate-400 font-medium'>Plain-language vaccine translations in 6 languages.</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto space-y-8">
                {/* ── Language Toggles ── */}
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 flex flex-wrap gap-2">
                    {LANGUAGES.map(lang => (
                        <button
                            key={lang.code}
                            onClick={() => setLanguage(lang.code)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${language === lang.code
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 scale-105'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'
                                }`}
                        >
                            <span className="text-lg">{lang.flag}</span>
                            {lang.label}
                        </button>
                    ))}
                </div>

                {/* ── Search Bar ── */}
                <div className="relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors w-6 h-6" />
                    <input
                        type="text"
                        placeholder="Search for a vaccine (e.g., 'BCG' or 'Polio')..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setSelected(null);
                            setAiResult(null);
                        }}
                        className="w-full bg-slate-900 border-2 border-white/10 rounded-3xl py-5 pl-16 pr-6 text-lg font-medium text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all shadow-inner"
                    />
                </div>

                {/* ── Results Chips ── */}
                {search && filtered.length > 0 && !selected && !aiResult && (
                    <div className="flex flex-wrap gap-3 animate-in fade-in slide-in-from-bottom-2">
                        {filtered.map(k => (
                            <button
                                key={k}
                                onClick={() => setSelected(k)}
                                className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95"
                            >
                                {k}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── AI Fallback Trigger ── */}
                {search && filtered.length === 0 && !aiResult && (
                    <div className="bg-purple-900/20 border border-purple-500/30 p-8 rounded-3xl text-center animate-in fade-in">
                        <AlertCircle className="w-12 h-12 text-purple-400 mx-auto mb-4 opacity-50" />
                        <p className="text-slate-300 font-medium mb-6">&quot;{search}&quot; is not in our local database.</p>
                        <button
                            onClick={handleAskAI}
                            disabled={loading}
                            className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-2xl font-bold shadow-xl shadow-purple-600/30 transition-all flex items-center gap-3 mx-auto disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Sparkles className="w-5 h-5" />
                            )}
                            {loading ? 'Asking Gemini AI...' : 'Ask AI Database'}
                        </button>
                    </div>
                )}

                {/* ── Details Card (Local JSON) ── */}
                {selected && activeData && (
                    <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                                <Stethoscope className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black">{selected}</h2>
                                <div className="text-blue-400 font-bold text-sm tracking-wide mt-1">Prevents: {activeData.prevents}</div>
                            </div>
                        </div>

                        <div className="space-y-8">
                            <div>
                                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-3">Simple Explanation</p>
                                <p className="text-xl font-medium leading-relaxed bg-white/5 p-6 rounded-2xl border border-white/5">
                                    {language === 'english' ? activeData.simple : activeData[language] || activeData.simple}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
                                <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <Activity className="w-5 h-5 text-emerald-400" />
                                        <span className="font-bold text-slate-300 text-sm uppercase tracking-wider">When Given</span>
                                    </div>
                                    <p className="font-bold">{activeData.when_given}</p>
                                </div>

                                <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <AlertCircle className="w-5 h-5 text-rose-400" />
                                        <span className="font-bold text-slate-300 text-sm uppercase tracking-wider">Side Effects</span>
                                    </div>
                                    <p className="font-bold text-slate-300">{activeData.side_effects}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── AI Result Card ── */}
                {aiResult && (
                    <div className="bg-gradient-to-br from-purple-900/40 to-indigo-900/40 border border-purple-500/30 rounded-[2.5rem] p-8 md:p-12 shadow-2xl shadow-purple-900/20 animate-in zoom-in-95 duration-300 relative overflow-hidden">
                        <div className="absolute -right-10 -top-10 opacity-10 pointer-events-none">
                            <Sparkles className="w-64 h-64 text-purple-300" />
                        </div>

                        <div className="flex items-center gap-4 mb-8 relative z-10">
                            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black capitalize">{aiResult.vaccine}</h2>
                                <div className="text-purple-400 font-bold text-sm tracking-wide mt-1 uppercase">AI Generated Explanation</div>
                            </div>
                        </div>

                        <p className="text-xl md:text-2xl font-medium leading-relaxed text-slate-200 relative z-10">
                            {aiResult.explanation}
                        </p>

                        <div className="mt-8 pt-6 border-t border-purple-500/20 flex justify-between items-center relative z-10">
                            <span className="text-xs font-bold text-purple-400/70 uppercase tracking-widest">Powered by Google Gemini</span>
                            <button
                                onClick={() => { setSearch(''); setAiResult(null); }}
                                className="text-sm font-bold text-white hover:text-purple-300 transition-colors"
                            >
                                Clear Search
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
