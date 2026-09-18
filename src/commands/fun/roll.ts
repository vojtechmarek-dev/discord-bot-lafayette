import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ColorResolvable } from 'discord.js';
import { DiceRoll, Parser } from '@dice-roller/rpg-dice-roller';
import { Command, ExtendedClient } from '../../types';
import { FudgeDice, PercentileDice, StandardDice } from '@dice-roller/rpg-dice-roller/types/dice';
import { RollResult } from '@dice-roller/rpg-dice-roller/types/results';
import { getHighlightCritsSetting, getUserRollEmbedColor } from '../../guildSettingsManager';
import { DEFAULT_EMBED_COLOR } from '../../utils/colorUtils';
import { getDisplayName } from '../../utils/interactionUtils';

type RolledDice = StandardDice | FudgeDice | PercentileDice;

/** Appended to a die that rolled its maximum. */
export const CRIT_SUCCESS_MARKER = '!';
/**
 * Appended to a die that rolled its minimum. Intentionally empty: the detection
 * is wired up and tested, but nothing is rendered for now. Set this to a glyph
 * (e.g. '×') to switch crit-failure marking on — no other change needed.
 *
 * Must stay plain text, not an emoji: these values sit inside a markdown code
 * span, where formatting does not render.
 */
export const CRIT_FAILURE_MARKER = '';

/**
 * Renders a single die result, appending a marker for a critical success (the
 * die's maximum) or a critical failure (its minimum).
 *
 * Compares against `dice.max` / `dice.min` rather than `dice.sides`, because
 * FudgeDice reports `sides` as the string 'F.2' (with min -1, max 1) — so a
 * `value == dice.sides` comparison silently never marks a fudge die.
 *
 * Maximum is tested first so a degenerate die (`1d1`, where min === max) reads
 * as a success.
 */
function formatRollResult(rolledResult: RollResult, dice: RolledDice, highlightCrits: boolean): string {
    const rendered = rolledResult.toString();

    if (!highlightCrits) {
        return rendered;
    }
    if (rolledResult.value === dice.max) {
        return `${rendered}${CRIT_SUCCESS_MARKER}`;
    }
    if (rolledResult.value === dice.min) {
        return `${rendered}${CRIT_FAILURE_MARKER}`;
    }
    return rendered;
}

/** Renders one dice group as `[a,b,c]`, marking crits. */
function formatDiceGroup(results: RollResult[], dice: RolledDice, highlightCrits: boolean): string {
    return `[${results.map(result => formatRollResult(result, dice, highlightCrits)).join(',')}]`;
}

// Helper function to format individual die rolls, marking critical successes/failures
export function formatIndividualRolls(rollInstance: DiceRoll, highlightCrits: boolean): string {

    const rolledDiceParts = rollInstance.rolls.filter(group => typeof group == 'object' && 'rolls' in group);
    const parsedDiceParts: RolledDice[] = Parser.parse(rollInstance.notation).filter(group => typeof group == 'object' && 'sides' in group);

    if (rolledDiceParts.length == parsedDiceParts.length) {

        let formattedString = '';

        rolledDiceParts.forEach((rollPart, index) => {
            const dice = parsedDiceParts[index];
            const rolledDiceValues = Array.from(rollPart.rolls.values()) as RollResult[];
            formattedString += formatDiceGroup(rolledDiceValues, dice, highlightCrits);
        });

        return `\`${formattedString}\``;
    } else {
        console.warn(`Warning: Mismatch between rolled parts (${rolledDiceParts.length}) and parsed notation parts (${parsedDiceParts.length}) for notation "${rollInstance.notation}"`);
        return rollInstance.output;
    }
}

/**
 * Renders an advantage/disadvantage roll: the kept d20 in code ticks, the
 * dropped one struck through, followed by any extra dice groups riding along in
 * the same notation (Bless `+1d4`, Bardic Inspiration `+1d6`, Guidance...).
 *
 * The keep-pair is always the FIRST dice group. A flat modifier such as `+5` is
 * not a dice group, so `2d20kh1+5` has one group while `2d20kh1+5+1d4` has two —
 * which is why this counts dice within the first group rather than counting
 * groups. Kept vs dropped is decided by `useInTotal`, not by rendered text or by
 * index: `kh1` drops index 0 while `kl1` drops index 1.
 */
export function formatAdvDisRolls(rollInstance: DiceRoll, highlightCrits: boolean): string {
    const rolledDiceParts = rollInstance.rolls.filter(group => typeof group == 'object' && 'rolls' in group);
    const parsedDiceParts: RolledDice[] = Parser.parse(rollInstance.notation).filter(group => typeof group == 'object' && 'sides' in group);

    const keepGroup = rolledDiceParts[0];
    const keepDice = parsedDiceParts[0];
    const keepResults = keepGroup ? (Array.from(keepGroup.rolls.values()) as RollResult[]) : [];
    const keptResult = keepResults.find(result => result.useInTotal);
    const droppedResult = keepResults.find(result => !result.useInTotal);

    if (!keepDice || keepResults.length !== 2 || !keptResult || !droppedResult) {
        console.warn(
            `Warning: expected a two-dice keep-group first for notation "${rollInstance.notation}", ` +
            `but got ${keepResults.length} dice in the first of ${rolledDiceParts.length} group(s). Falling back to raw output.`
        );
        return rollInstance.output;
    }

    const kept = formatRollResult(keptResult, keepDice, highlightCrits);
    let formatted = `\`${kept}\`, ~~${droppedResult.value}~~`;

    for (let index = 1; index < rolledDiceParts.length; index++) {
        const extraDice = parsedDiceParts[index];
        if (!extraDice) {
            continue;
        }
        const extraResults = Array.from(rolledDiceParts[index].rolls.values()) as RollResult[];
        formatted += ` \`${formatDiceGroup(extraResults, extraDice, highlightCrits)}\``;
    }

    return formatted;
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
    async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
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
                const individualRolledDiceFormatted = formatIndividualRolls(roll, interaction.guildId ? getHighlightCritsSetting(interaction.guildId) : false);
                resultString += `Požadavek: \`[${roll.notation}]\`\n`;
                rollsString += `${individualRolledDiceFormatted}\n`;
                totalsString += `**${roll.total}**\n`;
            }

            let embedColor: ColorResolvable = DEFAULT_EMBED_COLOR;

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
        const individualRolledDiceFormatted = formatAdvDisRolls(roll, interaction.guildId ? getHighlightCritsSetting(interaction.guildId) : false);
        let embedColor: ColorResolvable = DEFAULT_EMBED_COLOR;

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

    async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
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

    async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
        await executeAdvDisRoll(interaction, false);
    },
};