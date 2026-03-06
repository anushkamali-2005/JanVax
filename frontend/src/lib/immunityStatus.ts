import vaccineSchedule from '@/data/vaccine_schedule.json';

export type ImmunityStatus = 'green' | 'yellow' | 'red' | 'unknown';

export function getImmunityStatus(child: any): ImmunityStatus {
    const dob = new Date(child.dateOfBirth);
    const today = new Date();
    const given = new Set((child.vaccines || []).map((v: any) => v.name.toLowerCase()));

    let mostUrgent: 'green' | 'yellow' | 'red' = 'green';

    for (const milestone of vaccineSchedule) {
        // Note: The vaccine_schedule.json uses 'offsetDays', the doc used 'days_offset'. Adapting to match our existing JSON file.
        const dueDate = new Date(dob);
        dueDate.setDate(dueDate.getDate() + (milestone as any).offsetDays);
        const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);

        for (const vaccine of milestone.vaccines) {
            if (given.has(vaccine.toLowerCase())) continue;  // already given
            if (diffDays < 0) { mostUrgent = 'red'; break; } // overdue
            else if (diffDays <= 30) { if (mostUrgent !== 'red') mostUrgent = 'yellow'; } // due soon
        }
    }
    return mostUrgent;
}

export function getNextDueVaccine(child: any): { name: string; daysUntil: number } | null {
    const dob = new Date(child.dateOfBirth);
    const today = new Date();
    const given = new Set((child.vaccines || []).map((v: any) => v.name.toLowerCase()));

    for (const milestone of vaccineSchedule) {
        const dueDate = new Date(dob);
        dueDate.setDate(dueDate.getDate() + (milestone as any).offsetDays);
        const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);
        for (const vaccine of milestone.vaccines) {
            if (!given.has(vaccine.toLowerCase())) {
                return { name: vaccine, daysUntil: diffDays };
            }
        }
    }
    return null;  // all vaccines given
}
