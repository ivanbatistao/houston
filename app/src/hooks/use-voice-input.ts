import { useState, useCallback, useRef, useEffect } from "react";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultLike[] & { length: number };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export type DictationErrorCode =
  | "unavailable"
  | "permission_denied"
  | "service_unavailable"
  | "no_speech"
  | "failed";

export function dictationErrorCode(error: string | undefined): DictationErrorCode {
  switch (error) {
    case "not-allowed":
      return "permission_denied";
    case "service-not-allowed":
      return "service_unavailable";
    case "no-speech":
      return "no_speech";
    default:
      return "failed";
  }
}

/** Collect finalized phrases from a speech-recognition result event. */
export function collectFinalTranscript(event: SpeechRecognitionEventLike): string {
  let text = "";
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    if (result?.isFinal) {
      text += result[0]?.transcript ?? "";
    }
  }
  return text;
}

/** Full live dictation text: finalized phrases plus the current interim phrase. */
export function buildLiveTranscript(event: SpeechRecognitionEventLike): string {
  let finalized = "";
  let interim = "";
  for (let i = 0; i < event.results.length; i++) {
    const result = event.results[i];
    const chunk = result?.[0]?.transcript ?? "";
    if (result?.isFinal) {
      finalized += chunk;
    } else {
      interim += chunk;
    }
  }
  return finalized + interim;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const g = globalThis as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
}

export function isSpeechRecognitionAvailable(): boolean {
  return getSpeechRecognitionCtor() !== undefined;
}

/** Manages a single speech recognition instance. Exported for unit tests. */
export class DictationController {
  private recognition: SpeechRecognitionLike | null = null;
  private stopRequested = false;
  private readonly getOnTranscript: () => (text: string) => void;
  private readonly setDictating: (active: boolean) => void;
  private readonly getOnError: () => ((code: DictationErrorCode) => void) | undefined;

  constructor(
    getOnTranscript: () => (text: string) => void,
    setDictating: (active: boolean) => void,
    getOnError: () => ((code: DictationErrorCode) => void) | undefined,
  ) {
    this.getOnTranscript = getOnTranscript;
    this.setDictating = setDictating;
    this.getOnError = getOnError;
  }

  get hasActiveRecognition(): boolean {
    return this.recognition !== null;
  }

  toggle(): void {
    if (this.recognition) {
      this.stopRequested = true;
      this.setDictating(false);
      this.recognition.stop();
      return;
    }

    const SR = getSpeechRecognitionCtor();
    if (!SR) {
      this.getOnError()?.("unavailable");
      return;
    }

    const recognition = new SR();
    this.recognition = recognition;
    this.stopRequested = false;

    recognition.lang = navigator.language ?? "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: SpeechRecognitionEventLike) => {
      this.getOnTranscript()(buildLiveTranscript(e));
    };
    recognition.onerror = (e: SpeechRecognitionErrorEventLike) => {
      if (e.error !== "aborted") {
        const intentionalStop = this.stopRequested && e.error === "no-speech";
        if (!intentionalStop) {
          this.getOnError()?.(dictationErrorCode(e.error));
        }
      }
      this.resetSession();
    };
    recognition.onend = () => {
      this.resetSession();
    };

    this.setDictating(true);
    try {
      recognition.start();
    } catch {
      this.resetSession();
      this.getOnError()?.("failed");
    }
  }

  private resetSession(): void {
    this.recognition = null;
    this.stopRequested = false;
    this.setDictating(false);
  }

  stop(): void {
    if (!this.recognition) return;
    this.stopRequested = true;
    this.setDictating(false);
    this.recognition.stop();
  }

  dispose(): void {
    this.stop();
  }
}

export function useVoiceInput(
  onTranscript: (text: string) => void,
  onError?: (code: DictationErrorCode) => void,
) {
  const [isDictating, setIsDictating] = useState(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const controllerRef = useRef<DictationController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new DictationController(
      () => onTranscriptRef.current,
      setIsDictating,
      () => onErrorRef.current,
    );
  }

  useEffect(() => () => controllerRef.current?.dispose(), []);

  const toggle = useCallback(() => {
    controllerRef.current?.toggle();
  }, []);

  return { isDictating, toggle, isAvailable: isSpeechRecognitionAvailable() };
}

export { getSpeechRecognitionCtor };
