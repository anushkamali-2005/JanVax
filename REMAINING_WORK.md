# JanVax — Remaining Work

> Auto-generated audit on 2026-03-05. Every item below is something **genuinely missing**
> from the codebase — not a nice-to-have.

---

## 🔴 CRITICAL — App Will Crash Without These

### 1. `frontend/src/components/OCRScanner.tsx` — **MISSING**
- The OCR page (`app/ocr/page.tsx` line 6) imports `<OCRScanner />` but this component **does not exist**.
- Should use **Tesseract.js** for in-browser OCR, capture from camera/file upload, and call the `/ocr-clean` backend API.

### 2. `frontend/src/components/HerdImmunityMap.tsx` — **MISSING**
- The community page (`app/community/page.tsx` line 5) imports `<HerdImmunityMap />` but this component **does not exist**.
- Should render a **D3.js** India district map with color-coded vaccination coverage, fetching data from `/community/coverage`.

### 3. Dashboard missing icon imports — **BUG**
- `app/dashboard/page.tsx` uses `<Globe>` (line 231) and `<Smartphone>` (line 248) but **neither is imported** in line 5.
- Fix: add `Globe, Smartphone` to the lucide-react import.

---

## 🟡 IMPORTANT — Needed for Full Demo

### 4. `frontend/.env.local` — **MISSING**
- No `.env.local` template exists for the frontend. Without it, Firebase won't initialize.
- Needs these keys:
  ```
  NEXT_PUBLIC_FIREBASE_API_KEY=
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
  NEXT_PUBLIC_FIREBASE_PROJECT_ID=
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
  NEXT_PUBLIC_FIREBASE_APP_ID=
  NEXT_PUBLIC_API_URL=http://localhost:8000
  ```

### 5. `seed_firebase.py` not copied to project root — **MISPLACED**
- The seed script exists at `implementation/seed_firebase.py` but was **never copied** to the project root or `backend/`.
- Needed to populate Firestore with demo children/records for the presentation.

### 6. `backend/.env` file — **MISSING**
- Only `.env.example` exists. Actual `.env` with real credentials must be created manually.
- Required keys: Firebase, PostgreSQL, Gemini API, Polygon, Twilio.

### 7. QR Passport not integrated into any page — **DISCONNECTED**
- `components/QRVaccinePassport.tsx` exists but is **not imported or rendered** by any page.
- Should be added to `app/child/[id]/page.tsx` (e.g., as a tab or modal).

---

## 🟢 NICE-TO-HAVE — Polish for Hackathon

### 8. Root-level `README.md` — **MISSING**
- Only `frontend/README.md` (Next.js default) exists. No project-level README.
- Should cover: problem, tech stack, setup instructions, architecture diagram, demo screenshots.

### 9. `backend/models/` directory — **MISSING**
- `shap_explainer.py` and `dice_explainer.py` expect a trained model at `backend/models/xgb_model.pkl`.
- The `ml/train.py` script saves it there, but the **directory doesn't exist** and `train.py` hasn't been run in the deployed structure.

### 10. NPM packages not installed after changes
- Frontend may need `npm install` if `recharts`, `framer-motion`, `qrcode`, `tesseract.js`, or `d3` were added to pages but not to `package.json`.
- Run `npm install recharts framer-motion qrcode d3 @types/d3 tesseract.js` in `frontend/`.

### 11. Hardhat test compatibility
- `blockchain/package.json` references Hardhat v2 but the lock file may have v3.
- Run `npm install` in `blockchain/` to resolve, then `npx hardhat test`.

---

## Summary Table

| # | File / Issue | Status | Priority |
|---|-------------|--------|----------|
| 1 | `components/OCRScanner.tsx` | ❌ Missing | 🔴 Critical |
| 2 | `components/HerdImmunityMap.tsx` | ❌ Missing | 🔴 Critical |
| 3 | Dashboard icon imports | 🐛 Bug | 🔴 Critical |
| 4 | `frontend/.env.local` template | ❌ Missing | 🟡 Important |
| 5 | `seed_firebase.py` location | 📁 Misplaced | 🟡 Important |
| 6 | `backend/.env` | ❌ Missing | 🟡 Important |
| 7 | QR Passport integration | 🔗 Disconnected | 🟡 Important |
| 8 | Root `README.md` | ❌ Missing | 🟢 Polish |
| 9 | `backend/models/` dir | ❌ Missing | 🟢 Polish |
| 10 | Frontend NPM deps | ⚠️ Unverified | 🟢 Polish |
| 11 | Hardhat test compat | ⚠️ Unverified | 🟢 Polish |
