import { strictEqual } from "node:assert";
import { describe, it, beforeEach } from "node:test";
import {
  DictationController,
  buildLiveTranscript,
  collectFinalTranscript,
  dictationErrorCode,
  getSpeechRecognitionCtor,
  isSpeechRecognitionAvailable,
  type SpeechRecognitionEventLike,
} from "../src/hooks/use-voice-input.ts";

type MockRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  startCalled: boolean;
  stopCalled: boolean;
  start(): void;
  stop(): void;
};

function makeMock(): MockRecognition {
  return {
    lang: "",
    continuous: false,
    interimResults: false,
    maxAlternatives: 1,
    onresult: null,
    onerror: null,
    onend: null,
    startCalled: false,
    stopCalled: false,
    start() { this.startCalled = true; },
    stop() { this.stopCalled = true; },
  };
}

function finalResult(transcript: string): SpeechRecognitionEventLike["results"][number] {
  return { isFinal: true, length: 1, 0: { transcript } };
}

function interimResult(transcript: string): SpeechRecognitionEventLike["results"][number] {
  return { isFinal: false, length: 1, 0: { transcript } };
}

function noopError() {
  return undefined;
}

describe("getSpeechRecognitionCtor", () => {
  const g = globalThis as unknown as Record<string, unknown>;

  beforeEach(() => {
    delete g.SpeechRecognition;
    delete g.webkitSpeechRecognition;
  });

  it("returns undefined when API is unavailable", () => {
    strictEqual(getSpeechRecognitionCtor(), undefined);
    strictEqual(isSpeechRecognitionAvailable(), false);
  });

  it("returns SpeechRecognition when available", () => {
    const mock = makeMock();
    g.SpeechRecognition = function () { return mock; };
    strictEqual(getSpeechRecognitionCtor() !== undefined, true);
    strictEqual(isSpeechRecognitionAvailable(), true);
  });

  it("falls back to webkitSpeechRecognition", () => {
    const mock = makeMock();
    g.webkitSpeechRecognition = function () { return mock; };
    strictEqual(getSpeechRecognitionCtor() !== undefined, true);
  });
});

describe("collectFinalTranscript", () => {
  it("collects only finalized phrases from resultIndex onward", () => {
    const event: SpeechRecognitionEventLike = {
      resultIndex: 1,
      results: [
        finalResult("ignore"),
        finalResult("hello "),
        interimResult("world"),
      ] as SpeechRecognitionEventLike["results"],
    };
    strictEqual(collectFinalTranscript(event), "hello ");
  });
});

describe("buildLiveTranscript", () => {
  it("combines finalized and interim phrases for live display", () => {
    const event: SpeechRecognitionEventLike = {
      resultIndex: 0,
      results: [
        finalResult("hello "),
        interimResult("world"),
      ] as SpeechRecognitionEventLike["results"],
    };
    strictEqual(buildLiveTranscript(event), "hello world");
  });
});

describe("dictationErrorCode", () => {
  it("maps known speech recognition errors", () => {
    strictEqual(dictationErrorCode("not-allowed"), "permission_denied");
    strictEqual(dictationErrorCode("service-not-allowed"), "service_unavailable");
    strictEqual(dictationErrorCode("no-speech"), "no_speech");
    strictEqual(dictationErrorCode("network"), "failed");
  });
});

describe("DictationController", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  let instances: MockRecognition[];

  beforeEach(() => {
    delete g.SpeechRecognition;
    delete g.webkitSpeechRecognition;
    instances = [];
    g.SpeechRecognition = function () {
      const mock = makeMock();
      instances.push(mock);
      return mock;
    };
  });

  it("starts continuous recognition and marks dictating on first toggle", () => {
    let dictating = false;
    const controller = new DictationController(() => () => {}, (active) => {
      dictating = active;
    }, noopError);

    controller.toggle();

    strictEqual(dictating, true);
    strictEqual(instances.length, 1);
    strictEqual(instances[0].startCalled, true);
    strictEqual(instances[0].continuous, true);
    strictEqual(instances[0].interimResults, true);
    strictEqual(controller.hasActiveRecognition, true);
  });

  it("reports unavailable when the API is missing", () => {
    delete g.SpeechRecognition;
    let reported: string | null = null;
    const controller = new DictationController(
      () => () => {},
      () => {},
      () => (code) => { reported = code; },
    );

    controller.toggle();

    strictEqual(reported, "unavailable");
    strictEqual(instances.length, 0);
  });

  it("stops active recognition instead of starting a second instance", () => {
    let dictating = false;
    const controller = new DictationController(() => () => {}, (active) => {
      dictating = active;
    }, noopError);

    controller.toggle();
    controller.toggle();
    instances[0].onend?.();

    strictEqual(instances.length, 1);
    strictEqual(instances[0].startCalled, true);
    strictEqual(instances[0].stopCalled, true);
    strictEqual(dictating, false);
    strictEqual(controller.hasActiveRecognition, false);
  });

  it("streams live transcript on each result event", () => {
    const received: string[] = [];
    const controller = new DictationController(
      () => (t: string) => { received.push(t); },
      () => {},
      noopError,
    );

    controller.toggle();
    instances[0].onresult?.({
      resultIndex: 0,
      results: [interimResult("hel")] as SpeechRecognitionEventLike["results"],
    });
    instances[0].onresult?.({
      resultIndex: 0,
      results: [
        finalResult("hello "),
        interimResult("wor"),
      ] as SpeechRecognitionEventLike["results"],
    });

    strictEqual(received.length, 2);
    strictEqual(received[0], "hel");
    strictEqual(received[1], "hello wor");
  });

  it("uses the latest onTranscript callback for live updates", () => {
    const received: string[] = [];
    let target = "conversation-a";
    const controller = new DictationController(
      () => (t: string) => { received.push(`${target}:${t}`); },
      () => {},
      noopError,
    );

    controller.toggle();
    target = "conversation-b";
    instances[0].onresult?.({
      resultIndex: 0,
      results: [finalResult("hello world")] as SpeechRecognitionEventLike["results"],
    });

    strictEqual(received[0], "conversation-b:hello world");
  });

  it("reports service errors except aborted", () => {
    let reported: string | null = null;
    const controller = new DictationController(
      () => () => {},
      () => {},
      () => (code) => { reported = code; },
    );

    controller.toggle();
    instances[0].onerror?.({ error: "service-not-allowed" });

    strictEqual(reported, "service_unavailable");
  });

  it("suppresses no-speech when the user intentionally stops dictation", () => {
    let reported: string | null = null;
    const controller = new DictationController(
      () => () => {},
      () => {},
      () => (code) => { reported = code; },
    );

    controller.toggle();
    controller.toggle();
    instances[0].onerror?.({ error: "no-speech" });

    strictEqual(reported, null);
  });

  it("clears dictating state on onerror", () => {
    let dictating = false;
    const controller = new DictationController(() => () => {}, (active) => {
      dictating = active;
    }, noopError);

    controller.toggle();
    instances[0].onerror?.({ error: "network" });

    strictEqual(dictating, false);
  });

  it("clears dictating state on onend", () => {
    let dictating = false;
    const controller = new DictationController(() => () => {}, (active) => {
      dictating = active;
    }, noopError);

    controller.toggle();
    instances[0].onend?.();

    strictEqual(dictating, false);
  });
});
