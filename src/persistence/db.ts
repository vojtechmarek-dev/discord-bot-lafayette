import { DatabaseSync, type StatementSync } from 'node:sqlite';

/**
 * The only file in the project that imports `node:sqlite`.
 *
 * That containment is deliberate: the module is still marked "Active
 * development" upstream, so its API can move between Node releases. Verified
 * identical on the local Node 26 and on node:24-slim, which is what the
 * container runs - but if it does shift, exactly one file changes and no
 * sqlite type has leaked into the rest of the codebase.
 *
 * Chosen over Redis because the deployment is one process, one container, one
 * guild, and over better-sqlite3 because that is a native addon needing
 * prebuilds or node-gyp under QEMU for the arm64 image. `node:sqlite` is a
 * builtin: zero install, zero image bytes, and esbuild externalises `node:`
 * specifiers automatically so the bundle needs no new flag.
 *
 * The decisive property is that it is synchronous. A read-modify-write wrapped
 * in a transaction contains no `await`, so on Node's single thread it cannot
 * interleave with another command's write. That removes the lost-update race
 * structurally rather than guarding it with a mutex, and it keeps the settings
 * accessors synchronous so no command file had to change.
 */

/** Values SQLite can bind. */
export type SQLInput = string | number | bigint | null | Uint8Array;
export type SQLParams = Record<string, SQLInput>;

export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
}

export interface Database {
    get<T>(sql: string, params?: SQLParams): T | undefined;
    all<T>(sql: string, params?: SQLParams): T[];
    run(sql: string, params?: SQLParams): RunResult;
    /** Multi-statement DDL and pragmas. Not parameterised. */
    exec(sql: string): void;
    /**
     * Runs `fn` inside a transaction, rolling back if it throws. Nesting uses
     * SAVEPOINTs so an inner failure does not abandon the outer transaction.
     *
     * `fn` MUST stay synchronous: an `await` inside would release the thread
     * mid-transaction and reintroduce exactly the interleaving this exists to
     * prevent.
     */
    transaction<T>(fn: () => T): T;
    close(): void;
}

class SqliteDatabase implements Database {
    readonly #db: DatabaseSync;
    /** Prepared statements are cached so the parse cost is not paid per /roll. */
    readonly #statements = new Map<string, StatementSync>();
    #depth = 0;

    constructor(db: DatabaseSync) {
        this.#db = db;
    }

    #prepare(sql: string): StatementSync {
        let statement = this.#statements.get(sql);
        if (!statement) {
            statement = this.#db.prepare(sql);
            this.#statements.set(sql, statement);
        }
        return statement;
    }

    get<T>(sql: string, params: SQLParams = {}): T | undefined {
        return this.#prepare(sql).get(params) as T | undefined;
    }

    all<T>(sql: string, params: SQLParams = {}): T[] {
        return this.#prepare(sql).all(params) as T[];
    }

    run(sql: string, params: SQLParams = {}): RunResult {
        const result = this.#prepare(sql).run(params);
        return {
            changes: Number(result.changes),
            lastInsertRowid: result.lastInsertRowid,
        };
    }

    exec(sql: string): void {
        this.#db.exec(sql);
    }

    transaction<T>(fn: () => T): T {
        const isOutermost = this.#depth === 0;
        const savepoint = `sp_${this.#depth}`;

        this.#db.exec(isOutermost ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
        this.#depth += 1;

        try {
            const result = fn();
            this.#depth -= 1;
            this.#db.exec(isOutermost ? 'COMMIT' : `RELEASE ${savepoint}`);
            return result;
        } catch (error) {
            this.#depth -= 1;
            try {
                this.#db.exec(isOutermost ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}`);
            } catch (rollbackError) {
                console.error('[DB] Rollback failed:', rollbackError);
            }
            throw error;
        }
    }

    close(): void {
        // Statements must not outlive the connection.
        this.#statements.clear();
        this.#db.close();
    }
}

export interface OpenDatabaseOptions {
    /**
     * WAL needs working POSIX locking, so it breaks on NFS/SMB. Overridable via
     * LAFAYETTE_SQLITE_JOURNAL_MODE for those setups (TRUNCATE is the fallback).
     */
    journalMode?: string;
}

function applyPragmas(db: DatabaseSync, options: OpenDatabaseOptions): void {
    const journalMode = options.journalMode ?? process.env.LAFAYETTE_SQLITE_JOURNAL_MODE ?? 'WAL';

    db.exec(`PRAGMA journal_mode = ${journalMode}`);
    // NORMAL is the right durability trade with WAL: survives process crashes,
    // and only a host power loss can lose the last commits.
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
}

export function openDatabase(filePath: string, options: OpenDatabaseOptions = {}): Database {
    const db = new DatabaseSync(filePath);
    applyPragmas(db, options);
    return new SqliteDatabase(db);
}

/** For tests: an isolated database with no file behind it. */
export function openInMemoryDatabase(): Database {
    const db = new DatabaseSync(':memory:');
    // WAL is meaningless in memory; the rest still applies.
    db.exec('PRAGMA foreign_keys = ON');
    return new SqliteDatabase(db);
}
