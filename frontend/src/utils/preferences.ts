import { atomWithStorage } from "jotai/utils"

export const EnterKeyBehaviourAtom = atomWithStorage<"new-line" | "send-message">("raven-enter-key-behaviour", "send-message", undefined, { getOnInit: true })

export const QuickEmojisAtom = atomWithStorage<string[]>("raven-quick-emojis", ["👍", "✅", "👀", "🎉"])

/**
 * How the sidebar orders channels.
 *
 * "recent" (default) is upstream behaviour: newest activity first, so a channel
 * jumps position whenever someone posts. That is good for following a busy
 * workspace and bad for finding a specific channel — the list is never twice in
 * the same order, so there is nothing to build muscle memory on.
 *
 * "alphabetical" pins each channel to a fixed slot regardless of activity,
 * archived state, or whether it has any messages at all.
 *
 * `getOnInit: true` matters here (same as EnterKeyBehaviourAtom): without it the
 * first paint uses the default and the sidebar visibly re-sorts once the stored
 * value hydrates.
 */
export const ChannelSortAtom = atomWithStorage<"recent" | "alphabetical">("raven-channel-sort", "recent", undefined, { getOnInit: true })