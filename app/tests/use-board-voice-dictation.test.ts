import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { mergeDraftWithDictation } from "../src/components/board/dictation-draft-merge.ts";

describe("mergeDraftWithDictation", () => {
  it("returns only the live dictation when the composer was empty", () => {
    strictEqual(mergeDraftWithDictation("", "hello world"), "hello world");
  });

  it("preserves existing composer text and appends live dictation", () => {
    strictEqual(mergeDraftWithDictation("draft line", "hello"), "draft line hello");
  });

  it("keeps the base draft when live dictation is empty", () => {
    strictEqual(mergeDraftWithDictation("draft line", ""), "draft line");
  });
});
