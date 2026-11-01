"use client";

import { useCallback, useEffect, useState } from "react";

interface UploadedDoc {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  extractedText: string;
  extractionStatus: string;
  extractionConfidence: number;
  createdAt: string;
}

const ALLOWED_EXTENSIONS = ["pdf", "docx", "doc", "xlsx", "xls", "csv", "txt"];

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<UploadedDoc | null>(null);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }, []);

  async function uploadFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file type: .${ext}. Supported: ${ALLOWED_EXTENSIONS.join(", ")}`);
      return;
    }

    setError("");
    setUploading(true);
    setUploadedDoc(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/v1/documents/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
      } else {
        setUploadedDoc(data);
        setDocuments((prev) => [data, ...prev]);
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setUploading(false);
    }
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Documents</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Upload Document</h1>
        <p className="mt-1 text-sm text-ink-500">
          Upload denial letters, EOBs, or any document. We'll extract the text automatically.
        </p>
      </header>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
          isDragging
            ? "border-ledger-500 bg-ledger-50"
            : "border-ink-300/40 bg-white hover:border-ink-300"
        }`}
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ink-950/5">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-500">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        {uploading ? (
          <div>
            <div className="mb-2 text-lg font-medium text-ink-700">Processing document...</div>
            <div className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-ink-200">
              <div className="h-full animate-pulse rounded-full bg-ledger-500" style={{ width: "70%" }} />
            </div>
          </div>
        ) : (
          <>
            <p className="text-lg font-medium text-ink-700">
              {isDragging ? "Drop your file here" : "Drag & drop your document"}
            </p>
            <p className="mt-1 text-sm text-ink-500">or click to browse</p>
            <p className="mt-3 text-xs text-ink-400">
              Supports: PDF, DOCX, XLSX, CSV, TXT (max 50MB)
            </p>
          </>
        )}

        <input
          type="file"
          onChange={handleFileSelect}
          accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt"
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={uploading}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Result */}
      {uploadedDoc && (
        <div className="mt-6 rounded-xl border border-ink-200 bg-white">
          <div className="flex items-center justify-between border-b border-ink-200 px-6 py-4">
            <div>
              <h3 className="font-medium text-ink-900">{uploadedDoc.fileName}</h3>
              <p className="text-xs text-ink-500">
                {uploadedDoc.fileType.toUpperCase()} · {formatBytes(uploadedDoc.fileSizeBytes)} ·{" "}
                <span className={uploadedDoc.extractionStatus === "completed" ? "text-green-600" : "text-red-600"}>
                  {uploadedDoc.extractionStatus}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-ledger-50 px-3 py-1 text-xs font-medium text-ledger-700">
                {Math.round((uploadedDoc.extractionConfidence || 0) * 100)}% confidence
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(uploadedDoc.extractedText);
                }}
                className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50"
              >
                Copy Text
              </button>
            </div>
          </div>

          <div className="p-6">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Extracted Text</h4>
            <pre className="max-h-96 overflow-auto rounded-lg bg-parchment p-4 text-sm leading-relaxed text-ink-700 whitespace-pre-wrap font-mono">
              {uploadedDoc.extractedText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
