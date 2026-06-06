# Hackathon Build Guide

Three frontend features targeting Track 2 (Agentic Features for Non-Technical Users).
Build them in order — each one is independent.

---

## Architecture you need to know

```
ui/chat/src/          ← @houston-ai/chat library. Props-only. No stores, no Tauri, no app/ types.
app/src/components/   ← App-specific consumers. Can use Zustand, Tauri, i18n.
app/src/hooks/        ← TanStack Query hooks. Data fetching lives here.
app/src/lib/tauri.ts  ← All engine calls (tauriAgent, tauriFiles, etc.)
```

**Library boundary rule:** If a component lives under `ui/`, it receives everything via props.
The app passes data and callbacks in. Never import from `app/` inside `ui/`.

**Reading a file written by the agent:**
```ts
import { tauriAgent } from "../lib/tauri";
// filePath is absolute. Derive relative path:
const rel = filePath.startsWith(agentPath)
  ? filePath.slice(agentPath.length + 1)
  : filePath;
const content = await tauriAgent.readFile(agentPath, rel);
```

**Adding a learning:**
```ts
import { useAddLearning } from "../hooks/queries";
const add = useAddLearning(agentPath);
await add.mutateAsync("user prefers reports in English");
```

**Design system tokens to use:**
- Background: `bg-background`, `bg-secondary`, `bg-accent`
- Text: `text-foreground`, `text-muted-foreground`
- Border: `border-border/50` (15% opacity)
- Status colors: `text-green-600`, `text-red-500`, `text-blue-600`
- Never hardcode hex. Never use decorative color. Color only for status, avatars, and the running glow.

**i18n:** Every user-visible string goes through `t()`. Add keys to
`app/src/locales/en/chat.json` (and mirror in `es/` and `pt/`).
Check `knowledge-base/i18n.md` for the full pattern.

**Error handling:** Never swallow errors silently. Every `.catch` must either
rethrow or show a toast. See the "No silent failures" rule in `CLAUDE.md`.

**File size:** Keep every new file under 200 lines. Extract sub-components when
a file grows.

---

## Feature 1 — Voice Input

### Problem

Non-technical users are the core audience of Houston. Typing long instructions
to an agent is a barrier — especially for users accustomed to speaking to
assistants like Siri or Google Assistant. The microphone button is already
visible in the chat composer but does nothing when clicked. Every user who
tries it discovers a dead affordance. This erodes trust in the product.

### What it solves

Clicking the microphone button starts speech recognition. The user speaks.
The transcript appears in the chat input, ready to edit before sending.
The button animates while listening. No setup, no API keys, no permissions
dialog beyond the OS mic prompt.

### What already exists

- `MicIcon` button in `ui/chat/src/attachment-chip.tsx` inside `ComposerTrailing` (lines 119–138).
  It renders but has no `onClick` and no wired state.
- `ChatInput` in `ui/chat/src/chat-input.tsx` passes `ComposerTrailing` its status props.

### What to build

#### Step 1 — Extend `ComposerTrailingProps` (`ui/chat/src/attachment-chip.tsx`)

Add two optional props:

```ts
export interface ComposerTrailingProps {
  status: "ready" | "streaming" | "submitted";
  hasContent: boolean;
  onStop?: () => void;
  onDictate?: () => void;   // ← add
  isDictating?: boolean;    // ← add
}
```

Wire them onto the button:

```tsx
{status === "ready" && (
  <button
    type="button"
    onClick={onDictate}
    aria-label="Dictate"
    className={cn(
      "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
      isDictating
        ? "bg-red-100 text-red-500 animate-pulse"
        : "text-muted-foreground hover:bg-accent",
    )}
  >
    <MicIcon className="size-5" />
  </button>
)}
```

#### Step 2 — Thread props through `ChatInput` (`ui/chat/src/chat-input.tsx`)

Add `onDictate?: () => void` and `isDictating?: boolean` to `ChatInputProps`.
Pass them down to `<ComposerTrailing>`.

#### Step 3 — Hook in app (`app/src/hooks/use-voice-input.ts`) — NEW FILE

```ts
import { useState, useCallback } from "react";

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [isDictating, setIsDictating] = useState(false);

  const toggle = useCallback(() => {
    const SR =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;

    if (!SR) return; // WebKit (Tauri/WKWebView) supports this natively

    const recognition = new SR();
    recognition.lang = navigator.language ?? "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
      setIsDictating(false);
    };
    recognition.onerror = () => setIsDictating(false);
    recognition.onend = () => setIsDictating(false);

    setIsDictating(true);
    recognition.start();
  }, [onTranscript]);

  return { isDictating, toggle };
}
```

#### Step 4 — Connect in the chat panel consumer (`app/src/`)

Find where `<ChatInput>` is rendered (search for `<ChatInput` in `app/src/`).
Add:

```tsx
const [inputText, setInputText] = useState("");

const { isDictating, toggle } = useVoiceInput((transcript) => {
  setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
});

<ChatInput
  value={inputText}
  onValueChange={setInputText}
  onDictate={toggle}
  isDictating={isDictating}
  // ... rest of props
/>
```

### Acceptance criteria

- Clicking mic starts listening; button pulses red
- Speaking populates the textarea
- Button returns to normal after recognition ends (or errors)
- If `SpeechRecognition` is unavailable, button does nothing (no crash, no toast)
- Pressing mic while already listening does not crash

### Tests

Unit-test `useVoiceInput`: mock `window.SpeechRecognition`, assert `isDictating`
flips to `true` on `toggle()`, and the `onTranscript` callback fires with the
mocked result. File: `app/src/hooks/use-voice-input.test.ts`.

---

## Feature 2 — Inline Artifact Preview

### Problem

When an agent completes a task it often produces files: CSVs, reports, images,
HTML pages, Markdown documents. Today Houston shows a small clickable chip
(`FileCard`) that opens the file in the operating system's default application.
For a non-technical user this is confusing and friction-heavy: they need to
know what app handles a `.csv`, wait for it to open, context-switch out of
Houston. They cannot see the result without leaving the product.

Worse, the most common case — a simple text report — shows zero content
in the chat. The user has no idea if the agent did the right thing until they
open an external app.

### What it solves

File outputs appear as rich, inline preview cards directly in the chat
conversation. A CSV becomes a readable table. A Markdown file renders as
formatted text. An image appears as a thumbnail. The user sees the result
immediately, in context, without leaving Houston. The card still has an
"Open" button for power users who want the full file.

### What already exists

- `FileCard` in `app/src/components/file-card.tsx` — a simple clickable
  chip that calls `tauriFiles.open()`. Shows filename + icon.
- `useFileToolRenderer` in `app/src/hooks/use-file-tool-renderer.tsx` —
  already renders `FileCard` after `Write`/`Edit` tool results.
- `tauriAgent.readFile(agentPath, relPath)` in `app/src/lib/tauri.ts` —
  can fetch file content as a string.
- `TurnFileSummary` — shows a collapsible list of files at turn end.
  **Do not modify this.** The new artifact cards appear inline in the tool
  result, not in the turn summary.

### What to build

#### Step 1 — New file: `app/src/components/artifact-preview.tsx`

Build a component that receives a file path + agent path, fetches the content,
and renders a type-appropriate preview. Keep it under 200 lines; split into
`artifact-renderers.tsx` if needed.

```tsx
import { useEffect, useState } from "react";
import { tauriAgent } from "../lib/tauri";
import { ExternalLinkIcon } from "lucide-react";
import { tauriFiles } from "../lib/tauri";

type PreviewKind = "csv" | "markdown" | "image" | "code" | "text" | "unknown";

function detectKind(filePath: string): PreviewKind {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) return "unknown";
  if (ext === "csv") return "csv";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
  if (
    ["ts", "tsx", "js", "jsx", "py", "rs", "sh", "json", "yaml", "yml",
     "html", "css", "sql", "toml"].includes(ext)
  ) return "code";
  if (["txt", "log", "rtf"].includes(ext)) return "text";
  return "unknown";
}
```

Renderers to implement:

- **csv** — Parse with a simple split (`\n` rows, `,` columns). Show a `<table>`
  with `<thead>` and up to 8 body rows. Add "and N more rows" if truncated.
  Use `text-xs` for cells, `bg-secondary` header row.

- **markdown** — Reuse the markdown renderer already in the chat. Import
  `MessageResponse` from `@houston-ai/chat` and pass the file content as
  children. Wrap in a `prose-sm` container.

- **image** — Render `<img src={objectUrl}>` where `objectUrl` is created from
  the base64 content via `URL.createObjectURL`. Max height `240px`,
  `object-contain`, `rounded-lg`.
  Note: `tauriAgent.readFile` returns a string. For images, check if the
  engine returns base64 or raw bytes and handle accordingly. If it returns
  a data URI, use it directly.

- **code / text** — A `<pre>` block with `overflow-x-auto`, monospace font,
  `text-xs`, `bg-zinc-900 text-zinc-100 dark:...`, capped at 20 lines.
  Show a "Show more" button if truncated.

- **unknown** — Render nothing (fall through to existing `FileCard`).

The card shell:

```tsx
export function ArtifactPreview({
  filePath,
  agentPath,
}: {
  filePath: string;
  agentPath: string;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const kind = detectKind(filePath);
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  useEffect(() => {
    if (kind === "unknown") return;
    const rel = filePath.startsWith(agentPath)
      ? filePath.slice(agentPath.length + 1)
      : filePath;
    tauriAgent
      .readFile(agentPath, rel)
      .then(setContent)
      .catch(() => setError(true));
  }, [filePath, agentPath, kind]);

  if (kind === "unknown" || error || content === null) return null;

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-background mt-2">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-secondary">
        <span className="text-xs font-medium text-foreground truncate">{fileName}</span>
        <button
          type="button"
          onClick={() => tauriFiles.open(agentPath, filePath).catch(console.error)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
        >
          <ExternalLinkIcon className="size-3" />
          Open
        </button>
      </div>
      <div className="p-3">
        {/* render by kind */}
      </div>
    </div>
  );
}
```

#### Step 2 — Replace `FileCard` with `ArtifactPreview` in `useFileToolRenderer`

In `app/src/hooks/use-file-tool-renderer.tsx`, change the `renderToolResult`
callback:

```tsx
// Before:
{filePath && !isError && isUserVisibleFilePath(filePath) && (
  <FileCard filePath={filePath} agentPath={agentPath} />
)}

// After:
{filePath && !isError && isUserVisibleFilePath(filePath) && (
  <ArtifactPreview filePath={filePath} agentPath={agentPath} />
)}
```

`ArtifactPreview` renders nothing for unknown types (falls back gracefully),
so `FileCard` is no longer needed in this path. Keep `FileCard` in
`TurnFileSummary` — that context wants the compact chip, not the full preview.

### Acceptance criteria

- After agent writes a `.csv`, a rendered table appears inline in the chat
- After agent writes a `.md`, formatted markdown appears inline
- After agent writes an image, a thumbnail appears inline
- "Open" button in the card opens the file in the OS default app
- For unsupported types, nothing new renders (no broken card)
- If file read fails, nothing renders (silent — file errors here are not
  user-initiated, so silent is correct per the beta policy exception)

### Tests

Unit-test `detectKind`: assert each extension maps to the right kind.
Unit-test the CSV parser: assert row/column counts and truncation behavior.
File: `app/src/components/artifact-preview.test.ts`.

---

## Feature 3 — Proactive Memory

### Problem

Houston agents can already learn and remember things about the user. These
learnings live in `.houston/learnings/learnings.json` and are visible in the
"Descripción del rol" tab under a sub-tab called "Learnings." Almost no user
finds them there.

There are two gaps:

1. When the agent *uses* a learning, the user never sees it. The agent
   just behaves slightly differently — invisibly. This makes the memory
   feature feel broken ("did it actually remember?").

2. When the agent encounters new facts worth remembering — the user's
   name, company, preferences — there is no way to capture them in the
   moment. The user would have to navigate to the Learnings tab and type
   it manually.

### What it solves

**Memory usage chip:** A subtle label appears above an assistant message when
the agent's text signals it is applying a stored preference. Makes memory
visible and builds trust ("the agent really does remember me").

**Save-to-memory card:** After a completed agent turn, if the agent's response
contains discoverable facts, a dismissable card offers to save them as
learnings with one tap. Makes memory capture effortless.

### What already exists

- `useLearnings(agentPath)` — fetches the learnings list.
- `useAddLearning(agentPath)` — mutation to add a new learning.
- Both in `app/src/hooks/queries/use-learnings.ts`.
- `LearningsContent` component in `app/src/components/tabs/learnings-content.tsx`.
- `ChatMessages` in `@houston-ai/chat` has an `afterMessages` prop (rendered
  at the bottom of the feed) and `renderTurnSummary` (rendered after each
  completed turn). These are the extension points.

### What to build

#### Step 1 — Utility: detect memory signals (`app/src/lib/memory-signals.ts`) — NEW FILE

```ts
const USAGE_PATTERNS = [
  /\brecuerdo que\b/i,
  /\bcomo mencionaste\b/i,
  /\bsegún tus preferencias\b/i,
  /\bbased on your preference\b/i,
  /\bas you mentioned\b/i,
  /\bI remember\b/i,
  /\bI know you prefer\b/i,
  /\byou've told me\b/i,
  /\bI recall\b/i,
];

/** Returns true if the message text signals the agent is using a stored memory. */
export function usesMemory(text: string): boolean {
  return USAGE_PATTERNS.some((re) => re.test(text));
}

const SAVE_PATTERNS = [
  /I(?:'ll| will) (?:remember|note) (?:that )?(.+?)(?:\.|$)/im,
  /(?:I'll keep in mind|noted|I'll keep that in mind)[:\s]+(.+?)(?:\.|$)/im,
  /voy a recordar (?:que )?(.+?)(?:\.|$)/im,
  /anotado[:\s]+(.+?)(?:\.|$)/im,
];

/**
 * Returns a learning candidate string if the agent's text explicitly signals
 * it is recording something, or null if nothing is detected.
 */
export function extractLearningCandidate(text: string): string | null {
  for (const re of SAVE_PATTERNS) {
    const match = re.exec(text);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}
```

#### Step 2 — Memory usage chip (`app/src/components/memory-chip.tsx`) — NEW FILE

A small label rendered above an assistant message when `usesMemory()` is true.

```tsx
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
```

Add the i18n key:
- `app/src/locales/en/chat.json`: `"memory": { "usingMemory": "Using saved preference" }`
- Mirror in `es/chat.json`: `"usingMemory": "Usando preferencia guardada"`
- Mirror in `pt/chat.json`: `"usingMemory": "Usando preferência salva"`

#### Step 3 — Wire the chip via `transformContent` in the chat panel consumer

`ChatMessages` accepts `transformContent?: (content: string) => { content: string; extra?: ReactNode }`.
Use it to inject the chip before messages that signal memory usage:

```tsx
import { usesMemory } from "../lib/memory-signals";
import { MemoryChip } from "../components/memory-chip";

// Inside the component that renders <ChatMessages>:
const transformContent = useCallback(
  (content: string) => ({
    content,
    extra: usesMemory(content) ? <MemoryChip /> : undefined,
  }),
  [],
);

<ChatMessages
  transformContent={transformContent}
  // ... rest of props
/>
```

Note: `extra` is rendered *after* the message content via `{transformed?.extra}`.
If the design requires the chip *above* the text, move the chip into the
`MessageContent` wrapper by returning it before the `MessageResponse`. Check
`ui/chat/src/chat-messages.tsx` lines 160–180 for the exact render order.

#### Step 4 — Save-to-memory card (`app/src/components/save-memory-card.tsx`) — NEW FILE

Rendered via `renderTurnSummary` (fires after each completed turn).

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BrainIcon, XIcon } from "lucide-react";
import { Button } from "@houston-ai/core";

interface SaveMemoryCardProps {
  candidate: string;
  onSave: () => Promise<void>;
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
```

i18n keys to add in `chat.json`:
```json
"memory": {
  "usingMemory": "Using saved preference",
  "savePrompt": "Want me to remember this?",
  "save": "Save",
  "saving": "Saving...",
  "dismiss": "Dismiss"
}
```

#### Step 5 — Wire `renderTurnSummary` in the chat panel consumer

```tsx
import { extractLearningCandidate } from "../lib/memory-signals";
import { SaveMemoryCard } from "../components/save-memory-card";
import { useAddLearning } from "../hooks/queries";

// Inside the consumer component:
const addLearning = useAddLearning(agentPath);
const [dismissedCandidates, setDismissedCandidates] = useState<Set<string>>(new Set());

const renderTurnSummary = useCallback(
  (summary: TurnEndSummary) => {
    // Get the last assistant message text from the summary
    const lastText = summary.tools.length === 0 ? "" : ""; // adjust based on TurnEndSummary shape
    // Note: TurnEndSummary is defined in ui/chat/src/turn-tools.ts — read it first
    // to understand what data is available and how to extract the assistant text.
    const candidate = extractLearningCandidate(lastText);
    if (!candidate || dismissedCandidates.has(candidate)) return null;

    return (
      <SaveMemoryCard
        candidate={candidate}
        onSave={() => addLearning.mutateAsync(candidate)}
        onDismiss={() =>
          setDismissedCandidates((prev) => new Set([...prev, candidate]))
        }
      />
    );
  },
  [addLearning, dismissedCandidates, agentPath],
);
```

**Important:** Read `ui/chat/src/turn-tools.ts` before implementing `renderTurnSummary`.
The `TurnEndSummary` type is defined there and shows exactly what data is available.
The assistant message content may need to be extracted from `summary.tools` or a
separate field — use whatever is correct per the actual type, not a guess.

### Acceptance criteria

- `MemoryChip` appears above any assistant message that matches a usage pattern
- `SaveMemoryCard` appears after a turn where the agent signals a new memory
- Clicking "Save" adds the learning and hides the card
- Clicking dismiss hides the card for that candidate for the session (not persisted)
- If no candidate is detected, no card renders
- All strings go through `t()`, all three locales have the keys

### Tests

Unit-test `usesMemory`: assert true/false for a matrix of input strings.
Unit-test `extractLearningCandidate`: assert the extracted substring is correct
for each pattern, and null for non-matching inputs.
Files:
- `app/src/lib/memory-signals.test.ts`

---

## Build order and timeline

```
0:00 – 0:45   Feature 1: Voice Input (wire + animation)
0:45 – 3:45   Feature 2: Inline Artifacts (renderer + fetch + types)
3:45 – 5:45   Feature 3: Proactive Memory (chip + save card)
5:45 – 7:00   Polish: loading states, edge cases, empty states
7:00 – 8:00   Demo prep
```

After each feature: run `pnpm typecheck` from the repo root and
`cargo check` if you touched any Rust. Fix before continuing.

---

## Demo script (3 minutes)

1. Open Houston. Click the microphone button and say:
   "Create a sales summary report for this month."
2. The agent runs. Tool cards appear in real time.
3. Agent writes `report.csv`. The table renders inline in the chat —
   no need to open Finder.
4. Agent says "I'll remember that you prefer reports in English."
   The memory chip appears above the message.
5. `SaveMemoryCard` appears: "Want me to remember this?" — click Save.
6. New conversation: ask the agent for another report. The memory chip
   appears again — it's using the saved preference.

Total runtime: ~90 seconds. Covers all three features without switching windows.

---

## Before committing

- [ ] `pnpm typecheck` passes
- [ ] `pnpm check-locales` passes (all three locales have the new keys)
- [ ] `cargo check` passes (if any Rust was touched — unlikely for this scope)
- [ ] New test files written and passing
- [ ] No `console.log` left in production paths
- [ ] No hardcoded English strings in JSX (all through `t()`)
- [ ] No hover-only affordances (all buttons visible without hover)
