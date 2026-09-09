/**
 * The single source of truth for "did this stream actually produce audio".
 *
 * These used to be three different numbers: 500ms in the playerStart handler,
 * an exported-but-unused 1000ms default in the watchdog, and 3000ms in the
 * smoke canary. Production being six times more lenient than the canary meant
 * the canary was effectively testing a different bot - it could redline on a
 * stream production had already accepted, and production could accept a stream
 * the canary would have caught.
 *
 * 3000ms is the canary's number and the correct one: 500ms is roughly one Opus
 * frame batch plus jitter, and a SABR stream that 403s on its second segment
 * can easily emit that much buffered audio before dying. That is exactly the
 * failure that went unnoticed in production on 2026-09-08.
 */

/** Decoded audio a track must produce before playback counts as real. */
export const MIN_REAL_AUDIO_MS = 3_000;

/**
 * How long to wait for that audio before declaring the stream dead. Generous
 * enough to cover a cold YouTube PO-token mint, which the previous 12s could
 * miss on a slow connection.
 */
export const CONFIRM_TIMEOUT_MS = 20_000;

/** How often to sample the track's stream time. */
export const CONFIRM_POLL_INTERVAL_MS = 250;
