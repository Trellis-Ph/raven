// Block-level markdown signals — any one is enough to treat a paste as markdown.
//
// Leading/gap whitespace below uses [ \t], not \s: \s also matches newlines,
// and with the `m` flag every newline inside a whitespace run becomes another
// `^` anchor point. Combined with these patterns' quantifiers, that let a
// pasted run of blank lines (common in PDF/Word/plain-text exports) blow up
// re-scanning cost catastrophically — multi-second freezes on ordinary-sized
// input. It also caused false positives like "#\n1234\n" reading as a heading
// signal. Markdown block indentation tops out at 3 leading spaces, so
// restricting to spaces/tabs keeps the intended meaning while a run of blank
// lines can no longer be consumed by these patterns at all.
const BLOCK_PATTERNS: RegExp[] = [
    /^#{1,6}[ \t]+\S/m, // heading line
    /^```/m, // fenced code block
    /^[ \t]{0,3}>[ \t]+\S/m, // blockquote line
    /^[ \t]{0,3}[-*+][ \t]+\S.*\n[ \t]{0,3}[-*+][ \t]+\S/m, // 2+ consecutive bullet lines
    /^[ \t]{0,3}\d+\.[ \t]+\S.*\n[ \t]{0,3}\d+\.[ \t]+\S/m, // 2+ consecutive ordered lines
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
