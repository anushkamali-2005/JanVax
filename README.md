<div align="center">

# 🛡️ JanVax — Digital Vaccination Record Management System

**India's first self-improving, multi-agent, explainable and verifiable AI vaccination platform**

*Built for every Indian, from smartphones to feature phones.*

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green?logo=fastapi)](https://fastapi.tiangolo.com)
[![XGBoost](https://img.shields.io/badge/XGBoost-2.0-blue)](https://xgboost.readthedocs.io)
[![Polygon](https://img.shields.io/badge/Polygon-Mumbai-purple?logo=ethereum)](https://polygon.technology)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-orange?logo=firebase)](https://firebase.google.com)

</div>

---

## 🧠 Problem

India loses thousands of children annually to vaccine-preventable diseases — not because vaccines are unavailable, but because the **tracking system is broken**. Parents carry paper cards that get lost or damaged. Schedules are confusing. There is no single digital system a normal Indian parent can actually use.

## 💡 Solution

JanVax is a **complete AI-powered vaccination management platform** that combines:

- **Predictive AI** — XGBoost risk engine identifies high-risk children before outbreaks
- **Multi-Agent Reasoning** — LangGraph debate pipeline (Risk Analyst vs Devil's Advocate) reduces alert fatigue
- **Explainable AI** — SHAP + DiCE + Gemini NLP explain every decision in the parent's language
- **Blockchain Verification** — Every record and AI decision is SHA-256 hashed on Polygon for tamper-proof audit
- **In-Browser OCR** — Tesseract.js digitizes paper vaccination cards without uploading data

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)             │
│  Landing → Dashboard → Child Detail → OCR → Map     │
│  Firebase Auth  │  Recharts  │  D3.js  │ Tesseract  │
└────────────────────────┬────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────┐
│                   BACKEND (FastAPI)                   │
│  /predict  /explain  /agent  /verify  /ocr  /stats   │
│                                                       │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐   │
│  │ XGBoost  │  │ LangGraph │  │  Polygon Service │   │
│  │ + SHAP   │  │ 5 Agents  │  │  (Blockchain)    │   │
│  │ + DiCE   │  │ + Gemini  │  │  + PostgreSQL    │   │
│  └──────────┘  └───────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+, Python 3.11+, PostgreSQL

### 1. Clone & Install

```bash
git clone https://github.com/anushkamali-2005/JanVax.git
cd JanVax

# Frontend
cd frontend && npm install && cd ..

# Backend
cd backend && pip install -r requirements.txt && python -m spacy download en_core_web_sm && cd ..

# Blockchain
cd blockchain && npm install && cd ..
```

### 2. Configure Environment

```bash
# Frontend — copy and fill Firebase credentials
cp frontend/.env.example frontend/.env.local

# Backend — copy and fill API keys
cp backend/.env.example backend/.env
```

### 3. Run

```bash
# Terminal 1: Backend
cd backend && uvicorn main:app --reload

# Terminal 2: Frontend
cd frontend && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```
JanVax/
├── frontend/           # Next.js 14 (TypeScript + Tailwind)
│   ├── src/app/        # Pages: landing, dashboard, child, ocr, community, mlops, verify
│   ├── src/components/ # OCRScanner, HerdImmunityMap, QRVaccinePassport
│   └── src/lib/        # firebase.ts, api.ts
├── backend/            # FastAPI (Python)
│   ├── routers/        # predict, explain, agent, verify, ocr, stats, reminders
│   ├── services/       # firebase, gemini, polygon, twilio, reminder
│   ├── agents/         # LangGraph nodes, graph, memory, tools
│   ├── ml/             # XGBoost train, SHAP, DiCE, features
│   └── database/       # PostgreSQL async engine
├── blockchain/         # Hardhat + Solidity
│   └── contracts/      # VaxGuardAudit.sol
└── .github/workflows/  # CI: lint, test, retrain ML model
```

---

## 🎯 Key Features

| Feature | Tech | Status |
|---------|------|--------|
| Family Dashboard | Next.js + Firebase | ✅ |
| AI Risk Prediction | XGBoost + SHAP + DiCE | ✅ |
| Multi-Agent Debate | LangGraph (5 nodes) | ✅ |
| Gemini NL Explainer | Google Gemini API | ✅ |
| In-Browser OCR | Tesseract.js + spaCy + rapidfuzz | ✅ |
| QR Vaccine Passport | QRCode.js + Polygon | ✅ |
| Blockchain Audit Log | Solidity + Polygon Mumbai | ✅ |
| Herd Immunity Map | D3.js + SVG | ✅ |
| Smart Reminders | APScheduler + Twilio | ✅ |
| MLOps Dashboard | Recharts + MLflow | ✅ |
| CI/CD Pipeline | GitHub Actions | ✅ |

---

## 👥 Team

Built with ❤️ for India's children.

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
