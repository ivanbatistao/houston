import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageResponse } from "@houston-ai/chat";
import { parseCSV } from "../lib/artifact-kind";

export { parseCSV } from "../lib/artifact-kind";

const MAX_CSV_ROWS = 8;
const MAX_CODE_LINES = 20;

export function CsvRenderer({ content }: { content: string }) {
  const { t } = useTranslation("chat");
  const rows = parseCSV(content);
  if (rows.length === 0) return null;
  const [headerRow, ...dataRows] = rows;
  const displayRows = dataRows.slice(0, MAX_CSV_ROWS);
  const remaining = dataRows.length - displayRows.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {headerRow.map((h, i) => (
              <th
                key={i}
                className="px-2 py-1 text-left font-medium text-foreground bg-secondary border-b border-border/50"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {remaining > 0 && (
        <p className="px-2 pt-1 text-xs text-muted-foreground italic">
          {t("artifact.csvMoreRows", { count: remaining })}
        </p>
      )}
    </div>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose-sm">
      <MessageResponse>{content}</MessageResponse>
    </div>
  );
}

export function ImageRenderer({
  content,
  filePath,
}: {
  content: string;
  filePath: string;
}) {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "png";
  const src = content.startsWith("data:")
    ? content
    : `data:image/${ext};base64,${content}`;

  return (
    <img
      src={src}
      alt=""
      className="max-h-60 w-auto object-contain rounded-lg"
    />
  );
}

export function CodeRenderer({ content }: { content: string }) {
  const { t } = useTranslation("chat");
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const truncated = !expanded && lines.length > MAX_CODE_LINES;
  const displayContent = truncated
    ? lines.slice(0, MAX_CODE_LINES).join("\n")
    : content;

  return (
    <div>
      <pre className="overflow-x-auto rounded bg-zinc-900 p-2 text-xs text-zinc-100 font-mono">
        {displayContent}
      </pre>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("artifact.showMore")}
        </button>
      )}
    </div>
  );
}
