import { useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";

import {
  useVoiceInput,
  type DictationErrorCode,
} from "../../hooks/use-voice-input";
import { useAudioLevel } from "../../hooks/use-audio-level";
import { useDraftStore } from "../../stores/drafts";
import { useUIStore } from "../../stores/ui";
import { mergeDraftWithDictation } from "./dictation-draft-merge";

const DICTATE_ERROR_KEYS: Record<DictationErrorCode, string> = {
  unavailable: "chat:composer.dictateUnavailable",
  permission_denied: "chat:composer.dictatePermissionDenied",
  service_unavailable: "chat:composer.dictateServiceUnavailable",
  no_speech: "chat:composer.dictateNoSpeech",
  failed: "chat:composer.dictateFailed",
};

/**
 * Voice dictation for the mission-board composer.
 *
 * - Streams the live transcript into the draft while the user speaks,
 *   preserving any text that was already in the composer.
 * - Stops recording automatically when the user navigates to a different
 *   chat (draftKey changes), but keeps the transcribed text in the draft.
 * - Manual edits while dictating update the "base" text so new speech
 *   appends to what the user typed rather than overwriting it.
 * - Returns audioLevels (normalized 0–1) for the audiogram visualizer.
 * - Returns a wrapped onDraftChange that must replace the raw store setter
 *   in AIBoard so manual edits are intercepted correctly.
 */
export function useBoardVoiceDictation(
  draftKey: string | null,
  onDraftChange: (sessionKey: string, text: string) => void,
) {
  const { t } = useTranslation("chat");
  const addToast = useUIStore((s) => s.addToast);
  const draftKeyRef = useRef(draftKey ?? "new-conversation");
  draftKeyRef.current = draftKey ?? "new-conversation";
  const baseDraftRef = useRef("");

  // Prevent the manual-edit wrapper from mis-firing on dictation-driven updates
  const isFromDictationRef = useRef(false);
  // Mirror of isDictating state for use inside callbacks without stale closures
  const isDictatingRef = useRef(false);

  const handleError = useCallback(
    (code: DictationErrorCode) => {
      addToast({
        title: t(DICTATE_ERROR_KEYS[code] as "composer.dictateFailed"),
        variant: "error",
      });
    },
    [addToast, t],
  );

  const handleLiveTranscript = useCallback(
    (liveDictation: string) => {
      const key = draftKeyRef.current;
      isFromDictationRef.current = true;
      onDraftChange(key, mergeDraftWithDictation(baseDraftRef.current, liveDictation));
      isFromDictationRef.current = false;
    },
    [onDraftChange],
  );

  const { isDictating, toggle } = useVoiceInput(handleLiveTranscript, handleError);
  isDictatingRef.current = isDictating;

  const audioLevels = useAudioLevel(isDictating);

  // Keep a stable ref to toggle so the cleanup effect below doesn't need it
  // as a dep (which would restart the effect on every render).
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  // Stop recording when the user navigates to a different chat. The draft text
  // stays in the store; only the active recording is ended.
  useEffect(() => {
    return () => {
      if (isDictatingRef.current) toggleRef.current();
    };
    // Re-run whenever the active chat changes so the cleanup fires on switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const onDictate = useCallback(() => {
    if (!isDictatingRef.current) {
      const key = draftKeyRef.current;
      baseDraftRef.current = useDraftStore.getState().drafts[key]?.text ?? "";
    }
    toggle();
  }, [toggle]);

  // Wrapped onDraftChange: intercepts manual keyboard edits while dictating
  // and updates baseDraftRef so new speech appends to the edited text.
  const wrappedOnDraftChange = useCallback(
    (key: string, text: string) => {
      if (isDictatingRef.current && !isFromDictationRef.current) {
        baseDraftRef.current = text;
      }
      onDraftChange(key, text);
    },
    [onDraftChange],
  );

  return { isDictating, onDictate, audioLevels, onDraftChange: wrappedOnDraftChange };
}
