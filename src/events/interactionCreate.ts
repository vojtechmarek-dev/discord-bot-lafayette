import { Events, Interaction, Client, AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { BotEvent } from '../types';

export const interactionCreateEvent: BotEvent = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction, client: Client) {
    // Client is now the second arg passed from the loop
    if (interaction.isChatInputCommand()) {
      return handleCommand(interaction, client);
    }

    if (interaction.isAutocomplete()) {
      return handleAutocomplete(interaction, client);
    }

    // Buttons, selects and modals are deliberately not routed here yet. The one
    // component collector in /settings handles its own, and adding a global
    // router without one would silently acknowledge its interactions.
  },
};

async function handleCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    await interaction.reply({
      content: `❌ Tento příkaz neznám: \`/${interaction.commandName}\`. Můj slovník je rozsáhlý, nikoli však nekonečný.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction, client); // Pass client to command's execute
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    const errorMessage = 'Při provádění příkazu došlo k chybě. Zaznamenal jsem ji. Ty to zkus znovu.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

/**
 * Autocomplete has a hard 3-second budget and cannot be deferred, so a failure
 * must still answer - with an empty list - or the user is left staring at a
 * spinner that never resolves.
 */
async function handleAutocomplete(interaction: AutocompleteInteraction, client: Client): Promise<void> {
  const command = client.commands.get(interaction.commandName);

  if (!command?.autocomplete) {
    await interaction.respond([]).catch(() => {});
    return;
  }

  try {
    await command.autocomplete(interaction, client);
  } catch (error) {
    console.error(`Error in autocomplete for ${interaction.commandName}:`, error);
    if (!interaction.responded) {
      await interaction.respond([]).catch(() => {});
    }
  }
}
