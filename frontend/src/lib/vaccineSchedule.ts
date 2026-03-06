import rawSchedule from '../data/vaccine_schedule.json';

// Define the shape of our raw JSON data
export interface ScheduleItem {
    id: string;
    label: string;
    offsetDays: number;
    vaccines: string[];
}

// Define the shape of a calculated milestone for a specific child
export interface Milestone extends ScheduleItem {
    dueDate: Date;       // The exact Date object when this is due
    dueDateStr: string;  // Formatted string (e.g., "15 Mar 2024")
    status: 'past' | 'due_now' | 'upcoming';
}

/**
 * Takes a child's Date of Birth and returns their complete personalised roadmap.
 */
export function buildRoadmap(dob: Date): Milestone[] {
    const schedule = rawSchedule as ScheduleItem[];
    const today = new Date();

    // Normalize today to start of day for clean comparisons
    today.setHours(0, 0, 0, 0);

    const milestones: Milestone[] = schedule.map(item => {
        // Calculate the exact due date by adding offsetDays to DOB
        const dueDate = new Date(dob);
        dueDate.setDate(dueDate.getDate() + item.offsetDays);

        // Format date nicely (e.g., "15 Mar 2024")
        const dueDateStr = dueDate.toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });

        return {
            ...item,
            dueDate,
            dueDateStr,
            // We start with all strictly in the past as 'past'
            status: dueDate < today ? 'past' : 'upcoming'
        };
    });

    // Business Logic: Identify the single "due_now" milestone.
    // This is the earliest milestone that is NOT in the past.
    const nextTarget = milestones.find(m => m.status === 'upcoming');
    if (nextTarget) {
        nextTarget.status = 'due_now';
    }

    return milestones;
}

/**
 * Helper to get the overview counts for the progress bar.
 */
export function countByStatus(milestones: Milestone[]) {
    return {
        past: milestones.filter(m => m.status === 'past').length,
        due_now: milestones.filter(m => m.status === 'due_now').length,
        upcoming: milestones.filter(m => m.status === 'upcoming').length,
        total: milestones.length,
    };
}
