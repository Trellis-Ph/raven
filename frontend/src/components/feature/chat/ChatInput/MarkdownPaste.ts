import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from 'prosemirror-state'
import { marked } from 'marked'
import { looksLikeMarkdown } from './markdownDetection'

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
// blockquotes, tables, fenced code) lands as plain text instead of being
// converted. Note this extension doesn't control inline mark auto-formatting
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
                        // applying that preference, so we have to check it here too.
                        if (view.input.shiftKey) return false

                        // VS Code tags every copy with a `vscode-editor-data` clipboard
                        // flavor carrying the source language, e.g. {"mode":"markdown"}.
                        // Only a markdown-ish mode is ours to convert; any other language
                        // must fall through to codeBlockVSCodeHandler so it still becomes a
                        // syntax-highlighted code block. A malformed/unparseable value is
                        // treated the same as "no VS Code data" — never throws.
                        let vscodeMode: string | undefined
                        const vscodeRaw = clipboard.getData('vscode-editor-data')
                        if (vscodeRaw) {
                            try {
                                const parsed = JSON.parse(vscodeRaw)
                                vscodeMode = typeof parsed?.mode === 'string' ? parsed.mode : undefined
                            } catch {
                                vscodeMode = undefined
                            }
                        }

                        if (vscodeMode) {
                            const isMarkdownVSCode = ['markdown', 'md'].includes(vscodeMode.toLowerCase())
                            if (!isMarkdownVSCode) return false
                        } else if (clipboard.types.includes('text/html')) {
                            // Rich-text pastes with no VS Code markdown signal keep Tiptap's
                            // default handling.
                            return false
                        }

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
