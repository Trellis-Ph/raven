# Markdown messages in Raven — design

**Date:** 2026-07-28
**Status:** Approved
**Driver:** Sending well-formatted announcements (e.g. nxtech `ANNOUNCEMENT-JULY-2026.md`)
into Raven channels. Today, pasted markdown stays literal and headings never render.

## Problem

Two gaps prevent well-formatted markdown messages:

1. **Headings are disabled** in both the chat composer
   (`frontend/src/components/feature/chat/ChatInput/Tiptap.tsx`, `heading: false`)
   and the message renderer
   (`frontend/src/components/feature/chat/ChatMessage/Renderers/TiptapRenderer/TiptapRenderer.tsx`,
   `heading: false`). `<h1>`–`<h6>` in stored message HTML collapse to plain
   paragraphs. Bold, italic, lists, tables, inline code, code blocks, links, and
   images already render correctly.
2. **No markdown parsing on paste.** Pasting `.md` content into the composer keeps
   the literal `##`/`**` characters. The code-block button is for literal code and
   is not a markdown route.

The backend already converts markdown to HTML:
`RavenBot.send_message(..., markdown=True)`
(`raven/raven_bot/doctype/raven_bot/raven_bot.py`) and Raven Incoming Webhooks
both call `frappe.utils.md_to_html`. No backend changes are needed.

## Scope

Frontend only:

1. A `MarkdownPaste` composer extension that auto-detects markdown in plain-text
   pastes and converts it to rich content.
2. Heading support (schema + styling) in composer and renderer.
3. A short docs note on sending announcements via bot/webhook.

Out of scope: markdown *typing* shortcuts for headings (conflicts with the `#`
channel-mention trigger), a "paste as markdown" explicit action, serializing
rich content back to markdown, backend changes.

## Design

### 1. Composer — `MarkdownPaste` extension

New file: `frontend/src/components/feature/chat/ChatInput/MarkdownPaste.ts`.
A Tiptap `Extension` contributing a ProseMirror plugin with a `handlePaste` prop.

Runs only when ALL hold:

- Clipboard has `text/plain` and **no** `text/html` flavor (rich pastes from
  browsers/Office keep Tiptap's default handling) and no files. Exception:
  when the clipboard carries `vscode-editor-data` (VS Code adds a styled
  `text/html` flavor to every copy), the plain-text flavor is treated as the
  real content and detection runs anyway.
- The selection is not inside a code block (paste stays literal there).
- The detection heuristic matches.

**Detection heuristic** (pure function, exported for tests). Text is "markdown"
if it contains at least one block-level signal, or two or more inline signals:

- Block signals: a line starting `#{1,6} `; a fenced code block (```` ``` ````);
  two or more consecutive lines starting with `- `/`* `/`+ ` or `1. `-style
  ordered markers; a blockquote line (`> `); a table separator row (`|---|`).
- Inline signals: `**bold**`/`__bold__` pairs, `[text](url)` links, `` `code` ``
  spans.

**Conversion:** `marked.parse(text, { gfm: true, breaks: true })` → HTML →
`editor.commands.insertContent(html)` in a single transaction, so one undo
restores the literal pasted text. On any parse error, return `false` and let the
default paste proceed.

**Security:** inserted HTML is parsed through the Tiptap/ProseMirror schema,
which drops all nodes/marks not in the whitelist — script tags and unknown
elements cannot survive. No `dangerouslySetInnerHTML` anywhere.

**New dependency:** `marked` (zero-dependency, ~10 kB gzipped).

### 2. Headings in composer and renderer

- **Composer (`Tiptap.tsx`):** keep `heading: false` in StarterKit; add the
  standalone `Heading` extension extended with `addInputRules: () => []` so
  headings exist in the schema (pasted conversions survive) but typing `# ` +
  space does not create one — `#` remains the channel-mention trigger.
- **Renderer (`TiptapRenderer.tsx`):** same schema enablement. Styling lives in
  `tiptap-renderer.styles.css` (and `tiptap.styles.css` for the composer):
  chat-scale sizes — h1 ≈ `text-xl`, h2 ≈ `text-lg`, h3 ≈ `text-base`,
  h4–h6 bold at body size — with modest top/bottom margins.
- Retroactive fix: messages previously sent with `markdown=True` already store
  `<h2>` etc.; they render correctly as soon as this ships.

### 3. Sending announcements (no new code)

Documented in `docs/` as part of this change. From bench console or a script:

```python
bot = frappe.get_doc("Raven Bot", "<bot-name>")
bot.send_message(
    channel_id="<channel-id>",
    text=open("ANNOUNCEMENT-JULY-2026.md").read(),
    markdown=True,
)
```

A Raven Incoming Webhook is an equivalent no-code alternative (it also converts
markdown server-side).

## Error handling

- Markdown parse failure → fall back to default paste (literal text).
- Detection false positive → single Ctrl+Z restores the literal text.
- Clipboard with files → existing file-attachment paste handling wins (the
  `MarkdownPaste` plugin declines).

## Testing

- Unit tests for the detection heuristic (pure function) if the frontend has a
  test runner configured; verified during planning.
- Manual checklist:
  - Paste `ANNOUNCEMENT-JULY-2026.md` → renders with headings, bold, lists, emoji.
  - Paste ordinary prose containing a stray `#` or `*` → stays literal.
  - Paste inside a code block → stays literal.
  - Rich-text paste from a web page → unchanged behavior.
  - `bot.send_message(markdown=True)` → message renders with headings.
  - Ctrl+Z after an auto-conversion → literal text restored.

## Rollout

Per `CLAUDE.md`: branch `feat/markdown-messages` → PR to `main` →
`bench build --app raven` and commit the updated `raven/www/raven.html` pointer
on the branch → squash-merge → rebuild the Trellis image in `Trellis-Ph/nXtech`
(raven branch-tracked at `main`) → pull the image on prod/sandbox.
