import { strictEqual, deepEqual } from "node:assert";
import { describe, it } from "node:test";
import { detectKind, parseCSV } from "../src/lib/artifact-kind.ts";

describe("detectKind", () => {
  it("maps csv extension", () => strictEqual(detectKind("/path/to/report.csv"), "csv"));
  it("maps md extension", () => strictEqual(detectKind("/path/to/README.md"), "markdown"));
  it("maps markdown extension", () => strictEqual(detectKind("/path/to/doc.markdown"), "markdown"));
  it("maps png extension", () => strictEqual(detectKind("/path/to/photo.png"), "image"));
  it("maps jpg extension", () => strictEqual(detectKind("/path/to/photo.jpg"), "image"));
  it("maps jpeg extension", () => strictEqual(detectKind("/path/to/photo.jpeg"), "image"));
  it("maps gif extension", () => strictEqual(detectKind("/path/to/anim.gif"), "image"));
  it("maps svg extension", () => strictEqual(detectKind("/path/to/icon.svg"), "image"));
  it("maps webp extension", () => strictEqual(detectKind("/path/to/photo.webp"), "image"));
  it("maps ts extension", () => strictEqual(detectKind("/path/to/file.ts"), "code"));
  it("maps tsx extension", () => strictEqual(detectKind("/path/to/file.tsx"), "code"));
  it("maps js extension", () => strictEqual(detectKind("/path/to/file.js"), "code"));
  it("maps py extension", () => strictEqual(detectKind("/path/to/script.py"), "code"));
  it("maps json extension", () => strictEqual(detectKind("/path/to/config.json"), "code"));
  it("maps yaml extension", () => strictEqual(detectKind("/path/to/config.yaml"), "code"));
  it("maps html extension", () => strictEqual(detectKind("/path/to/page.html"), "code"));
  it("maps sql extension", () => strictEqual(detectKind("/path/to/query.sql"), "code"));
  it("maps txt extension", () => strictEqual(detectKind("/path/to/notes.txt"), "text"));
  it("maps log extension", () => strictEqual(detectKind("/path/to/app.log"), "text"));
  it("returns unknown for pdf", () => strictEqual(detectKind("/path/to/file.pdf"), "unknown"));
  it("returns unknown for docx", () => strictEqual(detectKind("/path/to/file.docx"), "unknown"));
  it("returns unknown for no extension", () => strictEqual(detectKind("/path/to/Makefile"), "unknown"));
  it("is case-insensitive for extensions", () => {
    strictEqual(detectKind("/path/to/PHOTO.PNG"), "image");
    strictEqual(detectKind("/path/to/Report.CSV"), "csv");
    strictEqual(detectKind("/path/to/README.MD"), "markdown");
  });
});

describe("parseCSV", () => {
  it("parses header and data rows", () => {
    const result = parseCSV("name,age,city\nAlice,30,NY\nBob,25,LA");
    deepEqual(result, [
      ["name", "age", "city"],
      ["Alice", "30", "NY"],
      ["Bob", "25", "LA"],
    ]);
  });

  it("strips surrounding quotes from cells", () => {
    const result = parseCSV('"name","age"\n"Alice","30"');
    deepEqual(result, [
      ["name", "age"],
      ["Alice", "30"],
    ]);
  });

  it("trims whitespace from cells", () => {
    const result = parseCSV("name , age\n Alice , 30 ");
    deepEqual(result, [
      ["name", "age"],
      ["Alice", "30"],
    ]);
  });

  it("returns empty array for empty content", () => {
    deepEqual(parseCSV(""), []);
    deepEqual(parseCSV("   "), []);
  });

  it("handles single row (header only)", () => {
    const result = parseCSV("col1,col2,col3");
    deepEqual(result, [["col1", "col2", "col3"]]);
  });

  it("handles many rows — truncation is a render concern, parser returns all", () => {
    const rows = ["h1,h2"];
    for (let i = 0; i < 20; i++) rows.push(`v${i}a,v${i}b`);
    const result = parseCSV(rows.join("\n"));
    strictEqual(result.length, 21); // 1 header + 20 data rows
    strictEqual(result[0][0], "h1");
    strictEqual(result[20][1], "v19b");
  });
});
