import { Events, Interaction, Client } from 'discord.js';

export const interactionCreateEvent = { // This is our BotEvent structure
  name: Events.InteractionCreate,
  async execute(interaction: Interaction, client: Client) { // Client is now the second arg passed from the loop
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      await interaction.reply({ content: `❌ Oops! I don't know the command \`/${interaction.commandName}\`.`, ephemeral: true });
      return;
    }

    try {
      await command.execute(interaction, client); // Pass client to command's execute
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      const errorMessage = 'There was an error while executing this command! Please try again later.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
};