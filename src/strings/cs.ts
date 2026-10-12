/**
 * Shared user-facing strings, in Czech.
 *
 * Home for anything repeated across commands and for every guard rail, which is
 * where the English had survived longest - including the two most-seen lines in
 * the bot, the unknown-command and generic-error replies.
 *
 * Command-specific flavour text may stay inline next to the logic it belongs
 * to, but it follows the same rules. See docs/VOICE.md.
 */

export const strings = {
    common: {
        /** Used by every command that cannot work in a DM. */
        guildOnly: 'Tento příkaz lze použít pouze na serveru.',
        unknownCommand: (name: string) =>
            `❌ Tento příkaz neznám: \`/${name}\`. Můj slovník je rozsáhlý, nikoli však nekonečný.`,
        commandFailed: 'Při provádění příkazu došlo k chybě. Zaznamenal jsem ji. Vy zkuste znovu.',
    },

    voice: {
        notAMember: 'Nepodařilo se mi ověřit, že jste členem tohoto serveru. Existujete vůbec?',
        userNotInVoice: 'Musíte být v hlasovém kanálu. Hrát do prázdna umím, ale odmítám.',
        unsupportedChannel: 'Umím se připojit pouze do hlasového nebo stage kanálu.',
        playerUnavailable: 'Přehrávač není momentálně k dispozici. Zkuste to znovu za okamžik.',
    },

    settings: {
        needManageGuild:
            'Na změnu nastavení serveru potřebujete oprávnění „Spravovat server". Já pravidla nevymýšlím, pouze je vymáhám.',
        colorSet: (color: string) => `🎨 Barva vašich hodů nastavena na \`${color}\`.`,
        colorSetNamed: (name: string, color: string) =>
            `✅ Barva vašich hodů nastavena na **${name}** (\`${color}\`).`,
        colorUnparsed: (input: string) =>
            `🤔 "${input}" jako barvu nechápu. Vyberte z nabídky níže, nebo zadejte hex (např. #RRGGBB) či název barvy.`,
        colorPrompt: '🎨 Vyberte barvu pro své hody:',
        colorInvalidChoice: 'Neplatná volba. Zkuste to prosím znovu.',
        colorTimedOut: '🎨 Výběr barvy vypršel. Nic jsem nezměnil.',
    },

    echo: {
        notOwner: 'Oprávnění odepřeno. Nejste má matka. Ani můj kodér.',
        ownerUnset:
            'Bez jasné identifikace mého tvůrce nemohu tento příkaz provést. Zavádím dočasný režim `Syn bez otce`.',
        invalidChannelType: '⚠️ Nevhodný typ kanálu. Vyberte textový nebo oznamovací kanál.',
        noTargetChannel: '⚠️ Nepodařilo se určit cílový textový kanál.',
        sent: (channel: string) => `✅ Zpráva odeslána do ${channel}.`,
        failed: (reason: string) => `❌ Zprávu se nepodařilo odeslat: ${reason}`,
    },
} as const;
