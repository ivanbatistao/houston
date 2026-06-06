import { BrainIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export function MemoryChip() {
  const { t } = useTranslation("chat");
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 mb-1.5">
      <BrainIcon className="size-3" />
      <span>{t("memory.usingMemory")}</span>
    </div>
  );
}
