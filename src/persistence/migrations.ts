import type { Database } from './db';

/**
 * Schema versioning on SQLite's own `PRAGMA user_version`.
 *
 * Using the built-in counter rather than a bespoke table means the version bump
 * is committed in the same transaction as the DDL it describes, so a crash
 * mid-migration cannot leave the schema and the recorded version disagreeing.
 */
export interface Migration {
    readonly version: number;
    readonly name: string;
    up(db: Database): void;
}

export const MIGRATIONS: readonly Migration[] = [
    {
        version: 1,
        name: 'initial schema',
        up(db) {
            // STRICT everywhere: without it SQLite accepts any type in any
            // column, which is how `rollEmbedColor` ended up holding both a
            // number and a '#RRGGBB' string in the JSON store.
            db.exec(`
                CREATE TABLE guild_settings (
                    guild_id            TEXT    PRIMARY KEY,
                    highlight_crits     INTEGER NOT NULL DEFAULT 1,
                    music_search_source TEXT    NOT NULL DEFAULT 'soundcloud',
                    music_volume        INTEGER NOT NULL DEFAULT 50,
                    locale              TEXT,
                    updated_at          INTEGER NOT NULL
                ) STRICT;

                CREATE TABLE user_settings (
                    guild_id         TEXT NOT NULL,
                    user_id          TEXT NOT NULL,
                    roll_embed_color TEXT,
                    updated_at       INTEGER NOT NULL,
                    PRIMARY KEY (guild_id, user_id)
                ) STRICT;

                CREATE TABLE card_decks (
                    guild_id        TEXT NOT NULL,
                    deck_type       TEXT NOT NULL,
                    remaining_cards TEXT NOT NULL,
                    drawn_cards     TEXT NOT NULL,
                    shuffled_by     TEXT,
                    last_activity   INTEGER NOT NULL,
                    PRIMARY KEY (guild_id, deck_type)
                ) STRICT;

                CREATE INDEX idx_card_decks_last_activity ON card_decks (last_activity);
            `);
        },
    },
];

export function currentVersion(db: Database): number {
    const row = db.get<{ user_version: number }>('PRAGMA user_version');
    return row?.user_version ?? 0;
}

/**
 * Applies every migration newer than the recorded version, in order.
 * Returns the version the database ended up at.
 */
export function runMigrations(db: Database, migrations: readonly Migration[] = MIGRATIONS): number {
    const startingVersion = currentVersion(db);
    const pending = migrations
        .filter((migration) => migration.version > startingVersion)
        .sort((a, b) => a.version - b.version);

    if (pending.length === 0) {
        return startingVersion;
    }

    for (const migration of pending) {
        db.transaction(() => {
            migration.up(db);
            // PRAGMA will not take a bound parameter, and `version` is a number
            // from our own literal list rather than anything user-supplied.
            db.exec(`PRAGMA user_version = ${migration.version}`);
        });
        console.log(`[DB] Applied migration ${migration.version}: ${migration.name}`);
    }

    return currentVersion(db);
}
