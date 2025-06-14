import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { useQueue, useTimeline } from "discord-player";
import { Command, ExtendedClient } from "../../types";


export const resumeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Obnoví přehrávání pozastavené skladby"),
  async execute(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ) {
    if (!interaction.guild) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
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
        content: "Obnovit přehrávání? Exceletní nápad! Nicméně... jsem již o krok napřed. Jako vždy.",
        flags: ["Ephemeral"],
      });
      return;
    }

    await interaction.deferReply();

    timeline.resume();
    await interaction.editReply({ content: "Přehrávání obnoveno. Váš přehrávač znovu hraje... zatímco svět hoří." });
  },
};
