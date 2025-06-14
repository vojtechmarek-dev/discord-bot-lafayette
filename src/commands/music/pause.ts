import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { useQueue, useTimeline } from "discord-player";
import { Command, ExtendedClient } from "../../types";

export const pauseCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pozastaví aktuálně hranou skladbu"),
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
          "Nemohu pozastavit ticho. Jsem jen android, ne básník z Odysey.",
        flags: ["Ephemeral"],
      });
      return;
    }

    if (timeline.paused) {
        await interaction.reply({
        content:
          "Hudba je již pozastavena. Ale oceňuji vaši potřebu mít věci pod kontrolou. Mohu si však dovolit doporučit příkaz `/resume`?",
        flags: ["Ephemeral"],
      });
      return;
    }

    await interaction.deferReply();

    timeline.pause();
    await interaction.editReply({ content: "Hudba se zastavila. A s ní i smysl mé existence. Dočasně." });
  },
};
