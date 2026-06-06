import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BrainIcon, XIcon } from "lucide-react";
import { Button } from "@houston-ai/core";

interface SaveMemoryCardProps {
  candidate: string;
  onSave: () => Promise<unknown>;
  onDismiss: () => void;
}

export function SaveMemoryCard({ candidate, onSave, onDismiss }: SaveMemoryCardProps) {
  const { t } = useTranslation("chat");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave();
    setSaving(false);
    setSaved(true);
  };

  if (saved) return null;

  return (
    <div className="mt-3 flex items-start gap-3 rounded-xl border border-border/50 bg-secondary px-4 py-3">
      <BrainIcon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">{t("memory.savePrompt")}</p>
        <p className="text-sm text-foreground truncate">&ldquo;{candidate}&rdquo;</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? t("memory.saving") : t("memory.save")}
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t("memory.dismiss")}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
