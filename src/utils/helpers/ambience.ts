import fs from 'node:fs';
import path from 'node:path';
import { resolveDataDir } from '../../persistence';

/**
 * Ambience beds are local files, discovered at runtime from
 * `<dataDir>/ambience/`.
 *
 * Deliberately not baked into the image: the data dir is already the
 * bind-mounted volume, so the DM can drop in their own loops without a rebuild,
 * and the image stays small.
 *
 * This is also the most reliable audio path the bot has. It touches no
 * extractor network call, mints no PO token and cannot be 403'd - so ambience
 * keeps working during exactly the YouTube outages that have bitten this
 * project before.
 */

/** What AttachmentExtractor will accept: audio/*, video/*, ogg, raw pcm/opus. */
const SUPPORTED_EXTENSIONS = new Set(['.opus', '.ogg', '.mp3', '.wav', '.flac', '.m4a', '.webm']);

export interface AmbiencePreset {
    /** Lowercased file stem, used as the command value. */
    slug: string;
    /** Human-facing name derived from the file name. */
    label: string;
    absolutePath: string;
}

export function ambienceDir(dataDir: string = resolveDataDir()): string {
    return path.join(dataDir, 'ambience');
}

/** "tavern-night.opus" -> "Tavern Night" */
export function labelFromFileName(fileName: string): string {
    const stem = path.basename(fileName, path.extname(fileName));
    return stem
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\p{L}/gu, (character) => character.toUpperCase());
}

export function slugFromFileName(fileName: string): string {
    return path.basename(fileName, path.extname(fileName)).toLowerCase();
}

/**
 * Lists the presets currently on disk, sorted by label.
 *
 * Reads the directory on every call rather than caching: a DM who drops a new
 * file in should not have to restart the bot, and the directory holds a handful
 * of entries.
 */
export function listAmbiencePresets(dataDir: string = resolveDataDir()): AmbiencePreset[] {
    const directory = ambienceDir(dataDir);

    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error: any) {
        if (error?.code !== 'ENOENT') {
            console.warn(`[Ambience] Could not read ${directory}:`, error);
        }
        return [];
    }

    const presets: AmbiencePreset[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        if (!SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            continue;
        }

        const slug = slugFromFileName(entry.name);
        if (seen.has(slug)) {
            // e.g. rain.mp3 alongside rain.opus - first by sort order wins.
            console.warn(`[Ambience] Duplicate preset slug "${slug}"; ignoring ${entry.name}.`);
            continue;
        }
        seen.add(slug);

        presets.push({
            slug,
            label: labelFromFileName(entry.name),
            absolutePath: path.join(directory, entry.name),
        });
    }

    return presets.sort((a, b) => a.label.localeCompare(b.label));
}

/** Exact slug match first, then a unique case-insensitive prefix match. */
export function findAmbiencePreset(query: string, presets: AmbiencePreset[]): AmbiencePreset | null {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return null;
    }

    const exact = presets.find((preset) => preset.slug === needle);
    if (exact) {
        return exact;
    }

    const matches = presets.filter(
        (preset) => preset.slug.startsWith(needle) || preset.label.toLowerCase().startsWith(needle),
    );
    return matches.length === 1 ? matches[0] : null;
}

/** Discord allows at most 25 autocomplete choices. */
export function suggestAmbiencePresets(query: string, presets: AmbiencePreset[]): AmbiencePreset[] {
    const needle = query.trim().toLowerCase();
    const matching = needle
        ? presets.filter(
            (preset) => preset.slug.includes(needle) || preset.label.toLowerCase().includes(needle),
        )
        : presets;

    return matching.slice(0, 25);
}
