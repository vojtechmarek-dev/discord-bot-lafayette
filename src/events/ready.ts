import { Events, Client } from 'discord.js';
import { BotEvent } from '../types';

export const readyEvent: BotEvent = { // This is our BotEvent structure
  name: Events.ClientReady,
  once: true,
  execute(client: Client) { // Client is now the first (and only in this case) arg passed from the loop
    if (!client.user || !client.application) {
        return;
    }
    console.log(`🎉 Ready! Logged in as ${client.user.tag}`);
    console.log(`🤖 ${client.user.username} is serving ${client.guilds.cache.size} guilds.`);
    client.user.setPresence({
      activities: [{ name: 'vaše skladby a kostky | /play /roll' }],
      status: 'online',
    });
  },
};