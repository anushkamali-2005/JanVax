'use client';
import { useState, useEffect, useRef } from 'react';

interface FeedEntry {
    time: string;
    agent: string;
    message: string;
    type: string;
}

interface Session {
    status: string;
    attempt_number: number;
    offered_slot: string;
    offered_centre: string;
    confirmed_slot: string;
    agent_log: string;
}

const AGENT_COLORS: Record<string, string> = {
    risk_analyst: 'text-red-400',
    devils_advocate: 'text-amber-400',
    decider: 'text-blue-400',
    action_node: 'text-purple-400',
    scheduler_node: 'text-cyan-400',
    parent_reply: 'text-green-400',
};

function parseLog(raw: string): FeedEntry[] {
    return raw.trim().split('\n').filter(Boolean).map(line => {
        // Format: [HH:MM:SS] agent_name: message
        const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\] ([^:]+): (.+)$/);
        if (!match) return { time: '', agent: 'system', message: line, type: 'system' };
        const [, time, agent, message] = match;
        const type = agent.includes('parent') ? 'parent'
            : agent.includes('scheduler') ? 'scheduler'
                : 'agent';
        return { time, agent, message, type };
    });
}

export default function AgentFeed({ childId }: { childId: string }) {
    const [session, setSession] = useState<Session | null>(null);
    const [entries, setEntries] = useState<FeedEntry[]>([]);
    const [visible, setVisible] = useState(0);   // animate entries in one by one
    const bottomRef = useRef<HTMLDivElement>(null);

    // Poll every 3 seconds while status is pending
    useEffect(() => {
        const poll = async () => {
            try {
                const res = await fetch(`http://localhost:8000/agent/session/${childId}`);
                const data = await res.json();
                if (data.status === 'none') return;
                setSession(data);
                setEntries(parseLog(data.agent_log || ''));
            } catch {
                // backend unreachable — silently skip
            }
        };

        poll();
        const interval = setInterval(() => {
            if (session?.status === 'pending') poll();
        }, 3000);
        return () => clearInterval(interval);
    }, [childId, session?.status]);

    // Animate entries appearing one by one (300ms gap)
    useEffect(() => {
        if (visible < entries.length) {
            const t = setTimeout(() => setVisible(v => v + 1), 300);
            return () => clearTimeout(t);
        }
    }, [visible, entries.length]);

    // Reset animation counter when entries change (new poll)
    useEffect(() => {
        setVisible(0);
    }, [entries.length]);

    // Auto-scroll to bottom as new entries appear
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [visible]);

    if (!session || session.status === 'none') return null;

    const statusConfig = ({
        pending: { label: 'Negotiating...', color: 'bg-blue-500', pulse: true },
        confirmed: { label: 'Confirmed', color: 'bg-green-500', pulse: false },
        escalated: { label: 'Escalated', color: 'bg-amber-500', pulse: false },
        failed: { label: 'Failed', color: 'bg-red-500', pulse: false },
    } as any)[session.status] ?? { label: session.status, color: 'bg-gray-500', pulse: false };

    return (
        <div className='mt-6 bg-gray-950 rounded-2xl overflow-hidden border border-gray-800'>
            {/* Header bar */}
            <div className='flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800'>
                <div className='flex items-center gap-2'>
                    <div className={`w-2 h-2 rounded-full ${statusConfig.color}
                        ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
                    <span className='text-white font-mono text-sm font-bold'>Agent Negotiation Feed</span>
                </div>
                <div className='flex items-center gap-3'>
                    <span className='text-gray-400 text-xs'>Attempt {session.attempt_number} / 3</span>
                    <span className={`px-2 py-1 rounded text-xs font-bold text-white ${statusConfig.color}`}>
                        {statusConfig.label}
                    </span>
                </div>
            </div>

            {/* Log feed */}
            <div className='h-64 overflow-y-auto p-4 space-y-3 font-mono text-sm'>
                {entries.slice(0, visible).map((entry, i) => (
                    <div key={i} className={`flex gap-3 items-start
                        ${entry.type === 'parent' ? 'flex-row-reverse' : ''}`}>
                        <div className={`flex-1 rounded-lg px-3 py-2
                            ${entry.type === 'parent' ? 'bg-green-950 border border-green-800'
                                : entry.type === 'scheduler' ? 'bg-cyan-950 border border-cyan-800'
                                    : 'bg-gray-900 border border-gray-800'}`}>
                            <div className='flex justify-between mb-1'>
                                <span className={`text-xs font-bold
                                    ${AGENT_COLORS[entry.agent] ?? 'text-gray-400'}`}>
                                    {entry.agent} →
                                </span>
                                <span className='text-gray-600 text-xs'>{entry.time}</span>
                            </div>
                            <p className='text-gray-200 text-xs leading-relaxed'>{entry.message}</p>
                        </div>
                    </div>
                ))}
                {session.status === 'pending' && (
                    <div className='flex gap-1 px-3'>
                        {[0, 1, 2].map(i => (
                            <div key={i} className='w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce'
                                style={{ animationDelay: `${i * 150}ms` }} />
                        ))}
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Confirmed banner */}
            {session.status === 'confirmed' && (
                <div className='bg-green-900 border-t border-green-700 px-4 py-3 text-center'>
                    <p className='text-green-300 font-bold text-sm'>
                        Appointment confirmed: {session.confirmed_slot}
                    </p>
                    <p className='text-green-500 text-xs mt-1'>Reminder scheduled 24h before</p>
                </div>
            )}

            {/* Escalated banner */}
            {session.status === 'escalated' && (
                <div className='bg-amber-900 border-t border-amber-700 px-4 py-3 text-center'>
                    <p className='text-amber-300 font-bold text-sm'>
                        Escalated to doctor after {session.attempt_number} attempts
                    </p>
                </div>
            )}
        </div>
    );
}
