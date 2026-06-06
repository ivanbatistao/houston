export type PreviewKind = "csv" | "markdown" | "image" | "code" | "text" | "unknown";

export function detectKind(filePath: string): PreviewKind {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) return "unknown";
  if (ext === "csv") return "csv";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
  if (
    [
      "ts", "tsx", "js", "jsx", "py", "rs", "sh", "json", "yaml", "yml",
      "html", "css", "sql", "toml",
    ].includes(ext)
  )
    return "code";
  if (["txt", "log", "rtf"].includes(ext)) return "text";
  return "unknown";
}

/** Parse CSV text into a 2-D array of cell strings. Strips surrounding quotes. */
export function parseCSV(content: string): string[][] {
  const rows = content.trim().split("\n").filter(Boolean);
  return rows.map((row) =>
    row.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")),
  );
}
