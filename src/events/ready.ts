import { Events, Client } from 'discord.js';
import { cleanupExpiredDecks } from '../guildStateManager';
import { BotEvent } from '../types';

export const readyEvent: BotEvent = {
  name: Events.ClientReady,
  once: true,
  execute(client: Client) {
    if (!client.user || !client.application) {
        return;
    }
    console.log(`🎉 Ready! Logged in as ${client.user.tag}`);
    console.log(`🤖 ${client.user.username} is serving ${client.guilds.cache.size} guilds.`);
    client.user.setPresence({
      activities: [{ name: 'vaše skladby a kostky | /play /roll' }],
      status: 'online',
    });

    // Run deck cleanup immediately on ready, then schedule periodic cleanup every 6 hours
    cleanupExpiredDecks().catch((err) => console.error('[DeckCleanup] Initial run failed:', err));
    const sixHoursMs = 6 * 60 * 60 * 1000;
    setInterval(() => {
      cleanupExpiredDecks().catch((err) => console.error('[DeckCleanup] Scheduled run failed:', err));
    }, sixHoursMs);
  },
};