/**
 * frontend/src/lib/firebase.ts
 * ----------------------------
 * Firebase client-side SDK initialization and Firestore helpers.
 *
 * CRITICAL: Uses NEXT_PUBLIC_* env vars — these are baked into the JS bundle.
 * CRITICAL: init() is called once at module load — safe to import anywhere.
 * CRITICAL: onAuthStateChanged returns an unsubscribe function — call it in useEffect cleanup.
 */

import { initializeApp, getApps } from "firebase/app";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged as _onAuthStateChanged,
    type User,
} from "firebase/auth";
import {
    getFirestore,
    collection,
    query,
    where,
    onSnapshot,
    addDoc,
    serverTimestamp,
    doc,
    getDoc,
    updateDoc,
    type Unsubscribe,
} from "firebase/firestore";

// ── Firebase config ───────────────────────────────────────────────────────────
// Values come from NEXT_PUBLIC_* environment variables (set in .env.local)

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize once — Next.js hot reload can re-run module, guard against that
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();


// ── Auth helpers ──────────────────────────────────────────────────────────────

/** Signs in with Google popup. Returns Firebase User. */
export async function signInWithGoogle(): Promise<User> {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
}

/** Signs out the current user. */
export async function logOut(): Promise<void> {
    return signOut(auth);
}

/** Returns the currently signed-in user synchronously, or null. */
export function getCurrentUser(): User | null {
    return auth.currentUser;
}

/**
 * Subscribes to Firebase auth state changes.
 * Returns an unsubscribe function — call in useEffect cleanup.
 *
 * @example
 * useEffect(() => {
 *   const unsub = onAuthStateChanged((user) => { ... });
 *   return () => unsub();
 * }, []);
 */
export function onAuthStateChanged(callback: (user: User | null) => void): Unsubscribe {
    return _onAuthStateChanged(auth, callback);
}


// ── Firestore: Children ───────────────────────────────────────────────────────

export interface ChildData {
    id: string;
    name: string;
    ageMonths: number;
    gender: string;
    district: string;
    state: string;
    parentUid: string;
    riskScore: number;
    riskDisease?: string;
    vaccinesMissedCount: number;
    daysOverdue: number;
    nextDueVaccine?: string;
    nextDueDate?: string;
    lastVaccine?: string;
    districtOutbreakFlag: number;
    siblingHistory: number;
    reminderIgnoreCount: number;
    createdAt?: unknown;
}

/**
 * Real-time subscription to a parent's children.
 * Calls `callback` whenever Firestore data changes.
 * Returns an unsubscribe function.
 */
export function subscribeToChildren(
    parentUid: string,
    callback: (children: ChildData[]) => void,
): Unsubscribe {
    const q = query(
        collection(db, "children"),
        where("parentUid", "==", parentUid),
    );

    return onSnapshot(q, (snapshot) => {
        const children: ChildData[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ChildData, "id">),
        }));
        callback(children);
    });
}

/**
 * Adds a new child document to Firestore.
 * Returns the new document ID.
 */
export async function addChild(
    parentUid: string,
    data: Omit<ChildData, "id" | "parentUid" | "createdAt">,
): Promise<string> {
    const ref = await addDoc(collection(db, "children"), {
        ...data,
        parentUid,
        createdAt: serverTimestamp(),
        riskScore: 0,
        vaccinesMissedCount: 0,
        daysOverdue: 0,
        reminderIgnoreCount: 0,
        districtOutbreakFlag: 0,
        siblingHistory: 0,
    });
    return ref.id;
}

/**
 * Fetches a single child document by ID.
 * Returns null if not found.
 */
export async function getChildById(childId: string): Promise<ChildData | null> {
    const snap = await getDoc(doc(db, "children", childId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<ChildData, "id">) };
}


// ── Firestore: Users ──────────────────────────────────────────────────────────

/**
 * Saves or updates user profile in Firestore.
 * Called after Google Sign-In to persist name, email, and language preference.
 */
export async function saveUserProfile(
    uid: string,
    data: { displayName: string; email: string; language?: string; phone?: string },
): Promise<void> {
    await updateDoc(doc(db, "users", uid), {
        ...data,
        updatedAt: serverTimestamp(),
    }).catch(async () => {
        // Document doesn't exist yet — create it
        const { setDoc } = await import("firebase/firestore");
        await setDoc(doc(db, "users", uid), {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    });
}
