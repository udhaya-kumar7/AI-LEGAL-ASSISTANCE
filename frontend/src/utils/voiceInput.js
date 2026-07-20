/**
 * Voice Input Service - Speech to Text using Web Speech API
 */

import { useRef, useCallback } from 'react';

const getSpeechRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition;
};

export const useVoiceInput = () => {
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const silenceTimerRef = useRef(null);
  const callbacksRef = useRef({});

  const SpeechRecognition = getSpeechRecognition();

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (isListeningRef.current && recognitionRef.current) {
        console.log('[Voice] Restarting due to silence...');
        try {
          recognitionRef.current.stop();
          setTimeout(() => {
            if (isListeningRef.current && recognitionRef.current) {
              recognitionRef.current.start();
            }
          }, 100);
        } catch (err) {
          console.error('[Voice] Restart error:', err);
        }
      }
    }, 5000);
  }, []);

  const startListening = useCallback((onResult, onError, onEnd, lang = 'en-IN') => {
    if (!SpeechRecognition) {
      onError?.('Speech Recognition not supported in this browser');
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.log('[Voice] Stop error (ignored):', err);
      }
    }

    callbacksRef.current = { onResult, onError, onEnd };

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = lang || 'en-IN';
    recognitionRef.current.maxAlternatives = 1;
    isListeningRef.current = true;

    recognitionRef.current.onstart = () => {
      console.log('[Voice] Listening...');
      resetSilenceTimer();
    };

    recognitionRef.current.onresult = (event) => {
      resetSilenceTimer();
      let transcript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          callbacksRef.current.onResult?.(transcript, true);
        } else {
          callbacksRef.current.onResult?.(transcript, false);
        }
      }
    };

    recognitionRef.current.onerror = (event) => {
      console.error('[Voice] Error:', event.error);
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        callbacksRef.current.onError?.(event.error);
        isListeningRef.current = false;
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognitionRef.current.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (isListeningRef.current) {
        console.log('[Voice] Auto-restarting...');
        setTimeout(() => {
          if (isListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (err) {
              console.error('[Voice] Restart failed:', err);
              isListeningRef.current = false;
              callbacksRef.current.onEnd?.();
            }
          }
        }, 100);
      } else {
        callbacksRef.current.onEnd?.();
      }
    };

    try {
      recognitionRef.current.start();
    } catch (err) {
      console.error('[Voice] Start error:', err);
      callbacksRef.current.onError?.(err.message);
    }
  }, [SpeechRecognition, resetSilenceTimer]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.log('[Voice] Stop error (ignored):', err);
      }
    }
  }, []);

  return {
    startListening,
    stopListening,
    isSupported: !!SpeechRecognition,
    isListening: () => isListeningRef.current
  };
};
