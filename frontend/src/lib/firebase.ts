// frontend/src/lib/firebase.ts
// -------------------------
// Firebase initialization. Import this everywhere auth or Firestore is needed.
// CRITICAL: Only initialize once — this file exports the singleton instances.
// CRITICAL: All env vars must be NEXT_PUBLIC_ prefixed to be available client-side.

import { initializeApp, getApps, getApp } from "firebase/app";
import {
    getAuth,
    GoogleAuthProvider,
    RecaptchaVerifier,
    signInWithPopup,
    signInWithPhoneNumber,
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    type User,
} from "firebase/auth";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    serverTimestamp,
    increment,
    type Unsubscribe,
} from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// Singleton — safe in Next.js hot reload
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── Auth helpers ──────────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User> {
    const result = await signInWithPopup(auth, googleProvider);
    await _ensureUserDoc(result.user);
    return result.user;
}

export async function signInWithPhone(
    phone: string,
    recaptchaContainerId: string
): Promise<{ verificationId: string; recaptchaVerifier: RecaptchaVerifier }> {
    const recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
        size: "invisible",
    });
    const confirmationResult = await signInWithPhoneNumber(auth, phone, recaptchaVerifier);
    return { verificationId: confirmationResult.verificationId, recaptchaVerifier };
}

export async function signUpWithEmail(email: string, pass: string): Promise<User> {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    await _ensureUserDoc(result.user);
    await sendEmailVerification(result.user);
    return result.user;
}

export async function signInWithEmail(email: string, pass: string): Promise<User> {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
}

export async function logOut(): Promise<void> {
    await signOut(auth);
}

export function getCurrentUser(): User | null {
    return auth.currentUser;
}

export async function getIdToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
}

// ── Create user doc on first login ────────────────────────────────────────────

async function _ensureUserDoc(user: User): Promise<void> {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        await setDoc(ref, {
            uid: user.uid,
            name: user.displayName || "",
            email: user.email || "",
            phone: user.phoneNumber || "",
            language: "en",
            role: "parent",
            district: "",
            state: "",
            createdAt: serverTimestamp(),
        });
    }
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

export function subscribeToChildren(
    parentUid: string,
    callback: (children: any[]) => void
): Unsubscribe {
    // Real-time listener — fires immediately + on every change
    const q = query(
        collection(db, "children"),
        where("parentUid", "==", parentUid),
        orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snapshot) => {
        const children = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(children);
    });
}

export async function getVaccineRecords(childId: string): Promise<any[]> {
    const q = query(
        collection(db, "children", childId, "vaccineRecords"),
        orderBy("dateGiven", "asc")
    );
    const snap = await import("firebase/firestore").then(({ getDocs }) => getDocs(q));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveVaccineRecord(childId: string, record: object): Promise<string> {
    const ref = doc(collection(db, "children", childId, "vaccineRecords"));
    await setDoc(ref, { ...record, createdAt: serverTimestamp() });
    return ref.id;
}

export async function addChild(parentUid: string, childData: object): Promise<string> {
    const ref = doc(collection(db, "children"));
    await setDoc(ref, {
        ...childData,
        childId: ref.id,
        parentUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        riskScore: 0,
    });
    return ref.id;
}

export function subscribeToChildRecords(
    childId: string,
    callback: (records: any[]) => void
): Unsubscribe {
    const q = query(
        collection(db, "children", childId, "vaccineRecords"),
        orderBy("dateGiven", "desc")
    );
    return onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(records);
    });
}

export async function getChildDoc(childId: string): Promise<any> {
    const ref = doc(db, "children", childId);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateUserLanguage(uid: string, language: string): Promise<void> {
    await updateDoc(doc(db, "users", uid), { language });
}

export async function savePushToken(uid: string, subscriptionJson: string): Promise<void> {
    await updateDoc(doc(db, "users", uid), { pushToken: subscriptionJson });
}

export { auth, db, onAuthStateChanged, serverTimestamp };
