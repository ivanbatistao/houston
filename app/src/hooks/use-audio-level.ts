import { useState, useEffect, useRef } from "react";

const BAR_COUNT = 5;
const EMPTY = Array<number>(BAR_COUNT).fill(0);

/**
 * Returns normalized (0–1) frequency levels for BAR_COUNT bars.
 * When isDictating is true, tries to attach a Web Audio analyser to the mic
 * stream. Falls back to an animated sine-wave pattern if getUserMedia fails.
 * Resets to all-zero when isDictating becomes false.
 */
export function useAudioLevel(isDictating: boolean): number[] {
  const [levels, setLevels] = useState<number[]>(EMPTY);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!isDictating) {
      setLevels(EMPTY);
      return;
    }

    let stopped = false;
    let stopAnalyser: (() => void) | null = null;

    const startFakeAnimation = () => {
      const tick = () => {
        if (stopped) return;
        const t = Date.now() / 250;
        setLevels(
          Array.from({ length: BAR_COUNT }, (_, i) =>
            0.15 + 0.7 * Math.abs(Math.sin(t + i * 0.8 + i * i * 0.12)),
          ),
        );
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        if (stopped) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const step = Math.max(1, Math.floor(data.length / BAR_COUNT));

        stopAnalyser = () => {
          source.disconnect();
          void ctx.close();
          for (const t of stream.getTracks()) t.stop();
        };

        const tick = () => {
          if (stopped) return;
          analyser.getByteFrequencyData(data);
          setLevels(
            Array.from({ length: BAR_COUNT }, (_, i) => {
              const slice = data.slice(i * step, (i + 1) * step);
              const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
              return avg / 255;
            }),
          );
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!stopped) startFakeAnimation();
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      stopAnalyser?.();
    };
  }, [isDictating]);

  return levels;
}
