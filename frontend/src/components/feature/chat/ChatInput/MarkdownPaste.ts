import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { marked } from 'marked'
import { looksLikeMarkdown } from './markdownDetection'

// `input` is prosemirror-view internal state — it carries the live modifier-key
// state (Shift and the last key code, in particular) but is not part of
// EditorView's public types. A future prosemirror-view version could rename or
// drop it; reading it through this local type with optional chaining means
// that case degrades to "shift not held" (i.e. normal conversion still runs)
// instead of throwing.
type ViewWithInput = EditorView & { input?: { shiftKey?: boolean; lastKeyCode?: number } }

// Markdown pastes larger than this are declined outright (paste falls through
// to the default literal-text insert) rather than run through detection and
// marked.parse. This bounds worst-case main-thread time: parsing and then
// editor.commands.insertContent-ing the resulting HTML (which can run ~2x the
// input size) is the dominant cost on large pastes. 200 KB is far larger than
// any real pasted document (the target announcement file is ~2 KB) while still
// comfortably covering legitimate use.
const MAX_MARKDOWN_PASTE_LENGTH = 200_000 // characters

// Auto-converts pasted plain text that looks like markdown into rich content.
// Declines (falls through to default paste handling) for file pastes,
// Shift+paste (the literal-text escape hatch), rich-text pastes, pastes
// inside a code block, and text that doesn't look like markdown.
//
// Priority sits above CodeBlockLowlight's default (100) and below Link's
// (1000). Tiptap's ExtensionManager doesn't order ProseMirror plugins by
// extensions-array position — it reverses the array then stable-sorts by
// priority — so without an explicit priority here this plugin's handlePaste
// would run AFTER @tiptap/extension-code-block's built-in
// codeBlockVSCodeHandler, which claims every VS Code paste unconditionally.
// The explicit priority lets this plugin see VS Code pastes first, but it
// only converts when VS Code reports a markdown-ish language (see below);
// for any other language it declines so codeBlockVSCodeHandler still turns
// real source code into a syntax-highlighted code block, not mangled
// headings (e.g. a Python "# comment" line must not become an <h1>).
//
// Conversion is a single transaction: one undo cleanly reverts the paste,
// returning the document to its pre-paste state (undo does not separately
// "restore" the literal markdown text as new content — it just undoes the
// paste). Shift+paste is the real literal-text escape hatch: it makes this
// extension decline entirely, so block-level markdown (headings, lists,
// blockquotes, fenced code) lands as plain text instead of being converted.
// (Ordinary Shift+click/Shift+Ctrl+V paste, that is — Shift+Insert is
// excluded below since it's the standard paste shortcut, not this escape
// hatch. Markdown tables are never converted regardless of Shift: the
// composer has no table schema support, so a pasted table always stays
// literal.) Note this extension doesn't control inline mark auto-formatting
// from other extensions — e.g. StarterKit's Bold/Code paste rules convert
// **text**/`text` on any paste, Shift or not, independently of this file.
export const MarkdownPaste = Extension.create({
    name: 'markdownPaste',
    priority: 200,

    addProseMirrorPlugins() {
        const editor = this.editor
        return [
            new Plugin({
                key: new PluginKey('markdownPaste'),
                props: {
                    handlePaste(view, event) {
                        const clipboard = event.clipboardData
                        if (!clipboard) return false
                        if (clipboard.files && clipboard.files.length > 0) return false

                        // Shift+paste is the literal-text escape hatch. ProseMirror's own
                        // doPaste computes this from view.input.shiftKey, but it calls every
                        // handlePaste plugin (including this one) unconditionally before
                        // applying that preference, so we have to check it here too. Mirror
                        // ProseMirror's exact condition (view.input.shiftKey &&
                        // view.input.lastKeyCode != 45): key code 45 is Insert, and
                        // Shift+Insert is the standard Linux/Windows *paste* shortcut, not a
                        // paste-as-plain-text request, so it must not trip this escape hatch.
                        const input = (view as ViewWithInput).input
                        if (input?.shiftKey && input.lastKeyCode !== 45) return false

                        // VS Code tags every copy with a `vscode-editor-data` clipboard
                        // flavor carrying the source language, e.g. {"mode":"markdown"}.
                        // Once that flavor is present at all, the decision comes solely
                        // from its parsed mode — never fall through to the generic
                        // looksLikeMarkdown() heuristic below. Only a markdown-ish mode is
                        // ours to convert; any other language, a missing/non-string mode,
                        // or unparseable JSON must all decline the same way, so the paste
                        // defers to codeBlockVSCodeHandler and still becomes a
                        // syntax-highlighted code block instead of being mangled.
                        const vscodeRaw = clipboard.getData('vscode-editor-data')
                        if (vscodeRaw) {
                            let vscodeMode: string | undefined
                            try {
                                const parsed = JSON.parse(vscodeRaw)
                                vscodeMode = typeof parsed?.mode === 'string' ? parsed.mode : undefined
                            } catch {
                                vscodeMode = undefined
                            }
                            const isMarkdownVSCode = !!vscodeMode && ['markdown', 'md'].includes(vscodeMode.toLowerCase())
                            if (!isMarkdownVSCode) return false
                        } else if (clipboard.types.includes('text/html')) {
                            // Rich-text pastes with no VS Code markdown signal keep Tiptap's
                            // default handling.
                            return false
                        }

                        if (editor.isActive('codeBlock')) return false

                        const text = clipboard.getData('text/plain')
                        if (!text || text.length > MAX_MARKDOWN_PASTE_LENGTH) return false
                        if (!looksLikeMarkdown(text)) return false

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
