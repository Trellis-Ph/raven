# Markdown Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasting markdown into Raven's chat composer auto-converts it to rich content, and headings render in messages — so a `.md` announcement can be sent well-formatted (via paste or via `bot.send_message(markdown=True)`).

**Architecture:** A pure detection heuristic (`markdownDetection.ts`) decides whether pasted plain text is markdown; a Tiptap extension (`MarkdownPaste.ts`) converts matches to HTML with `marked` and inserts them through the editor schema. Heading nodes are enabled in both the composer and the read-only message renderer (input rules stripped in the composer so `#` keeps triggering channel mentions). No backend changes — `RavenBot.send_message(markdown=True)` already converts markdown server-side.

**Tech Stack:** React 18, Tiptap v2.12 (ProseMirror), `marked` (new dep), `@tiptap/extension-heading` (new explicit dep, already transitive), Vite, yarn.

## Global Constraints

- NEVER commit to `main`. All work happens on the existing `feat/markdown-messages` branch (already created; spec is committed on it). Repo: `/home/frappe/frappe-bench/apps/raven`.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Heading **input rules must stay disabled in the composer** — typing `# ` + space must NOT create a heading (`#` is the channel-mention trigger).
- No backend (Python) changes.
- The frontend has NO test runner; do not add one (fork tracks upstream — avoid tooling divergence). The heuristic is verified with throwaway `tsx` scripts in the scratchpad dir (NOT committed): `/tmp/claude-1001/-home-frappe-frappe-bench-apps-raven/bf44a302-eb5c-4528-92a3-a9e23b02b00f/scratchpad`.
- Run `yarn` commands from `frontend/`; the lockfile that updates is the repo-root `yarn.lock` — commit whichever lockfile `git status` shows changed.
- Manual site verification happens ONLY on `sandbox.nxscale.com` (test channel or self-DM). Never post test messages on `trellis.ph`.

---

### Task 1: Markdown detection heuristic

**Files:**
- Create: `frontend/src/components/feature/chat/ChatInput/markdownDetection.ts`
- Test (scratchpad, not committed): `<scratchpad>/test-markdown-detection.ts`

**Interfaces:**
- Consumes: nothing (pure function, zero imports).
- Produces: `looksLikeMarkdown(text: string): boolean` — named export. Task 3 imports it from `./markdownDetection`.

Rule (from spec): text is markdown if it has ≥1 **block** signal (heading line, fenced code, 2+ consecutive list lines, blockquote line, table separator row) OR ≥2 distinct **inline** signals (`**bold**`/`__bold__`, `[text](url)` link, `` `code` `` span).

- [ ] **Step 1: Write the failing test script**

Write `<scratchpad>/test-markdown-detection.ts`:

```ts
import { looksLikeMarkdown } from '/home/frappe/frappe-bench/apps/raven/frontend/src/components/feature/chat/ChatInput/markdownDetection.ts'

const cases: Array<[string, boolean, string]> = [
    ['## Whats new\n\nBig month!', true, 'heading line'],
    ['# Title at start', true, 'h1 at text start'],
    ['```\ncode here\n```', true, 'fenced code block'],
    ['> quoted wisdom', true, 'blockquote line'],
    ['- first thing\n- second thing', true, 'two bullet lines'],
    ['1. first\n2. second', true, 'two ordered lines'],
    ['| a | b |\n| --- | --- |\n| 1 | 2 |', true, 'table separator row'],
    ['see **this** and [docs](https://x.com)', true, 'two inline signals'],
    ['run `ls` then check **output**', true, 'code span + bold'],
    ['Hey team, meeting at 3pm', false, 'plain prose'],
    ['Meet at cafe #5 tomorrow', false, 'stray # not at line start'],
    ['issue #123 and PR #456', false, 'issue refs'],
    ['this is **important**', false, 'single inline signal'],
    ['- just one bullet line', false, 'single list line'],
    ['5 * 3 * 2 = 30', false, 'arithmetic asterisks'],
    ['', false, 'empty string'],
    ['   \n  ', false, 'whitespace only'],
]

let failed = 0
for (const [input, expected, label] of cases) {
    const got = looksLikeMarkdown(input)
    if (got !== expected) {
        failed++
        console.error(`FAIL: ${label} — expected ${expected}, got ${got}`)
    } else {
        console.log(`ok: ${label}`)
    }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/frappe/frappe-bench/apps/raven/frontend && npx tsx <scratchpad>/test-markdown-detection.ts`
Expected: FAIL — cannot find module `markdownDetection.ts` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/feature/chat/ChatInput/markdownDetection.ts`:

```ts
// Block-level markdown signals — any one is enough to treat a paste as markdown.
const BLOCK_PATTERNS: RegExp[] = [
    /^#{1,6}\s+\S/m, // heading line
    /^```/m, // fenced code block
    /^\s{0,3}>\s+\S/m, // blockquote line
    /^\s{0,3}[-*+]\s+\S.*\n\s{0,3}[-*+]\s+\S/m, // 2+ consecutive bullet lines
    /^\s{0,3}\d+\.\s+\S.*\n\s{0,3}\d+\.\s+\S/m, // 2+ consecutive ordered lines
    /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{0,}:?\s*$/m, // table separator row
]

// Inline signals are weaker — require at least two distinct kinds.
const INLINE_PATTERNS: RegExp[] = [
    /\*\*[^*\n]+\*\*|__[^_\n]+__/, // bold
    /\[[^\]\n]+\]\([^)\n]+\)/, // link
    /`[^`\n]+`/, // code span
]

export const looksLikeMarkdown = (text: string): boolean => {
    if (!text || !text.trim()) return false
    if (BLOCK_PATTERNS.some((p) => p.test(text))) return true
    return INLINE_PATTERNS.filter((p) => p.test(text)).length >= 2
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/frappe/frappe-bench/apps/raven/frontend && npx tsx <scratchpad>/test-markdown-detection.ts`
Expected: `ALL PASS`, exit 0. If a case fails, fix the regex — do not delete the case.

- [ ] **Step 5: Sanity-check against the real announcement**

Run: `cd /home/frappe/frappe-bench/apps/raven/frontend && npx tsx -e "import { looksLikeMarkdown } from '/home/frappe/frappe-bench/apps/raven/frontend/src/components/feature/chat/ChatInput/markdownDetection.ts'; import { readFileSync } from 'node:fs'; console.log(looksLikeMarkdown(readFileSync('/home/frappe/frappe-bench/apps/nxtech/ANNOUNCEMENT-JULY-2026.md', 'utf8')))"`
Expected: `true`

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/raven
git add frontend/src/components/feature/chat/ChatInput/markdownDetection.ts
git commit -m "feat(chat): markdown detection heuristic for paste auto-convert

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Heading rendering in composer and message renderer

**Files:**
- Modify: `frontend/src/components/feature/chat/ChatInput/Tiptap.tsx` (imports ~line 3; module scope ~line 108; extensions array ~line 326)
- Modify: `frontend/src/components/feature/chat/ChatMessage/Renderers/TiptapRenderer/TiptapRenderer.tsx` (imports ~line 7; extensions array ~line 92)
- Modify: `frontend/src/components/feature/chat/ChatInput/tiptap.styles.css`
- Modify: `frontend/src/components/feature/chat/ChatMessage/Renderers/TiptapRenderer/tiptap-renderer.styles.css`
- Modify: `frontend/package.json` + repo-root `yarn.lock` (new explicit dep)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `heading` node available in both editors' schemas (levels 1–6). Task 3's pasted `<h1>`–`<h6>` survive only because of this task. Exports `HeadingWithoutInputRules` from `Tiptap.tsx` is NOT needed — keep it file-local.

Both files keep `heading: false` inside `StarterKit.configure(...)` — the standalone `Heading` extension is added separately (in the composer it's extended to strip input rules).

- [ ] **Step 1: Add the dependency**

```bash
cd /home/frappe/frappe-bench/apps/raven/frontend && yarn add @tiptap/extension-heading@^2.12.0
```

- [ ] **Step 2: Composer — add heading extension (input rules stripped)**

In `frontend/src/components/feature/chat/ChatInput/Tiptap.tsx`:

Add import after the `import StarterKit from '@tiptap/starter-kit'` line:

```ts
import Heading from '@tiptap/extension-heading'
```

Add at module scope, right after the `ChannelMention` const definition (after the line `export interface MemberSuggestions extends UserFields {` block ends is too late — place it directly after the `ChannelMention` `.configure({...})` closing, before `export interface MemberSuggestions`):

```ts
// Headings can be pasted (e.g. converted markdown) but not typed — the "# " input
// rule would fight the channel-mention trigger on #.
const HeadingWithoutInputRules = Heading.extend({
    addInputRules() {
        return []
    }
}).configure({
    levels: [1, 2, 3, 4, 5, 6]
})
```

In the `extensions` array, add a new entry right after the `StarterKit.configure({...})` entry (which ends with the `code: { HTMLAttributes: {...} },` block followed by `}),`):

```ts
        HeadingWithoutInputRules,
```

- [ ] **Step 3: Renderer — enable headings**

In `frontend/src/components/feature/chat/ChatMessage/Renderers/TiptapRenderer/TiptapRenderer.tsx`:

Add import after `import StarterKit from '@tiptap/starter-kit'`:

```ts
import Heading from '@tiptap/extension-heading'
```

In the `extensions` array, add right after the `StarterKit.configure({...})` entry's closing `}),`:

```ts
      Heading.configure({
        levels: [1, 2, 3, 4, 5, 6]
      }),
```

- [ ] **Step 4: Styling**

The two files get **different** scales — their body text differs. The composer's
paragraphs are a fixed `text-sm` (14px at every width). The renderer's are
`text-base sm:text-sm` (16px mobile, 14px from 640px up). Headings must stay
visibly larger than body at BOTH breakpoints, so the renderer needs a
mobile-first scale with a `640px` step-down; a fixed scale would put `h3` at
exactly body size on mobile.

Append to `frontend/src/components/feature/chat/ChatInput/tiptap.styles.css`
(composer — body is 14px at all widths, so one fixed scale):

```css
.tiptap-editor h1,
.tiptap-editor h2,
.tiptap-editor h3,
.tiptap-editor h4,
.tiptap-editor h5,
.tiptap-editor h6 {
    font-weight: 700;
    line-height: 1.35;
    margin: 0.75rem 0 0.25rem 0;
}

.tiptap-editor h1 {
    font-size: 1.25rem;
}

.tiptap-editor h2 {
    font-size: 1.125rem;
}

.tiptap-editor h3 {
    font-size: 1rem;
}

.tiptap-editor h4,
.tiptap-editor h5,
.tiptap-editor h6 {
    font-size: 0.875rem;
}

.tiptap-editor h1:first-child,
.tiptap-editor h2:first-child,
.tiptap-editor h3:first-child,
.tiptap-editor h4:first-child,
.tiptap-editor h5:first-child,
.tiptap-editor h6:first-child {
    margin-top: 0;
}
```

Append to
`frontend/src/components/feature/chat/ChatMessage/Renderers/TiptapRenderer/tiptap-renderer.styles.css`
(renderer — mobile-first, stepping down at 640px to match `text-base sm:text-sm`):

```css
.tiptap-renderer h1,
.tiptap-renderer h2,
.tiptap-renderer h3,
.tiptap-renderer h4,
.tiptap-renderer h5,
.tiptap-renderer h6 {
    font-weight: 700;
    line-height: 1.35;
    margin: 0.75rem 0 0.25rem 0;
}

.tiptap-renderer h1 {
    font-size: 1.375rem;
}

.tiptap-renderer h2 {
    font-size: 1.25rem;
}

.tiptap-renderer h3 {
    font-size: 1.125rem;
}

.tiptap-renderer h4,
.tiptap-renderer h5,
.tiptap-renderer h6 {
    font-size: 1rem;
}

@media screen and (min-width: 640px) {
    .tiptap-renderer h1 {
        font-size: 1.25rem;
    }

    .tiptap-renderer h2 {
        font-size: 1.125rem;
    }

    .tiptap-renderer h3 {
        font-size: 1rem;
    }

    .tiptap-renderer h4,
    .tiptap-renderer h5,
    .tiptap-renderer h6 {
        font-size: 0.875rem;
    }
}

.tiptap-renderer h1:first-child,
.tiptap-renderer h2:first-child,
.tiptap-renderer h3:first-child,
.tiptap-renderer h4:first-child,
.tiptap-renderer h5:first-child,
.tiptap-renderer h6:first-child {
    margin-top: 0;
}
```

Rationale (UI/UX rules applied): headings keep a clear size **and** weight
delta from body at both breakpoints ("Heading Clarity"); h4–h6 sit at body
size but bold, which is the documented acceptable minimum; heading
line-height 1.35 stays tight without cramping, while body line-height is
untouched (the renderer's `leading-relaxed` on list items stays at 1.625).

- [ ] **Step 5: Verify the frontend builds**

Run: `cd /home/frappe/frappe-bench/apps/raven/frontend && yarn build`
Expected: Vite build completes with no errors (warnings about chunk size are pre-existing and fine). Do NOT commit build outputs or `raven/www/raven.html` yet — that happens once, in Task 5.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/raven
git status --short   # confirm which lockfile changed (expect ./yarn.lock)
git add frontend/package.json yarn.lock \
  frontend/src/components/feature/chat/ChatInput/Tiptap.tsx \
  frontend/src/components/feature/chat/ChatInput/tiptap.styles.css \
  frontend/src/components/feature/chat/ChatMessage/Renderers/TiptapRenderer/TiptapRenderer.tsx \
  frontend/src/components/feature/chat/ChatMessage/Renderers/TiptapRenderer/tiptap-renderer.styles.css
git commit -m "feat(chat): render headings in messages and composer

Headings were disabled in both Tiptap schemas, so <h1>-<h6> in stored
message HTML (e.g. from bot send_message(markdown=True)) collapsed to
plain paragraphs. Input rules are stripped in the composer so '# '
cannot create a heading — # stays the channel-mention trigger.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: MarkdownPaste extension wired into the composer

**Files:**
- Create: `frontend/src/components/feature/chat/ChatInput/MarkdownPaste.ts`
- Modify: `frontend/src/components/feature/chat/ChatInput/Tiptap.tsx` (imports; extensions array)
- Modify: `frontend/package.json` + repo-root `yarn.lock` (add `marked`)
- Test (scratchpad, not committed): `<scratchpad>/test-markdown-convert.ts`

**Interfaces:**
- Consumes: `looksLikeMarkdown(text: string): boolean` from `./markdownDetection` (Task 1); heading schema from Task 2.
- Produces: `MarkdownPaste` — a Tiptap `Extension`, named export, registered in the composer's `extensions` array.

- [ ] **Step 1: Add the dependency**

```bash
cd /home/frappe/frappe-bench/apps/raven/frontend && yarn add marked
```

(`marked` is zero-dependency and ships its own TypeScript types.)

- [ ] **Step 2: Write the failing conversion test script**

Write `<scratchpad>/test-markdown-convert.ts` — verifies the exact `marked` options the extension will use produce HTML the Tiptap schema can represent:

```ts
import { readFileSync } from 'node:fs'
import { marked } from 'marked'
import { looksLikeMarkdown } from '/home/frappe/frappe-bench/apps/raven/frontend/src/components/feature/chat/ChatInput/markdownDetection.ts'

const md = readFileSync('/home/frappe/frappe-bench/apps/nxtech/ANNOUNCEMENT-JULY-2026.md', 'utf8')

if (!looksLikeMarkdown(md)) {
    console.error('FAIL: announcement not detected as markdown')
    process.exit(1)
}

const html = marked.parse(md, { gfm: true, breaks: true, async: false }) as string

const required = ['<h1', '<h2', '<strong>', '<ul>', '<li>']
const missing = required.filter((tag) => !html.includes(tag))
if (missing.length) {
    console.error(`FAIL: converted HTML missing ${missing.join(', ')}`)
    process.exit(1)
}
console.log('ALL PASS')
```

- [ ] **Step 3: Run the conversion test**

Run: `cd /home/frappe/frappe-bench/apps/raven/frontend && npx tsx <scratchpad>/test-markdown-convert.ts`
Expected: `ALL PASS` (this validates the `marked` options before they're baked into the extension; if `marked` is missing it fails — Step 1 not done).

- [ ] **Step 4: Create the extension**

Create `frontend/src/components/feature/chat/ChatInput/MarkdownPaste.ts`:

```ts
import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from 'prosemirror-state'
import { marked } from 'marked'
import { looksLikeMarkdown } from './markdownDetection'

// Auto-converts pasted plain text that looks like markdown into rich content.
// Declines (falls through to default paste handling) for file pastes, rich-text
// pastes, pastes inside a code block, and text that doesn't look like markdown.
// Conversion is a single transaction, so one undo restores the literal text.
export const MarkdownPaste = Extension.create({
    name: 'markdownPaste',

    addProseMirrorPlugins() {
        const editor = this.editor
        return [
            new Plugin({
                key: new PluginKey('markdownPaste'),
                props: {
                    handlePaste(_view, event) {
                        const clipboard = event.clipboardData
                        if (!clipboard) return false
                        if (clipboard.files && clipboard.files.length > 0) return false

                        // Rich-text pastes keep Tiptap's default handling. Exception:
                        // VS Code puts a styled text/html flavor on every copy — for a
                        // markdown source copied there, the plain-text flavor is the
                        // real content.
                        const isVSCode = clipboard.types.includes('vscode-editor-data')
                        if (clipboard.types.includes('text/html') && !isVSCode) return false

                        if (editor.isActive('codeBlock')) return false

                        const text = clipboard.getData('text/plain')
                        if (!text || !looksLikeMarkdown(text)) return false

                        try {
                            const html = marked.parse(text, { gfm: true, breaks: true, async: false }) as string
                            editor.commands.insertContent(html)
                            return true
                        } catch {
                            return false
                        }
                    }
                }
            })
        ]
    }
})
```

Notes for the implementer:
- Returning `true` from `handlePaste` marks the event handled; ProseMirror prevents the default paste.
- `editor.commands.insertContent(html)` parses through the schema — unknown tags/scripts are dropped (this is the sanitization layer) — and replaces any selection in one transaction (single undo step).
- The existing file-paste handler in `Tiptap.tsx` (`handleDOMEvents.paste` inside `KeyboardHandler`) only acts when files are present; `MarkdownPaste` declines in that case, so they never both fire.

- [ ] **Step 5: Wire into the composer**

In `frontend/src/components/feature/chat/ChatInput/Tiptap.tsx`:

Add import next to the other local imports (e.g. after `import MentionList from './MentionList'`):

```ts
import { MarkdownPaste } from './MarkdownPaste'
```

In the `extensions` array, add after the `HeadingWithoutInputRules,` entry added in Task 2:

```ts
        MarkdownPaste,
```

- [ ] **Step 6: Verify the frontend builds**

Run: `cd /home/frappe/frappe-bench/apps/raven/frontend && yarn build`
Expected: build completes with no errors.

- [ ] **Step 7: Commit**

```bash
cd /home/frappe/frappe-bench/apps/raven
git status --short   # confirm lockfile path
git add frontend/package.json yarn.lock \
  frontend/src/components/feature/chat/ChatInput/MarkdownPaste.ts \
  frontend/src/components/feature/chat/ChatInput/Tiptap.tsx
git commit -m "feat(chat): auto-convert markdown pastes to rich content

Plain-text pastes that look like markdown (block signals, or 2+ inline
signals) are parsed with marked and inserted through the schema. Rich
pastes, file pastes, and code-block pastes are untouched; one undo
restores the literal text. VS Code copies are treated as plain text.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Docs — sending markdown announcements

**Files:**
- Create: `docs/trellis/sending-markdown-announcements.md`

**Interfaces:**
- Consumes: nothing. Produces: nothing code-facing (documentation only).

- [ ] **Step 1: Write the doc**

Create `docs/trellis/sending-markdown-announcements.md`:

```markdown
# Sending markdown announcements (Trellis fork)

Two ways to post a well-formatted `.md` announcement to a Raven channel.

## Option A — paste into the chat box

Copy the markdown source and paste it into the composer. Pastes that look
like markdown are converted to rich formatting automatically (headings,
bold, lists, code, tables). Review the result in the composer, then send.

If you did not want the conversion, hold **Shift while pasting**. That keeps
block-level structure — headings, lists, quotes, code blocks, tables — as
plain text. Inline styling is a separate, always-on Tiptap behaviour and
still applies even with Shift held: `**bold**`, `*italic*`, `~~strike~~`,
`` `code` ``, `==highlight==`, and bare URLs are auto-formatted regardless.

Ctrl+Z undoes a conversion you already made, but it reverts the paste
entirely rather than leaving the literal markdown behind — so to get the
raw text, re-paste with Shift held.

## Option B — bot script (repeatable / automatable)

`RavenBot.send_message` converts markdown server-side. From
`bench --site <site> console`:

​```python
bot = frappe.get_doc("Raven Bot", "<bot-name>")  # any existing bot
bot.send_message(
    channel_id="<channel-id>",  # Raven Channel name, e.g. from the channel URL
    text=open("/path/to/ANNOUNCEMENT.md").read(),
    markdown=True,
)
frappe.db.commit()
​```

A **Raven Incoming Webhook** (Raven settings → Integrations) is the
no-console equivalent — POST the markdown as `content` and it converts the
same way:

​```json
{ "content": "# Heading\n\nSome **bold** text." }
​```

The field must be `content`. Any other key is ignored and the webhook
posts an empty message while still returning success.

Verify on sandbox before posting to a production channel.
```

(Remove the zero-width characters before the code fences — they're only there so this plan's own fence doesn't break; the real file uses plain ``` fences.)

- [ ] **Step 2: Commit**

```bash
cd /home/frappe/frappe-bench/apps/raven
git add docs/trellis/sending-markdown-announcements.md
git commit -m "docs: sending markdown announcements via paste, bot, or webhook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Build artifacts, manual verification, PR

**Files:**
- Modify: `raven/www/raven.html` (bundle pointer — regenerated by the build)

**Interfaces:**
- Consumes: all prior tasks. Produces: the reviewable PR.

- [ ] **Step 1: Build via bench (per CLAUDE.md)**

```bash
cd /home/frappe/frappe-bench && bench build --app raven
```

Expected: completes without error; `git -C apps/raven status` shows `raven/www/raven.html` modified (new bundle hash).

- [ ] **Step 2: Manual verification on sandbox**

On `sandbox.nxscale.com` ONLY (test channel or self-DM), after a hard refresh (and `bench --site sandbox.nxscale.com clear-website-cache` if the old bundle persists):

1. Paste the full text of `/home/frappe/frappe-bench/apps/nxtech/ANNOUNCEMENT-JULY-2026.md` into the composer → renders with headings, bold, lists, emoji intact.
2. Press Ctrl+Z once → literal markdown text restored.
3. Send the converted message → renders identically in the channel.
4. Paste plain prose containing a stray `#` and `*` → stays literal.
5. Insert a code block (toolbar), paste markdown inside → stays literal.
6. Copy a formatted paragraph from a web page, paste → unchanged rich-paste behavior.
7. Type `# ` at the start of a line → no heading; `#` still opens channel-mention suggestions.
8. From `bench --site sandbox.nxscale.com console`: send the announcement via `bot.send_message(..., markdown=True)` (snippet in Task 4's doc) → message renders with headings.

Record the result of each check. If any fail, STOP and fix before proceeding (use superpowers:systematic-debugging).

- [ ] **Step 3: Commit the bundle pointer**

```bash
cd /home/frappe/frappe-bench/apps/raven
git add raven/www/raven.html
git commit -m "chore(build): update raven.html bundle pointer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and open the PR**

```bash
cd /home/frappe/frappe-bench/apps/raven
git push -u origin feat/markdown-messages
gh pr create --repo Trellis-Ph/raven --base main --title "feat(chat): markdown paste auto-convert + heading rendering" --body "$(cat <<'EOF'
## What

- Auto-convert plain-text pastes that look like markdown into rich content (new `MarkdownPaste` Tiptap extension + `marked`).
- Enable heading rendering in the composer and message renderer (chat-scale sizes). Typing shortcuts stay off — `#` remains the channel-mention trigger.
- Docs: how to send markdown announcements (paste / bot `markdown=True` / incoming webhook).

## Why

Announcements written in markdown (e.g. nxtech ANNOUNCEMENT-JULY-2026.md) pasted as literal `##`/`**` text, and even server-converted markdown lost its headings because both Tiptap schemas had `heading: false`. Spec: `docs/superpowers/specs/2026-07-28-markdown-messages-design.md`.

## Notes

- No backend changes. Messages previously sent with `markdown=True` render their headings retroactively.
- Detection requires a block-level markdown signal or 2+ inline signals; false positives undo in one Ctrl+Z.
- Verified manually on sandbox (paste, undo, send, stray-`#` prose, code-block paste, rich paste, bot send).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Report it to the user for review — squash-merge happens via the PR after review, then image rebuild in `Trellis-Ph/nXtech` (see CLAUDE.md).
