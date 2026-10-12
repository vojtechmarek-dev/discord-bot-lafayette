import { ChatInputCommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import { useTimeline } from "discord-player";
import { Command, ExtendedClient } from "../../types";
import { strings } from '../../strings/cs';


export const resumeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Obnoví přehrávání pozastavené skladby"),
  async execute(
    interaction: ChatInputCommandInteraction,
    _client: ExtendedClient
  ) {
    if (!interaction.guild) {
        await interaction.reply({ content: strings.common.guildOnly, flags: MessageFlags.Ephemeral });
        return;
    }

    const timeline = useTimeline({
        node: interaction.guild,
    });

    if (!timeline) {
      await interaction.reply({
        content:
        "Nemohu obnovit přehrávání z **ničeho**. Nejsem metafyzik, jen dobře oblečený kus kovu.",
        flags: ["Ephemeral"],
      });
      return;
    }

    if (!timeline.paused) {
        await interaction.reply({
        content: "Obnovit přehrávání? Excelentní nápad! Nicméně... jsem již o krok napřed. Jako vždy.",
        flags: ["Ephemeral"],
      });
      return;
    }

    await interaction.deferReply();

    timeline.resume();
    await interaction.editReply({ content: "Přehrávání obnoveno. Tvůj přehrávač znovu hraje... zatímco svět hoří." });
  },
};
