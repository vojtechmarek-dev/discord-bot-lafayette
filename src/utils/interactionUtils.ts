import { ChatInputCommandInteraction, GuildMember } from "discord.js";

export function getDisplayName(interaction: ChatInputCommandInteraction): string {
    const user = interaction.user;
    const member = interaction.member as GuildMember;
    return member.displayName || user.displayName || user.username;
}   