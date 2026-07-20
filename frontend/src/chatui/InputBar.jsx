import React, { useRef, useEffect, useState } from 'react';
import { useVoiceInput } from '../utils/voiceInput';
import { motion } from 'framer-motion';

export default function InputBar({ onSend, loading, autoFocus = false, lang = 'en-IN', onLangChange }) {
  const [value, setValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const taRef = useRef(null);
  const { startListening, stopListening, isSupported } = useVoiceInput();

  // Auto-resize textarea
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = Math.min(200, taRef.current.scrollHeight) + 'px';
    }
  }, [value]);

  // Auto-focus
  useEffect(() => {
    if (autoFocus && taRef.current) taRef.current.focus();
  }, [autoFocus]);

  // Cleanup voice on unmount
  useEffect(() => () => stopListening(), [stopListening]);

  const submit = () => {
    const v = value.trim();
    if (!v || loading) return;
    onSend(v, lang || 'en-IN');
    setValue('');
    setInterimTranscript('');
  };

  const handleVoiceClick = () => {
    if (isRecording) {
      stopListening();
      setIsRecording(false);
    } else {
      setIsRecording(true);
      startListening(
        (transcript, isFinal) => {
          if (isFinal) {
            setValue(prev => (prev + ' ' + transcript).trim());
            setInterimTranscript('');
          } else {
            setInterimTranscript(transcript);
          }
        },
        (err) => { console.error('Voice error:', err); setIsRecording(false); },
        () => { setIsRecording(false); setInterimTranscript(''); },
        lang || 'en-IN'
      );
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const displayValue = value + (interimTranscript ? ' ' + interimTranscript : '');

  return (
    <div className="chat-input-area">
      <div className="chat-input-inner">
        {/* Text area */}
        <textarea
          ref={taRef}
          value={displayValue}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message LegalAI…"
          rows={1}
          disabled={loading}
        />

        {/* Action buttons */}
        <div className="chat-input-actions">
          {/* Voice input */}
          {isSupported && (
            <div className="voice-input-wrapper">
              <select
                className="voice-lang-select"
                value={lang || 'en-IN'}
                onChange={e => onLangChange?.(e.target.value)}
                disabled={isRecording || loading}
                title="Speech language"
              >
                <option value="en-IN">EN</option>
                <option value="hi-IN">HI</option>
                <option value="ta-IN">TA</option>
              </select>

              <button
                className={`voice-btn-modern ${isRecording ? 'recording' : ''}`}
                onClick={handleVoiceClick}
                disabled={loading}
                title={isRecording ? 'Stop recording' : 'Voice input'}
                style={{ position: 'relative' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                {isRecording && (
                  <div className="recording-indicator">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                )}
              </button>

              {isRecording && <span className="dictate-label">Listening…</span>}
            </div>
          )}

          {/* Send button */}
          <motion.button
            className="send-icon-btn"
            onClick={submit}
            disabled={loading || !value.trim()}
            aria-label="Send"
            whileHover={{ scale: 1.07 }}
            whileTap={{ scale: 0.93 }}
          >
            {loading ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="30" strokeDashoffset="10">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                </circle>
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" fill="currentColor" />
              </svg>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
