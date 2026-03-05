"use client";
// frontend/components/OCRScanner.tsx
// ------------------------------------
// WebRTC camera feed + Tesseract.js OCR + /ocr-clean API call.
// Displays extracted vaccine records in an editable table for parent review.
//
// CRITICAL: Tesseract.js v5 API — createWorker is async, loadLanguage is gone.
//           new API: await worker.load() then worker.recognize()
// CRITICAL: WebRTC getUserMedia needs HTTPS in production (Vercel handles this).
// CRITICAL: Dispose worker on unmount to free memory.
// CRITICAL: Show spinner during OCR — it takes 3-8 seconds on mobile.

import { useRef, useState, useEffect, useCallback } from "react";
import Tesseract from "tesseract.js";
import { cleanOCRText, type OCRResponse } from "@/lib/api";
import { saveVaccineRecord } from "@/lib/firebase";

interface ExtractedRecord {
  vaccineName: string;
  vaccineCode: string;
  dateGiven:   string;
  centerName:  string;
  confidence:  number;
  rawLine:     string;
  // Editable by parent
  edited?:     boolean;
}

interface Props {
  childId:  string;
  onSaved?: (records: ExtractedRecord[]) => void;
}

type ScanState = "idle" | "camera" | "scanning" | "review" | "saving" | "done";

export default function OCRScanner({ childId, onSaved }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const workerRef   = useRef<Tesseract.Worker | null>(null);

  const [scanState,  setScanState]  = useState<ScanState>("idle");
  const [records,    setRecords]    = useState<ExtractedRecord[]>([]);
  const [unmatched,  setUnmatched]  = useState<string[]>([]);
  const [error,      setError]      = useState<string>("");
  const [ocrProgress, setOcrProgress] = useState(0);

  // ── Init Tesseract worker ────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    Tesseract.createWorker("eng+hin", 1, {
      workerPath:   "https://unpkg.com/tesseract.js@v5/dist/worker.min.js",
      corePath:     "https://unpkg.com/tesseract.js-core@v5/tesseract-core-simd-lstm.wasm.js",
      logger: (m) => {
        if (m.status === "recognizing text" && mounted) {
          setOcrProgress(Math.round(m.progress * 100));
        }
      },
    }).then((worker) => {
      if (mounted) workerRef.current = worker;
    });

    return () => {
      mounted = false;
      workerRef.current?.terminate();
      _stopCamera();
    };
  }, []);

  // ── Camera ───────────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",   // rear camera on mobile
          width:      { ideal: 1280 },
          height:     { ideal: 720  },
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanState("camera");
    } catch (err: any) {
      setError(`Camera error: ${err.message}. Try uploading a photo instead.`);
    }
  }, []);

  const _stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // ── Capture + OCR ────────────────────────────────────────────────────────

  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current) return;

    setScanState("scanning");
    setOcrProgress(0);

    // Draw video frame to canvas
    const canvas = canvasRef.current;
    canvas.width  = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);

    _stopCamera();

    try {
      // Run Tesseract OCR
      const { data: { text } } = await workerRef.current.recognize(canvas);

      if (!text.trim()) {
        setError("No text detected. Try better lighting or a clearer photo.");
        setScanState("camera");
        await startCamera();
        return;
      }

      // Send to FastAPI /ocr-clean
      const result: OCRResponse = await cleanOCRText(text);

      setRecords(result.extracted_records as ExtractedRecord[]);
      setUnmatched(result.unmatched_lines);
      setScanState("review");

    } catch (err: any) {
      setError(`OCR failed: ${err.message}`);
      setScanState("idle");
    }
  }, [startCamera]);

  // Handle file upload fallback
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workerRef.current) return;

    setScanState("scanning");
    setOcrProgress(0);
    setError("");

    try {
      const { data: { text } } = await workerRef.current.recognize(file);
      const result: OCRResponse = await cleanOCRText(text);
      setRecords(result.extracted_records as ExtractedRecord[]);
      setUnmatched(result.unmatched_lines);
      setScanState("review");
    } catch (err: any) {
      setError(`Failed to process image: ${err.message}`);
      setScanState("idle");
    }
  }, []);

  // ── Edit records ─────────────────────────────────────────────────────────

  const updateRecord = (index: number, field: keyof ExtractedRecord, value: string) => {
    setRecords((prev) => prev.map((r, i) =>
      i === index ? { ...r, [field]: value, edited: true } : r
    ));
  };

  const removeRecord = (index: number) => {
    setRecords((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Save to Firebase ─────────────────────────────────────────────────────

  const saveAll = useCallback(async () => {
    setScanState("saving");
    try {
      for (const record of records) {
        await saveVaccineRecord(childId, {
          vaccineName: record.vaccineName,
          vaccineCode: record.vaccineCode,
          dateGiven:   record.dateGiven,
          centerName:  record.centerName,
          source:      "ocr-imported",
          verified:    false,
          polygonHash: "",
          polygonTxId: "",
        });
      }
      setScanState("done");
      onSaved?.(records);
    } catch (err: any) {
      setError(`Save failed: ${err.message}`);
      setScanState("review");
    }
  }, [records, childId, onSaved]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* IDLE */}
      {scanState === "idle" && (
        <div className="text-center space-y-4">
          <p className="text-gray-600 text-sm">
            Hold your paper vaccination card in front of the camera. We'll fill in the records automatically.
          </p>
          <button
            onClick={startCamera}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-xl w-full"
          >
            📷 Start Camera Scan
          </button>
          <label className="block text-center text-sm text-gray-500 cursor-pointer hover:text-green-600">
            Or upload a photo
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      )}

      {/* CAMERA */}
      {scanState === "camera" && (
        <div className="space-y-3">
          <video
            ref={videoRef}
            className="w-full rounded-xl border-2 border-green-400"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          <button
            onClick={captureAndScan}
            className="bg-green-500 hover:bg-green-600 text-white font-bold px-6 py-3 rounded-xl w-full text-lg"
          >
            📸 Capture & Scan
          </button>
        </div>
      )}

      {/* SCANNING */}
      {scanState === "scanning" && (
        <div className="text-center py-8 space-y-3">
          <div className="text-4xl animate-pulse">🔍</div>
          <p className="text-gray-700 font-medium">Reading vaccination card...</p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${ocrProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">{ocrProgress}%</p>
        </div>
      )}

      {/* REVIEW */}
      {scanState === "review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">
              Found {records.length} vaccine record{records.length !== 1 ? "s" : ""}
            </h3>
            <button
              onClick={() => { setScanState("idle"); setRecords([]); }}
              className="text-sm text-gray-500 hover:text-red-500"
            >
              Rescan
            </button>
          </div>

          <div className="space-y-2">
            {records.map((record, i) => (
              <div
                key={i}
                className={`border rounded-lg p-3 ${
                  record.confidence < 0.75 ? "border-yellow-400 bg-yellow-50" : "border-gray-200 bg-white"
                }`}
              >
                {record.confidence < 0.75 && (
                  <p className="text-xs text-yellow-700 mb-2">⚠️ Please verify this entry</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <label className="text-xs text-gray-500">Vaccine</label>
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={record.vaccineName}
                      onChange={(e) => updateRecord(i, "vaccineName", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Date Given</label>
                    <input
                      type="date"
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={record.dateGiven}
                      onChange={(e) => updateRecord(i, "dateGiven", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">Center</label>
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={record.centerName}
                      onChange={(e) => updateRecord(i, "centerName", e.target.value)}
                    />
                  </div>
                </div>
                <button
                  onClick={() => removeRecord(i)}
                  className="mt-2 text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {unmatched.length > 0 && (
            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer">
                {unmatched.length} line{unmatched.length > 1 ? "s" : ""} could not be matched
              </summary>
              <ul className="mt-2 space-y-1 pl-4">
                {unmatched.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </details>
          )}

          <button
            onClick={saveAll}
            disabled={records.length === 0}
            className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl w-full"
          >
            ✅ Save {records.length} Record{records.length !== 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* SAVING */}
      {scanState === "saving" && (
        <div className="text-center py-8">
          <div className="text-4xl animate-spin">⚙️</div>
          <p className="mt-3 text-gray-600">Saving records...</p>
        </div>
      )}

      {/* DONE */}
      {scanState === "done" && (
        <div className="text-center py-8 space-y-2">
          <div className="text-5xl">✅</div>
          <p className="text-green-700 font-semibold text-lg">Records saved!</p>
          <p className="text-gray-500 text-sm">
            {records.length} vaccination record{records.length !== 1 ? "s" : ""} added to Arjun's profile.
          </p>
        </div>
      )}
    </div>
  );
}
