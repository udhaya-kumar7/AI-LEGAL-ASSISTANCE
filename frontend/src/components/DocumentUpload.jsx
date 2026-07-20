import React, { useRef, useState } from 'react';
import { analyzeDocument } from '../utils/api';

export default function DocumentUpload({ onAnalysisComplete }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Please upload only JPG, PNG, or PDF files');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const result = await analyzeDocument(file);
      if (result.success) {
        onAnalysisComplete(result.analysis);
      } else {
        setError(result.error || 'Analysis failed');
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze document');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="document-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      <button
        className="upload-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <>
            <span className="spinner">⏳</span> Analyzing...
          </>
        ) : (
          <>
            <span>📎</span> Upload Document
          </>
        )}
      </button>
      {error && <div className="upload-error">{error}</div>}
      <div className="upload-hint">Accepts: JPG, PNG, PDF (max 10MB)</div>
    </div>
  );
}
