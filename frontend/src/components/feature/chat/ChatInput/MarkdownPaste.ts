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
