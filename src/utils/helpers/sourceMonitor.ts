import type { Client } from 'discord.js';
import type { Player } from 'discord-player';
import { config } from '../../config';
import { probeSource, type ProbeResult } from './sourceProbe';
import { describeTransition, sourceHealth, type HealthTransition } from './sourceHealth';
import type { SearchableSource } from './queryRouter';

/**
 * Glue between the probe, the health tracker and Discord.
 *
 * Reports only state transitions. Posting on every failure would be noise, and
 * noise is how a health channel gets muted.
 */

const PROBED_SOURCES: SearchableSource[] = ['youtube', 'soundcloud'];

/** Announces a transition, if a channel is configured. Logs either way. */
export async function reportTransition(client: Client, transition: HealthTransition): Promise<void> {
    const line = describeTransition(transition);
    const level = transition.to === 'degraded' ? console.error : console.log;
    level(`[Health] ${transition.source}: ${transition.from} -> ${transition.to} (${transition.consecutiveFailures} failures, ${transition.kind ?? 'no diagnosis'})`);

    if (!config.HEALTH_CHANNEL_ID || !client.isReady()) {
        return;
    }

    try {
        const channel = await client.channels.fetch(config.HEALTH_CHANNEL_ID);
        if (!channel?.isTextBased() || !channel.isSendable()) {
            console.warn('[Health] LAFAYETTE_HEALTH_CHANNEL_ID is not a sendable text channel.');
            return;
        }
        await channel.send(line);
    } catch (error: any) {
        // Same treatment as playback announcements: a permissions problem is a
        // warning, not a stack trace on every transition.
        if (error?.code === 50001 || error?.code === 50013) {
            console.warn(`[Health] Cannot post to the health channel: ${error.rawError?.message ?? error.message}`);
            return;
        }
        console.error('[Health] Failed to post health notice:', error);
    }
}

/**
 * Records a real playback outcome.
 *
 * Called from the player events, so ordinary use keeps the health state fresh
 * between probes - and a user hitting a broken source is itself the signal.
 */
export function recordPlaybackOutcome(
    client: Client,
    source: SearchableSource | 'spotify' | 'attachment',
    ok: boolean,
    kind?: Parameters<typeof sourceHealth.record>[2],
): void {
    const transition = sourceHealth.record(source, ok, kind);
    if (transition) {
        void reportTransition(client, transition);
    }
}

/** Runs one probe per source and feeds the results into the tracker. */
export async function runProbes(client: Client, player: Player): Promise<ProbeResult[]> {
    const results: ProbeResult[] = [];

    for (const source of PROBED_SOURCES) {
        const result = await probeSource(player, source);
        results.push(result);

        console.log(
            `[Health] Probe ${source}: ${result.ok ? 'ok' : 'FAILED'} ` +
            `(${result.bytes} bytes in ${result.durationMs}ms)` +
            (result.detail ? ` - ${result.detail}` : '') +
            (result.diagnosis ? ` [${result.diagnosis.kind}]` : ''),
        );

        const transition = sourceHealth.record(source, result.ok, result.diagnosis?.kind);
        if (transition) {
            await reportTransition(client, transition);
        }
    }

    return results;
}

/**
 * Starts periodic probing. Returns a stop function, and a no-op when probing is
 * disabled with LAFAYETTE_PROBE_INTERVAL_MS=0.
 */
export function startSourceMonitor(client: Client, player: Player | null): () => void {
    if (!player || config.PROBE_INTERVAL_MS <= 0) {
        console.log('[Health] Source probing disabled.');
        return () => {};
    }

    const run = () => {
        runProbes(client, player).catch((error) => console.error('[Health] Probe run failed:', error));
    };

    // Delayed rather than immediate: extractors have just activated, and a cold
    // Innertube cache would make the first probe look slower than it is.
    //
    // Both are unref'd so they never hold the process open on their own. The
    // gateway connection keeps the loop alive while the bot is running, so they
    // still fire - but without this, shutdown could not drain and the 5s
    // force-exit backstop fired on every stop.
    const initial = setTimeout(run, 60_000);
    initial.unref();
    const timer = setInterval(run, config.PROBE_INTERVAL_MS);
    timer.unref();

    console.log(`[Health] Source probing every ${Math.round(config.PROBE_INTERVAL_MS / 60_000)} minutes.`);

    return () => {
        clearTimeout(initial);
        clearInterval(timer);
    };
}
