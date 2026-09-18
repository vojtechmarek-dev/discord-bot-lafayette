import { Interaction } from "discord.js";

/**
 * Resolves the best available display name for whoever triggered an interaction.
 *
 * `interaction.member` is null in DMs, and in guilds it may arrive as a raw
 * `APIInteractionGuildMember` (which has no `displayName`) rather than a
 * `GuildMember`. Both cases fall through to the user-level names instead of
 * throwing, so commands stay usable outside a guild.
 */
export function getDisplayName(interaction: Interaction): string {
    const user = interaction.user;
    const member = interaction.member;
    const memberDisplayName = member && 'displayName' in member ? member.displayName : null;
    return memberDisplayName || user.displayName || user.username;
}