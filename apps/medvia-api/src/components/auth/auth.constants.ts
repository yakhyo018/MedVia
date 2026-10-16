/** Every request carries this token, so it lives briefly. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Sliding: each refresh pushes the expiry 30 days further. */
export const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * Replaying a refresh token this soon after it rotated is treated as two tabs racing,
 * not as theft: the request is refused but the session survives. Later replays end it.
 */
export const REFRESH_REUSE_GRACE_SECONDS = 10;

export const REFRESH_COOKIE = 'medvia_rt';
