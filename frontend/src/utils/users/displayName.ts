import type { UserFields } from './UserListProvider'

type NamePartial = Pick<UserFields, 'full_name' | 'nickname' | 'use_nickname_as_display_name' | 'workspace_aliases'>

/**
 * A per-WORKSPACE display alias, when the current workspace has one for this
 * user. Sourced from `User`-side data via the nxtech `get_list` override
 * (`workspace_aliases: {<workspaceID>: "<Company> Admin"}`) — used for the EOR
 * "<client> Admin" identity. Highest precedence; a render-only label (grants no
 * Raven role).
 */
function workspaceAlias(user?: NamePartial, workspaceID?: string): string | undefined {
    if (!workspaceID || !user?.workspace_aliases) return undefined
    return user.workspace_aliases[workspaceID] || undefined
}

/**
 * The workspace display name for a user. Twin of the nxtech backend
 * `resolve_display_name`: a per-workspace alias wins; else the nickname is used
 * ONLY when the user opted in (`use_nickname_as_display_name`) AND has one;
 * otherwise `full_name`. `fallback` (usually the user ID) is returned when the
 * user record is missing.
 */
export function getUserDisplayName(user?: NamePartial, fallback = '', workspaceID?: string): string {
    if (!user) return fallback
    const alias = workspaceAlias(user, workspaceID)
    if (alias) return alias
    if (user.use_nickname_as_display_name && user.nickname) return user.nickname
    return user.full_name ?? fallback
}

/**
 * The `@`-mention token / autocomplete label. A per-workspace alias still wins
 * (so an @mention of the EOR admin reads "<client> Admin" in-workspace). Else
 * UN-gated: the handle is the natural mention target, so prefer the nickname
 * whenever one exists, regardless of the display toggle (matches the nxtech
 * comment-mention engine `mentionLabel = nickname || employee_name`).
 */
export function getMentionLabel(user?: NamePartial, fallback = '', workspaceID?: string): string {
    if (!user) return fallback
    const alias = workspaceAlias(user, workspaceID)
    if (alias) return alias
    return user.nickname || user.full_name || fallback
}

/** `@handle` for decorative display, or '' when no nickname is set. */
export function getUserHandle(user?: Pick<UserFields, 'nickname'>): string {
    return user?.nickname ? `@${user.nickname}` : ''
}
