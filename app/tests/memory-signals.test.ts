import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { usesMemory, extractLearningCandidate } from "../src/lib/memory-signals.ts";

describe("usesMemory", () => {
  it("returns false for plain text with no memory signal", () => {
    strictEqual(usesMemory("Here is a summary of your project."), false);
  });

  it("detects 'I remember'", () => {
    strictEqual(usesMemory("I remember that you prefer dark mode."), true);
  });

  it("detects 'as you mentioned'", () => {
    strictEqual(usesMemory("As you mentioned earlier, let's use TypeScript."), true);
  });

  it("detects 'based on your preference'", () => {
    strictEqual(usesMemory("Based on your preference, I'll keep reports in English."), true);
  });

  it("detects 'you've told me'", () => {
    strictEqual(usesMemory("You've told me you prefer concise answers."), true);
  });

  it("detects 'I recall'", () => {
    strictEqual(usesMemory("I recall you wanted summaries at the end."), true);
  });

  it("detects 'I know you prefer'", () => {
    strictEqual(usesMemory("I know you prefer reports in English."), true);
  });

  it("detects Spanish pattern 'recuerdo que'", () => {
    strictEqual(usesMemory("Recuerdo que prefieres los reportes en inglés."), true);
  });

  it("detects Spanish pattern 'como mencionaste'", () => {
    strictEqual(usesMemory("Como mencionaste antes, seguiré ese enfoque."), true);
  });

  it("detects Spanish pattern 'según tus preferencias'", () => {
    strictEqual(usesMemory("Según tus preferencias, usaré el formato anterior."), true);
  });

  it("is case-insensitive", () => {
    strictEqual(usesMemory("AS YOU MENTIONED, we should proceed."), true);
  });
});

describe("extractLearningCandidate", () => {
  it("returns null for unmatched text", () => {
    strictEqual(extractLearningCandidate("This is a normal reply."), null);
  });

  it("extracts from 'I'll remember that ...'", () => {
    const result = extractLearningCandidate("I'll remember that you prefer reports in English.");
    strictEqual(result, "you prefer reports in English");
  });

  it("extracts from 'I will remember ...'", () => {
    const result = extractLearningCandidate("I will remember that you like dark mode.");
    strictEqual(result, "you like dark mode");
  });

  it("extracts from 'noted: ...'", () => {
    const result = extractLearningCandidate("noted: you prefer TypeScript over JavaScript.");
    strictEqual(result, "you prefer TypeScript over JavaScript");
  });

  it("extracts from 'I'll keep in mind ...'", () => {
    const result = extractLearningCandidate("I'll keep in mind: always include a summary at the end.");
    strictEqual(result, "always include a summary at the end");
  });

  it("extracts from 'I'll keep that in mind ...'", () => {
    const result = extractLearningCandidate("I'll keep that in mind: you want short responses.");
    strictEqual(result, "you want short responses");
  });

  it("extracts from Spanish 'voy a recordar ...'", () => {
    const result = extractLearningCandidate("Voy a recordar que prefieres respuestas cortas.");
    strictEqual(result, "prefieres respuestas cortas");
  });

  it("extracts from Spanish 'anotado: ...'", () => {
    const result = extractLearningCandidate("Anotado: prefieres el formato de tabla.");
    strictEqual(result, "prefieres el formato de tabla");
  });

  it("trims whitespace from extracted value", () => {
    const result = extractLearningCandidate("I'll remember that  you prefer dark mode.");
    strictEqual(result?.startsWith(" "), false);
  });
});
