import type { UserFields } from './UserListProvider'

type NamePartial = Pick<UserFields, 'full_name' | 'nickname' | 'use_nickname_as_display_name'>

/**
 * The workspace display name for a user. Twin of the nxtech backend
 * `resolve_display_name`: the nickname is used ONLY when the user opted in
 * (`use_nickname_as_display_name`) AND has one; otherwise `full_name`.
 * `fallback` (usually the user ID) is returned when the user record is missing.
 */
export function getUserDisplayName(user?: NamePartial, fallback = ''): string {
    if (!user) return fallback
    if (user.use_nickname_as_display_name && user.nickname) return user.nickname
    return user.full_name ?? fallback
}

/**
 * The `@`-mention token / autocomplete label. UN-gated: the handle is the
 * natural mention target, so prefer the nickname whenever one exists,
 * regardless of the display toggle (matches the nxtech comment-mention engine
 * `mentionLabel = nickname || employee_name`). Falls back to full_name.
 */
export function getMentionLabel(user?: NamePartial, fallback = ''): string {
    if (!user) return fallback
    return user.nickname || user.full_name || fallback
}

/** `@handle` for decorative display, or '' when no nickname is set. */
export function getUserHandle(user?: Pick<UserFields, 'nickname'>): string {
    return user?.nickname ? `@${user.nickname}` : ''
}
