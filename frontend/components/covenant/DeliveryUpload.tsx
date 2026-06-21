'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { storeDeliverable } from '@/lib/walrus';

interface DeliveryUploadProps {
  milestoneIndex: number;
  milestoneDescription: string;
  covenantId: string;
  onComplete: (milestoneIndex: number, blobId: string) => void;
  onCancel: () => void;
}

export function DeliveryUpload({
  milestoneIndex,
  milestoneDescription,
  covenantId,
  onComplete,
  onCancel,
}: DeliveryUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [blobId, setBlobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const result = await storeDeliverable(
        file,
        covenantId,
        milestoneIndex,
        (pct) => setProgress(pct),
      );
      setBlobId(result.blobId);
      setUploaded(true);
      setProgress(100);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (blobId) {
      onComplete(milestoneIndex, blobId);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold">Upload Delivery</h3>
          <p className="text-xs text-text-secondary mt-0.5">Milestone {milestoneIndex + 1}: {milestoneDescription}</p>
        </div>
        <button onClick={onCancel} className="text-text-tertiary hover:text-text-secondary transition-colors text-xl leading-none">
          ×
        </button>
      </div>

      {/* ── Drop zone ─── */}
      {!file && (
        <div
          id="delivery-dropzone"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className="relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200"
          style={{
            borderColor: isDragging ? '#4F8EF7' : '#1E2D4A',
            background: isDragging ? 'rgba(79,142,247,0.05)' : 'rgba(255,255,255,0.01)',
          }}
        >
          <input
            id="file-input"
            type="file"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div className="text-3xl mb-3">📁</div>
          <p className="text-sm font-semibold text-text-primary mb-1">
            Drag & drop your deliverable here
          </p>
          <p className="text-xs text-text-secondary mb-3">
            Supports all file types · Stored on Walrus (2-year retention)
          </p>
          <p className="text-xs text-text-tertiary">or click to browse</p>
        </div>
      )}

      {/* ── Selected file ─── */}
      <AnimatePresence>
        {file && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* File info */}
            <div className="flex items-center gap-4 p-4 bg-bg-elevated rounded-xl border border-bg-border">
              <div className="w-10 h-10 rounded-lg bg-accord-blue/20 flex items-center justify-center text-lg flex-shrink-0">
                {getFileEmoji(file.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{file.name}</p>
                <p className="text-xs text-text-secondary">{formatSize(file.size)} · {file.type || 'unknown'}</p>
              </div>
              {!uploading && !uploaded && (
                <button
                  onClick={() => { setFile(null); setProgress(0); }}
                  className="text-text-tertiary hover:text-text-secondary transition-colors text-lg"
                >
                  ×
                </button>
              )}
            </div>

            {/* Upload progress */}
            {(uploading || uploaded) && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-text-secondary">
                    {uploaded ? 'Stored on Walrus ✓' : 'Uploading to Walrus…'}
                  </p>
                  <span className="text-xs font-mono text-accord-blue">{progress}%</span>
                </div>
                <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #4F8EF7, #10B981)' }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* Blob ID */}
            {blobId && (
              <div className="p-3 bg-accord-emerald/5 border border-accord-emerald/20 rounded-xl">
                <p className="text-xs text-text-tertiary mb-1">Walrus Blob ID</p>
                <p className="text-xs font-mono text-accord-blue break-all">{blobId}</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-xs text-accord-red bg-accord-red/10 px-4 py-2.5 rounded-xl border border-accord-red/20">
                {error}
              </p>
            )}

            {/* Walrus note */}
            <div className="flex items-start gap-2 p-3 bg-accord-violet/5 border border-accord-violet/15 rounded-xl">
              <span className="text-sm">🦭</span>
              <p className="text-xs text-text-secondary leading-relaxed">
                Your file will be stored immutably on <span className="text-accord-violet font-semibold">Walrus</span> for 2 years. The blob ID will be recorded on-chain by Arca after verification.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              {!uploaded ? (
                <button
                  id="upload-to-walrus"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="btn-primary flex-1 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      />
                      Uploading…
                    </>
                  ) : (
                    '↑ Upload to Walrus'
                  )}
                </button>
              ) : (
                <button
                  id="submit-delivery"
                  onClick={handleSubmit}
                  className="btn-emerald flex-1 py-3"
                >
                  ✓ Submit for Arca Verification
                </button>
              )}
              <button onClick={onCancel} className="btn-ghost py-3 px-4">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getFileEmoji(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
  if (mimeType.startsWith('text/')) return '📝';
  return '📁';
}
