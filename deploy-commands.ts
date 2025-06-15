import { REST, Routes, APIUser } from 'discord.js';
import { config } from './src/config';
import commandsCollection from './src/commands'; 

console.log('Deploying slash commands using commandsCollection...');

const commandDataToDeploy = commandsCollection.map(command => command.data.toJSON());

const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commandDataToDeploy.length} application (/) commands.`);

    let data;
    // GUILD-SPECIFIC DEPLOYMENT
    if (config.GUILD_ID) {
      console.log(`Deploying commands to GUILD: ${config.GUILD_ID}`);
      data = await rest.put(
        Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), // Uses GUILD_ID
        { body: commandDataToDeploy },
      ) as Array<unknown>;
    } else {
      // global deployment
      console.log('GUILD_ID not found in .env. Deploying commands GLOBALLY. This can take up to an hour.');
      data = await rest.put(
        Routes.applicationCommands(config.CLIENT_ID), // No GUILD_ID, so global
        { body: commandDataToDeploy },
      ) as Array<unknown>;
    }

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    const currentUser = await rest.get(Routes.user()) as APIUser;
    console.log(`Commands deployed for bot: ${currentUser.username}#${currentUser.discriminator} (${currentUser.id})`);

  } catch (error) {
    console.error('Error deploying commands:', error);
  }
})();