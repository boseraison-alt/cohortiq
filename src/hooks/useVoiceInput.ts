"use client";

import { useEffect, useRef } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void;
}

export function useVoiceInput({ onTranscript }: UseVoiceInputOptions) {
  const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition } =
    useSpeechRecognition();

  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // When transcript changes and we're not listening (speech ended), fire callback
  const prevTranscriptRef = useRef("");
  useEffect(() => {
    if (!listening && transcript && transcript !== prevTranscriptRef.current) {
      onTranscriptRef.current(transcript);
      prevTranscriptRef.current = transcript;
      resetTranscript();
    }
  }, [listening, transcript, resetTranscript]);

  const toggle = () => {
    if (listening) {
      SpeechRecognition.stopListening();
    } else {
      prevTranscriptRef.current = "";
      resetTranscript();
      SpeechRecognition.startListening({ continuous: false, language: "en-US" });
    }
  };

  return {
    listening,
    supported: browserSupportsSpeechRecognition,
    toggle,
    interimTranscript: transcript,
  };
}
