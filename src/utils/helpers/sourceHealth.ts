import type { AudioSource } from './queryRouter';
import type { StreamFailureKind } from './streamDiagnostics';

/**
 * Tracks whether each audio source is actually working.
 *
 * The bot already diagnosed every stream failure and then forgot it: each one
 * was logged individually and nothing noticed that YouTube had failed five
 * times in a row. This turns those isolated events into a state, and reports
 * only the transitions - so a channel gets "YouTube is failing" once, rather
 * than one message per track.
 *
 * Pure except for the clock, which is injectable, so the whole state machine is
 * testable without timers.
 */

export type HealthState = 'unknown' | 'healthy' | 'degraded';

export interface SourceHealth {
    state: HealthState;
    consecutiveFailures: number;
    lastFailureKind?: StreamFailureKind;
    lastSuccessAt?: number;
    lastFailureAt?: number;
    changedAt?: number;
}

export interface HealthTransition {
    source: AudioSource;
    from: HealthState;
    to: HealthState;
    consecutiveFailures: number;
    kind?: StreamFailureKind;
}

export interface SourceHealthOptions {
    /**
     * Consecutive failures before a source counts as degraded. Three rather
     * than one because a single dead video or a user's typo is not an outage,
     * and alerting on it would train everyone to ignore the channel.
     */
    degradeAfter?: number;
    now?: () => number;
}

export interface SourceHealthTracker {
    /** Records an outcome. Returns a transition only when the state changed. */
    record(source: AudioSource, ok: boolean, kind?: StreamFailureKind): HealthTransition | null;
    get(source: AudioSource): SourceHealth;
    snapshot(): Record<string, SourceHealth>;
    reset(): void;
}

const DEFAULT_DEGRADE_AFTER = 3;

export function createSourceHealthTracker(options: SourceHealthOptions = {}): SourceHealthTracker {
    const degradeAfter = options.degradeAfter ?? DEFAULT_DEGRADE_AFTER;
    const now = options.now ?? Date.now;
    const states = new Map<AudioSource, SourceHealth>();

    function current(source: AudioSource): SourceHealth {
        let state = states.get(source);
        if (!state) {
            state = { state: 'unknown', consecutiveFailures: 0 };
            states.set(source, state);
        }
        return state;
    }

    return {
        record(source, ok, kind) {
            const entry = current(source);
            const previous = entry.state;
            const timestamp = now();

            if (ok) {
                entry.consecutiveFailures = 0;
                entry.lastSuccessAt = timestamp;
                entry.lastFailureKind = undefined;
                entry.state = 'healthy';
            } else {
                entry.consecutiveFailures += 1;
                entry.lastFailureAt = timestamp;
                entry.lastFailureKind = kind;
                // Stay in the previous state until the threshold is crossed, so
                // one bad track does not flip a working source to degraded.
                entry.state = entry.consecutiveFailures >= degradeAfter ? 'degraded' : previous;
            }

            if (entry.state === previous) {
                return null;
            }

            entry.changedAt = timestamp;
            return {
                source,
                from: previous,
                to: entry.state,
                consecutiveFailures: entry.consecutiveFailures,
                kind: entry.lastFailureKind,
            };
        },

        get(source) {
            return { ...current(source) };
        },

        snapshot() {
            const result: Record<string, SourceHealth> = {};
            for (const [source, state] of states) {
                result[source] = { ...state };
            }
            return result;
        },

        reset() {
            states.clear();
        },
    };
}

/** The tracker the running bot uses. */
export const sourceHealth = createSourceHealthTracker();

const SOURCE_LABELS: Record<string, string> = {
    youtube: 'YouTube',
    soundcloud: 'SoundCloud',
    spotify: 'Spotify',
    attachment: 'Soubory',
};

export function sourceLabel(source: AudioSource): string {
    return SOURCE_LABELS[source] ?? source;
}

/** Czech, user-facing. See docs/VOICE.md. */
export function describeTransition(transition: HealthTransition): string {
    const label = sourceLabel(transition.source);

    if (transition.to === 'degraded') {
        const reason = transition.kind ? ` (${transition.kind})` : '';
        return (
            `⚠️ **${label}** přestal odpovídat – ${transition.consecutiveFailures}× po sobě${reason}. ` +
            'Zkus jiný zdroj. Já mezitím budu předstírat, že mě to překvapilo.'
        );
    }

    if (transition.to === 'healthy' && transition.from === 'degraded') {
        return `✅ **${label}** je zase funkční. Nikdo neví proč. Já také ne, a to o sobě vím leccos.`;
    }

    return `ℹ️ **${label}**: ${transition.from} → ${transition.to}.`;
}
