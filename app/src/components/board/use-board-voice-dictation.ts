import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  useVoiceInput,
  type DictationErrorCode,
} from "../../hooks/use-voice-input";
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
 * Voice dictation for the mission-board composer. Streams the live transcript
 * into the draft while the user speaks, preserving any text that was already
 * in the composer when dictation started.
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
      onDraftChange(key, mergeDraftWithDictation(baseDraftRef.current, liveDictation));
    },
    [onDraftChange],
  );

  const { isDictating, toggle } = useVoiceInput(handleLiveTranscript, handleError);

  const onDictate = useCallback(() => {
    if (!isDictating) {
      const key = draftKeyRef.current;
      baseDraftRef.current = useDraftStore.getState().drafts[key]?.text ?? "";
    }
    toggle();
  }, [isDictating, toggle]);

  return { isDictating, onDictate };
}
