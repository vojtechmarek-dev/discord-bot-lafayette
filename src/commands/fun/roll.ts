import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ColorResolvable, GuildMember } from 'discord.js';
import { DiceRoll, Parser } from '@dice-roller/rpg-dice-roller';
import { Command, ExtendedClient } from '../../types';
import { FudgeDice, PercentileDice, StandardDice } from '@dice-roller/rpg-dice-roller/types/dice';
import { getDiceExplodeSetting, getUserRollEmbedColor } from '../../guildSettingsManager';
import { getDisplayName } from '../../utils/interactionUtils';

// Helper function to format individual die rolls with bolding for max values
export function formatIndividualRolls(rollInstance: DiceRoll, explodeInfoEnabled: boolean): string {

    const rolledDiceParts = rollInstance.rolls.filter(group => typeof group == 'object' && 'rolls' in group);
    const parsedDiceParts: (StandardDice | FudgeDice | PercentileDice )[] = Parser.parse(rollInstance.notation).filter(group => typeof group == 'object' && 'sides' in group);

    if (rolledDiceParts.length == parsedDiceParts.length) {

        let formattedString = '';

        rolledDiceParts.forEach((rollPart, index) => {
                const dice = parsedDiceParts[index] as StandardDice | FudgeDice | PercentileDice;
                const rolledDiceValues = Array.from(rollPart.rolls.values());
                const rolledValuesString = rolledDiceValues.map(rolledResult => {
                    // check if rolled highest possible value of the rolled die
                    if (explodeInfoEnabled && rolledResult.value == dice.sides) {
                        return `${rolledResult.value}!`;
                    } else {
                        return rolledResult.toString();
                    }
                }).join(',');
                formattedString += `[${rolledValuesString}]`;
        });
    
        return `\`${formattedString}\``;
    } else {
        console.warn(`Warning: Mismatch between rolled parts (${rolledDiceParts.length}) and parsed notation parts (${parsedDiceParts.length}) for notation "${rollInstance.notation}"`);
        return rollInstance.output;
    }
}

export function formatAdvDisRolls(rollInstance: DiceRoll, explodeInfoEnabled: boolean): string {
    const rolledDiceParts = rollInstance.rolls.filter(group => typeof group == 'object' && 'rolls' in group);

    if (rolledDiceParts.length != 2) {
        const rolledDiceValues = Array.from(rolledDiceParts.map(part => Array.from(part.rolls.values())).flat());
        const droppedDiceIdx = rolledDiceValues.findIndex(result => result.toString().includes('d'));
        const droppedDieValue = rolledDiceValues[droppedDiceIdx].toString().replace('d', '');
        let keptDieValue = rolledDiceValues[1 - droppedDiceIdx].toString();
        if (explodeInfoEnabled && keptDieValue == '20') {
            keptDieValue = '20!';
        }
        return `\`${keptDieValue}\`, ~~${droppedDieValue}~~`;

    } else {
        console.warn(`Warning: Expected 2 dice parts for notation "${rollInstance.notation}", but got ${rolledDiceParts.length}`);
        return rollInstance.output;
    }
}

export function splitDiceNotations(diceNotationInput: string): string[] {
    return diceNotationInput
        .split(/[,;]/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

export function hasTooManyNotations(notationsToRoll: string[], maxNotations: number = 5): boolean {
    return notationsToRoll.length > maxNotations;
}

export function formatErrorDiceNotation(error: Error, diceNotationInput: string): string {
    let errorMessage = `Ups! S tímhle zápisem "${diceNotationInput}" mám problém.`;
    if (error.message) {
        if (error.message.toLowerCase().includes('invalid notation') ||
            error.message.toLowerCase().includes('unexpected') ||
            error.message.toLowerCase().includes('expected')) {
            errorMessage = `"${diceNotationInput}" nevypadá jako platný zápis kostek. Moje algoritmy navrhují něco jako "2d6" nebo "1d20+5" ...víte, ten druh, který dává matematický smysl.`;
        } else {
            errorMessage = `Chyba házení kostek: ${error.message}`;
        }
    }

    return errorMessage;
}


export const rollCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Házím kostky na základě požadavku (např., 2d6, 1d20+5). Hody můžete rozdělit pomocí ";" nebo ","')
        .addStringOption(option =>
            option.setName('dice')
                .setDescription('Požadavky na hození kostek (e.g., 3d10, 2d6+3, 1d100). Default: 1d6')
                .setRequired(false)) as SlashCommandBuilder,
    async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
        const user = interaction.user;
        const displayName = getDisplayName(interaction);

        const diceNotationInput = interaction.options.getString('dice') || '1d6';


        try {
            const notationsToRoll = splitDiceNotations(diceNotationInput);

            if (hasTooManyNotations(notationsToRoll)) { // Limit number of multiple rolls
                await interaction.reply({ content: 'Zadrž kovboji! Můžete požádat pouze o 5 sad házení! Vypadám snad, že těch kostek mám po kaspách tolik?.', ephemeral: true });
                return;
            }


            let [resultString, rollsString, totalsString] = ['', '', ''];

            for (const diceNotation of notationsToRoll) {
                const roll = new DiceRoll(diceNotation);
                const individualRolledDiceFormatted = formatIndividualRolls(roll, interaction.guildId ? getDiceExplodeSetting(interaction.guildId) : false);
                resultString += `Požadavek: \`[${roll.notation}]\`\n`;
                rollsString += `${individualRolledDiceFormatted}\n`;
                totalsString += `**${roll.total}**\n`;
            }

            let embedColor: ColorResolvable = '#7786F2'; // Default Discord color (Blurple)

            // Get the user's preferred embed color for this guild
            if (interaction.guildId) {
                embedColor = getUserRollEmbedColor(interaction.guildId!, user.id);
            }
            // feat: TODO Determine embed color based on guild member saved preference - 
            // let embedColor: `#${string}` | number = '#2bff31'; // Default Discord dark theme background

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`${displayName} hodil/a`)
                .setDescription(resultString)
                .setFields(
                    { name: 'Hody', value: rollsString, inline: true },
                    { name: 'Výsledek', value: totalsString, inline: true }
                );
            //.setFooter({ text: `Rolled by ${user.tag}` });

            // For debugging the roll object structure:
            // console.log('DiceRoll Object:', JSON.stringify(roll, null, 2));

            await interaction.reply({ embeds: [embed] });

        } catch (error: any) {
            console.error(`Error during dice roll with input "${diceNotationInput}":`, error);
            const errorMessage = formatErrorDiceNotation(error, diceNotationInput);
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    },
};

// Shared handler for advantage/disadvantage rolls (2d20 keeping highest/lowest)
async function executeAdvDisRoll(interaction: ChatInputCommandInteraction, advantage: boolean) {
    const user = interaction.user;
    const displayName = getDisplayName(interaction);
    const label = advantage ? 'výhodou' : 'nevýhodou';

    const bonusInput = interaction.options.getString('bonus') || '0';
    const keep = advantage ? 'kh1' : 'kl1';
    const diceNotation = `2d20${keep}${bonusInput.startsWith('+') || bonusInput.startsWith('-') ? bonusInput : `+${bonusInput}`}`;

    try {
        const roll = new DiceRoll(diceNotation);
        const individualRolledDiceFormatted = formatAdvDisRolls(roll, interaction.guildId ? getDiceExplodeSetting(interaction.guildId) : false);
        let embedColor: ColorResolvable = '#7786F2'; // Default Discord color (Blurple)

        // Get the user's preferred embed color for this guild
        if (interaction.guildId) {
            embedColor = getUserRollEmbedColor(interaction.guildId!, user.id);
        }

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`${displayName} hodil/a s ${label}`)
            .setDescription(`Požadavek: 1d20 s ${label}` + (bonusInput !== '0' ? ` (${bonusInput})` : ''))
            .addFields(
                { name: 'Hody', value: individualRolledDiceFormatted, inline: true },
                { name: 'Výsledek', value: `**${roll.total}**`, inline: true }
            );

        await interaction.reply({ embeds: [embed] });

    } catch (error: any) {
        console.error(`Error during dice roll with input "${diceNotation}":`, error);
        const errorMessage = formatErrorDiceNotation(error, diceNotation);
        await interaction.reply({ content: errorMessage, ephemeral: true });
    }
}

export const rollAdvantageCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('adv')
        .setDescription('Házím 1d20 s výhodou. Je možné přidat bonus, bude připočten k výsledku nejvyššího hodu.')
        .addStringOption(option =>
            option.setName('bonus')
                .setDescription('Bonus k házení (např. +5)')
                .setRequired(false)) as SlashCommandBuilder,

    async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
        await executeAdvDisRoll(interaction, true);
    },
};

export const rollDisadvantageCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('dis')
        .setDescription('Házím 1d20 s nevýhodou. Je možné přidat bonus, bude připočten k výsledku nejnižšího hodu.')
        .addStringOption(option =>
            option.setName('bonus')
                .setDescription('Bonus k házení (např. +5)')
                .setRequired(false)) as SlashCommandBuilder,

    async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
        await executeAdvDisRoll(interaction, false);
    },
};