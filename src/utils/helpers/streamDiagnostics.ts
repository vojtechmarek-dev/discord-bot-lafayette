/**
 * Turns an extractor's stashed stream error into something actionable.
 *
 * `YoutubeSabrExtractor.stream()` returns a PassThrough before fetching any
 * media segment, then fetches in the background. When that fetch fails it puts
 * the real cause on `track.metadata.streamError` and ends the stream with zero
 * bytes - no `playerError` is ever emitted.
 *
 * Nothing read that field, so the bot logged a generic "source likely rejected
 * the stream" while the actual reason (segment 403, missing PO token, no
 * streaming URL) sat one property away.
 */

export type StreamFailureKind =
    | 'no-stream-url'
    | 'no-ustreamer-config'
    | 'po-token'
    | 'forbidden'
    | 'not-found'
    | 'network'
    | 'unknown';

export interface StreamDiagnosis {
    kind: StreamFailureKind;
    /** Full detail for the log. */
    message: string;
    /** Czech, user-facing, and specific enough to act on. */
    userMessage: string;
}

/**
 * Matched against the messages `discord-player-googlevideo` actually throws,
 * most specific first. Order matters: a PO-token failure often also mentions a
 * 403, and the token is the more useful diagnosis.
 */
const PATTERNS: { kind: StreamFailureKind; pattern: RegExp }[] = [
    { kind: 'po-token', pattern: /po\s*token|potoken|botguard|bgutils/i },
    { kind: 'no-ustreamer-config', pattern: /streaming configuration not available|ustreamer/i },
    { kind: 'no-stream-url', pattern: /streaming url not available|no (playable )?format|server_abr_streaming_url/i },
    { kind: 'forbidden', pattern: /\b403\b|forbidden/i },
    { kind: 'not-found', pattern: /\b404\b|not found|unavailable|private video|video is (age|region)/i },
    { kind: 'network', pattern: /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|socket hang up|network|fetch failed/i },
];

const USER_MESSAGES: Record<StreamFailureKind, string> = {
    'po-token': 'YouTube si vyžádal ověřovací token, který se nepodařilo získat.',
    'no-ustreamer-config': 'YouTube nevrátil použitelnou konfiguraci streamu.',
    'no-stream-url': 'YouTube nevrátil žádnou přehratelnou adresu zvuku.',
    forbidden: 'YouTube odmítl zvukové segmenty (403). Zkuste jiný zdroj, například `/play source:soundcloud`.',
    'not-found': 'Zdroj tuto skladbu nezpřístupnil – může být smazaná, soukromá nebo blokovaná.',
    network: 'Spojení se zdrojem se přerušilo.',
    unknown: 'Zdroj nevrátil žádný zvuk.',
};

/** Pulls a message out of whatever the extractor stashed. */
function extractMessage(value: unknown): string | null {
    if (!value) {
        return null;
    }
    if (typeof value === 'string') {
        return value;
    }
    if (value instanceof Error) {
        return value.stack ?? value.message;
    }
    if (typeof value === 'object') {
        const candidate = value as { message?: unknown; stack?: unknown };
        if (typeof candidate.stack === 'string') {
            return candidate.stack;
        }
        if (typeof candidate.message === 'string') {
            return candidate.message;
        }
    }
    return null;
}

/**
 * Reads `metadata.streamError` and classifies it.
 *
 * Returns null when the metadata carries no stream error at all, which is the
 * normal case and must be distinguishable from "failed for an unknown reason".
 */
export function diagnoseStreamFailure(metadata: unknown): StreamDiagnosis | null {
    if (!metadata || typeof metadata !== 'object') {
        return null;
    }

    const streamError = (metadata as { streamError?: unknown }).streamError;
    const message = extractMessage(streamError);
    if (!message) {
        return null;
    }

    for (const { kind, pattern } of PATTERNS) {
        if (pattern.test(message)) {
            return { kind, message, userMessage: USER_MESSAGES[kind] };
        }
    }

    return { kind: 'unknown', message, userMessage: USER_MESSAGES.unknown };
}

/** The user-facing half, for when no diagnosis is available. */
export function defaultStreamFailureMessage(): string {
    return USER_MESSAGES.unknown;
}
