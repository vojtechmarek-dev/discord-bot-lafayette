import { ColorResolvable, Colors } from 'discord.js'; // Colors enum for predefined
import { DEFAULT_USER_ROLL_EMBED_COLOR } from '../guildSettingsManager';

/**
 * Attempts to parse a string into a ColorResolvable.
 * discord.js's EmbedBuilder can handle many formats directly.
 * This function primarily validates common hex formats or keywords.
 *
 * @param colorString The string to parse.
 * @returns A ColorResolvable if valid, otherwise null.
 */
export function parseColorString(colorString: string | null | undefined): ColorResolvable | null {
    if (!colorString) {
        return null;
    }
    const s = colorString.trim().toUpperCase();

    // Check for valid hex codes (3, 6, or 8 digits, with or without #)
    if (/^#?([0-9A-F]{3}|[0-9A-F]{6}|[0-9A-F]{8})$/i.test(s)) {
        return s.startsWith('#') ? s as ColorResolvable : `#${s}` as ColorResolvable;
    }

    // Check against discord.js Colors enum (case-insensitive)
    const upperColorString = s.toUpperCase();
    for (const key in Colors) {
        if (key.toUpperCase() === upperColorString) {
            return Colors[key as keyof typeof Colors] as ColorResolvable;
        }
    }
    
    // Allow any string that ColorResolvable might accept (e.g. 'Random') but it's less predictable.
    // For user input, stricter validation is often better.
    // If we want to be very strict, we'd only return for hex/Colors enum.
    // For now, let's assume if it's not a clear hex or Colors key, it's not directly parseable by us.
    // EmbedBuilder might still try to parse it.
    // Consider returning the string itself if you want to let EmbedBuilder try any string:
    // return s as ColorResolvable;

    return null; // Could not confidently parse as a known format
}

export const PREDEFINED_COLORS: { name: string; value: ColorResolvable }[] = [
    { name: 'Discord Blurple', value: Colors.Blurple }, // '#5865F2'
    { name: 'Classic Red', value: Colors.Red },       // '#ED4245'
    { name: 'Vibrant Green', value: Colors.Green },   // '#57F287'
    { name: 'Sunny Yellow', value: Colors.Yellow },   // '#FEE75C'
    { name: 'Cool Blue', value: Colors.Blue },       // '#3498DB'
    { name: 'Deep Purple', value: Colors.Purple },   // '#9B59B6'
    { name: 'Default (Reset)', value: DEFAULT_USER_ROLL_EMBED_COLOR } // Let user reset to default
];