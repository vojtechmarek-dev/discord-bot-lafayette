import type { Database } from './db';
import type { SearchableSource } from '../utils/helpers/queryRouter';

export interface GuildSettingsRow {
    guild_id: string;
    highlight_crits: number;
    music_search_source: string;
    music_volume: number;
    locale: string | null;
    updated_at: number;
}

export interface UserSettingsRow {
    guild_id: string;
    user_id: string;
    roll_embed_color: string | null;
    updated_at: number;
}

export function getGuildSettings(db: Database, guildId: string): GuildSettingsRow | undefined {
    return db.get<GuildSettingsRow>(
        'SELECT * FROM guild_settings WHERE guild_id = :guildId',
        { guildId },
    );
}

/**
 * Writes one guild column.
 *
 * UPSERT rather than read-then-write so the row is created on first use and the
 * whole thing stays a single statement - no window for a concurrent command to
 * interleave between the read and the write.
 */
function upsertGuildColumn(db: Database, guildId: string, column: string, value: string | number): void {
    // `column` is never user input: every caller passes a literal below.
    db.run(
        `INSERT INTO guild_settings (guild_id, ${column}, updated_at)
         VALUES (:guildId, :value, :now)
         ON CONFLICT (guild_id) DO UPDATE SET ${column} = :value, updated_at = :now`,
        { guildId, value, now: Date.now() },
    );
}

export function setHighlightCrits(db: Database, guildId: string, enabled: boolean): void {
    upsertGuildColumn(db, guildId, 'highlight_crits', enabled ? 1 : 0);
}

export function setMusicSearchSource(db: Database, guildId: string, source: SearchableSource): void {
    upsertGuildColumn(db, guildId, 'music_search_source', source);
}

export function setMusicVolume(db: Database, guildId: string, volume: number): void {
    upsertGuildColumn(db, guildId, 'music_volume', volume);
}

export function getUserSettings(db: Database, guildId: string, userId: string): UserSettingsRow | undefined {
    return db.get<UserSettingsRow>(
        'SELECT * FROM user_settings WHERE guild_id = :guildId AND user_id = :userId',
        { guildId, userId },
    );
}

export function setRollEmbedColor(db: Database, guildId: string, userId: string, color: string): void {
    db.run(
        `INSERT INTO user_settings (guild_id, user_id, roll_embed_color, updated_at)
         VALUES (:guildId, :userId, :color, :now)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET roll_embed_color = :color, updated_at = :now`,
        { guildId, userId, color, now: Date.now() },
    );
}
