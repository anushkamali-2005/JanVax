'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    CalendarDays, ArrowLeft, CheckCircle2,
    Clock, AlertCircle, Baby
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

import { buildRoadmap, countByStatus, Milestone } from '@/lib/vaccineSchedule';

export default function RoadmapPage() {
    const router = useRouter();

    // 1. State for DOB
    const [dob, setDob] = useState<string>(() => {
        // Default to today for immediate visual feedback
        const today = new Date();
        return today.toISOString().split('T')[0];
    });

    // 2. Pre-fill DOB from Firebase if child exists
    useEffect(() => {
        const fetchChild = async () => {
            const user = auth.currentUser;
            if (!user) return;
            const q = query(collection(db, 'children'), where('userId', '==', user.uid));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const child = snap.docs[0].data();
                if (child.dateOfBirth) {
                    setDob(child.dateOfBirth);
                }
            }
        };
        fetchChild();
    }, []);

    // 3. Derived state: Generate timeline instantly when DOB changes
    const milestones = useMemo(() => {
        const dobDate = new Date(dob);
        // Invalid date fallback
        if (isNaN(dobDate.getTime())) return buildRoadmap(new Date());
        return buildRoadmap(dobDate);
    }, [dob]);

    const counts = useMemo(() => countByStatus(milestones), [milestones]);

    // 4. Auto-scroll to the "due_now" milestone
    const dueNowRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (dueNowRef.current) {
            setTimeout(() => {
                dueNowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500); // Slight delay ensures rendering is complete
        }
    }, [dob]); // re-run if DOB changes

    return (
        <div className='min-h-screen bg-slate-50 text-slate-900 font-sans pb-20'>

            {/* ── Top Header Bar ── */}
            <header className='bg-blue-900 text-white px-6 py-4 flex items-center gap-4 sticky top-0 z-50 shadow-md print:hidden'>
                <button onClick={() => router.back()} className='p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors'>
                    <ArrowLeft className='w-6 h-6' />
                </button>
                <div>
                    <h1 className='text-xl font-bold'>Vaccine Roadmap</h1>
                    <p className='text-blue-200 text-sm'>National Immunization Schedule</p>
                </div>
            </header>

            <div className='max-w-3xl mx-auto px-4 mt-6'>

                {/* ── Controls & Summary ── */}
                <div className='bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8 print:hidden'>

                    <div className='flex flex-col md:flex-row gap-6 items-start md:items-center justify-between mb-8'>
                        <div className='flex items-center gap-3 w-full md:w-auto'>
                            <div className='p-3 bg-blue-100 text-blue-700 rounded-xl'>
                                <Baby className='w-6 h-6' />
                            </div>
                            <div className='flex-1'>
                                <label className='block text-sm font-bold text-slate-700 mb-1'>Child's Date of Birth</label>
                                <input
                                    type='date'
                                    value={dob}
                                    onChange={(e) => setDob(e.target.value)}
                                    className='w-full bg-slate-100 border-none rounded-lg px-4 py-2 font-medium text-slate-900 focus:ring-2 focus:ring-blue-500'
                                />
                            </div>
                        </div>

                        <div className='flex gap-4 w-full md:w-auto bg-slate-50 p-3 rounded-xl border border-slate-100'>
                            <div className='text-center px-4 border-r border-slate-200'>
                                <p className='text-2xl font-black text-slate-800'>{counts.total}</p>
                                <p className='text-xs font-bold text-slate-500 uppercase tracking-wider'>Total</p>
                            </div>
                            <div className='text-center px-2'>
                                <p className='text-2xl font-black text-green-600'>{counts.past}</p>
                                <p className='text-xs font-bold text-slate-500 uppercase tracking-wider'>Done</p>
                            </div>
                            <div className='text-center px-4 border-l border-slate-200'>
                                <p className='text-2xl font-black text-blue-600'>{counts.upcoming}</p>
                                <p className='text-xs font-bold text-slate-500 uppercase tracking-wider'>Left</p>
                            </div>
                        </div>
                    </div>

                    {/* ── Progress Bar ── */}
                    <div className='w-full h-3 bg-slate-100 rounded-full overflow-hidden flex'>
                        <div
                            className='h-full bg-green-500 transition-all duration-1000'
                            style={{ width: `${(counts.past / counts.total) * 100}%` }}
                        />
                        {counts.due_now > 0 && (
                            <div
                                className='h-full bg-amber-400 animate-pulse'
                                style={{ width: `${(1 / counts.total) * 100}%` }}
                            />
                        )}
                    </div>

                    <div className='flex justify-between mt-3 text-xs font-bold text-slate-500'>
                        <span className='flex items-center gap-1 text-green-600'><CheckCircle2 className='w-3 h-3' /> Completed</span>
                        <span className='flex items-center gap-1 text-amber-500'><AlertCircle className='w-3 h-3' /> Due Now</span>
                        <span className='flex items-center gap-1 text-blue-500'><Clock className='w-3 h-3' /> Upcoming</span>
                    </div>
                </div>

                {/* Print Header */}
                <div className='hidden print:block mb-8 pb-4 border-b-2 border-slate-800'>
                    <h1 className='text-3xl font-black text-slate-900'>JanVax Personalized Vaccine Schedule</h1>
                    <p className='text-lg text-slate-600 mt-2'>Child's Date of Birth: <strong>{new Date(dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
                </div>

                {/* ── The Vertical Timeline ── */}
                <div className='relative py-4'>
                    {/* Vertical centre line */}
                    <div className='absolute left-1/2 top-0 bottom-0 w-0.5 bg-blue-900/20 -translate-x-1/2 z-0 print:bg-slate-300' />

                    <div className='space-y-12 print:space-y-8'>
                        {milestones.map((m, index) => (
                            <MilestoneCard
                                key={m.id}
                                milestone={m}
                                isLeft={index % 2 === 0}
                                ref={m.status === 'due_now' ? dueNowRef : null}
                            />
                        ))}
                    </div>
                </div>

                {/* ── Print PDF Button ── */}
                <div className='mt-12 flex justify-center print:hidden'>
                    <button
                        onClick={() => window.print()}
                        className='py-3 px-8 bg-blue-900 text-white rounded-xl font-bold hover:bg-blue-800 transition-colors flex items-center gap-2 shadow-lg'
                    >
                        <CalendarDays className='w-5 h-5' />
                        Download Schedule PDF
                    </button>
                </div>

            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        @media print {
          body { background: white !important; }
          .min-h-screen { min-height: auto !important; padding-bottom: 0 !important; }
          .shadow-sm, .shadow-lg { box-shadow: none !important; }
        }
      `}} />
        </div>
    );
}

// ── MilestoneCard Sub-component ─────────────────────────────────────────
import { forwardRef } from 'react';

const MilestoneCard = forwardRef<HTMLDivElement, {
    milestone: Milestone;
    isLeft: boolean;
}>(({ milestone: m, isLeft }, ref) => {

    const styles = {
        past: {
            card: 'bg-slate-50 border border-slate-200 opacity-75 print:opacity-100 print:bg-white',
            title: 'text-slate-500 print:text-slate-800',
            date: 'text-slate-400 print:text-slate-600',
            bullet: 'text-slate-500 print:text-slate-700',
            dot: 'bg-slate-300 border-white',
        },
        due_now: {
            card: 'bg-white border-2 border-amber-400 shadow-xl shadow-amber-500/10 print:border-slate-800 print:shadow-none',
            title: 'text-blue-900 print:text-black',
            date: 'text-amber-600 font-bold print:text-black',
            bullet: 'text-slate-800 font-medium print:text-black',
            dot: 'bg-amber-500 border-white',
        },
        upcoming: {
            card: 'bg-blue-50/50 border border-blue-200 print:bg-white print:border-slate-300',
            title: 'text-blue-800 print:text-slate-800',
            date: 'text-blue-600 print:text-slate-600',
            bullet: 'text-slate-600 print:text-slate-700',
            dot: 'bg-blue-300 border-white print:bg-slate-300',
        },
    }[m.status];

    return (
        <div ref={ref} className={`flex items-center gap-4 ${isLeft ? 'flex-row' : 'flex-row-reverse'} relative z-10 break-inside-avoid print:opacity-100`}>

            {/* The card (takes ~45% width) */}
            <div className={`w-5/12 rounded-2xl p-5 relative transition-all duration-300 ${styles.card}`}>

                {m.status === 'past' && (
                    <span className='absolute -top-3 -right-3 bg-green-500 text-white text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider shadow-sm print:hidden'>
                        Done
                    </span>
                )}
                {m.status === 'due_now' && (
                    <span className='absolute -top-3 -right-3 bg-amber-500 text-white text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider shadow-sm animate-bounce print:static print:inline-block print:ml-2 print:animate-none'>
                        Due Now
                    </span>
                )}

                <h3 className={`font-black tracking-tight leading-none mb-2 ${styles.title}`}>{m.label}</h3>
                <div className={`text-sm mb-4 font-mono ${styles.date}`}>
                    Due: {m.dueDateStr}
                </div>

                <div className='flex flex-col gap-2'>
                    {m.vaccines.map(v => (
                        <div key={v} className={`flex items-start gap-2 text-sm ${styles.bullet}`}>
                            <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${m.status === 'due_now' ? 'bg-amber-400 print:bg-slate-800' : 'bg-current opacity-40'}`} />
                            <span className='leading-snug'>{v}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* The timeline dot */}
            <div className='w-2/12 flex justify-center relative print:hidden'>
                {m.status === 'due_now' && (
                    <span className='absolute flex h-6 w-6 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'>
                        <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60'></span>
                    </span>
                )}
                <div className={`w-4 h-4 rounded-full border-2 relative z-10 shadow-sm ${styles.dot}`} />
            </div>

            {/* Empty spacer */}
            <div className='w-5/12 print:hidden' />
        </div>
    );
});

MilestoneCard.displayName = 'MilestoneCard';
