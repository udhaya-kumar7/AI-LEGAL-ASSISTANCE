import React, { useState } from 'react';
import FileUpload from '../components/FileUpload';

export default function DocumentAnalyzer() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  const handleFile = (f) => {
    setFile(f);
    // Demo analysis: read first 200 chars if text file
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result).slice(0, 1000);
      setAnalysis(`Demo analysis for file "${f.name}":\n\nDetected ${text.length} characters. (Replace with real NLP pipeline.)`);
    };
    reader.onerror = () => setAnalysis('Unable to read file');
    reader.readAsText(f.slice(0, 1024 * 50));
  };

  return (
    <div className="page document-analyzer">
      <h2>Document Analyzer</h2>
      <FileUpload onFile={handleFile} />
      {file && <div className="file-meta">Selected: {file.name} ({Math.round(file.size/1024)} KB)</div>}
      {analysis && <pre className="analysis">{analysis}</pre>}
    </div>
  );
}
