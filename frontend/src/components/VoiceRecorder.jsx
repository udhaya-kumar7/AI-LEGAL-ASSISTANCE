import React, { useState } from 'react';

export default function VoiceRecorder() {
  const [recording, setRecording] = useState(false);

  const toggle = () => setRecording(r => !r);

  return (
    <div className="voice-recorder">
      <button onClick={toggle} className={`btn ${recording ? 'recording' : ''}`}>
        {recording ? 'Stop' : 'Record'}
      </button>
      <span className="hint">(Demo only, no audio saved)</span>
    </div>
  );
}
