import React from 'react';

export default function FileUpload({ onFile }) {
  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onFile) onFile(file);
  };

  return (
    <div className="file-upload">
      <input type="file" onChange={handleChange} />
    </div>
  );
}
