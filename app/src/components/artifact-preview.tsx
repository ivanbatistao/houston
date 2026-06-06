import { useEffect, useState } from "react";
import { ExternalLinkIcon, PencilIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tauriAgent, tauriFiles } from "../lib/tauri";
import { useUIStore } from "../stores/ui";
import { detectKind } from "../lib/artifact-kind";
import {
  CsvRenderer,
  MarkdownRenderer,
  ImageRenderer,
  CodeRenderer,
} from "./artifact-renderers";

export { detectKind } from "../lib/artifact-kind";

export function ArtifactPreview({
  filePath,
  agentPath,
}: {
  filePath: string;
  agentPath: string;
}) {
  const { t } = useTranslation("chat");
  const addToast = useUIStore((s) => s.addToast);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const kind = detectKind(filePath);
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  const rel = filePath.startsWith(agentPath)
    ? filePath.slice(agentPath.length + 1)
    : filePath;

  useEffect(() => {
    if (kind === "unknown") return;
    tauriAgent
      .readFile(agentPath, rel)
      .then(setContent)
      .catch(() => setError(true));
  }, [filePath, agentPath, kind, rel]);

  if (kind === "unknown" || error || content === null) return null;

  const handleEdit = () => {
    setEditContent(content);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent("");
  };

  const handleSave = () => {
    setIsSaving(true);
    tauriAgent
      .writeFile(agentPath, rel, editContent)
      .then(() => {
        setContent(editContent);
        setIsEditing(false);
      })
      .catch((err: unknown) => {
        addToast({
          variant: "error",
          title: t("artifact.saveFailed"),
          description: String(err),
        });
      })
      .finally(() => setIsSaving(false));
  };

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-background mt-2">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-secondary">
        <span className="text-xs font-medium text-foreground truncate">{fileName}</span>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="text-xs text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
              >
                {isSaving ? t("artifact.saving") : t("artifact.save")}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                aria-label={t("artifact.cancel")}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <XIcon className="size-3.5" />
              </button>
            </>
          ) : (
            <>
              {kind !== "image" && (
                <button
                  type="button"
                  onClick={handleEdit}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <PencilIcon className="size-3" />
                  {t("artifact.edit")}
                </button>
              )}
              <button
                type="button"
                onClick={() => tauriFiles.open(agentPath, filePath).catch(console.error)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLinkIcon className="size-3" />
                {t("artifact.open")}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="p-3">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full min-h-40 resize-y rounded bg-zinc-900 p-2 text-xs text-zinc-100 font-mono focus:outline-none"
            autoFocus
          />
        ) : (
          <>
            {kind === "csv" && <CsvRenderer content={content} />}
            {kind === "markdown" && <MarkdownRenderer content={content} />}
            {kind === "image" && <ImageRenderer content={content} filePath={filePath} />}
            {(kind === "code" || kind === "text") && <CodeRenderer content={content} />}
          </>
        )}
      </div>
    </div>
  );
}
