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
