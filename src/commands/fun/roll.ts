import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { DiceRoll, Parser } from '@dice-roller/rpg-dice-roller';
import { Command, ExtendedClient } from '../../types';
import { FudgeDice, PercentileDice, StandardDice } from '@dice-roller/rpg-dice-roller/types/dice';
import { getDiceExplodeSetting } from '../../guildSettingsManager';

// Helper function to format individual die rolls with bolding for max values
function formatIndividualRolls(rollInstance: DiceRoll, explodeInfoEnabled: boolean): string {

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
                        return `${rolledResult.value}!`
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
        const diceNotationInput = interaction.options.getString('dice') || '1d6';


        try {
            const notationsToRoll = diceNotationInput
                .split(/[,;]/)
                .map(s => s.trim())
                .filter(s => s.length > 0);

            if (notationsToRoll.length > 5) { // Limit number of multiple rolls
                await interaction.reply({ content: 'Zadrž kovboji! Můžete požádat pouze o 5 sad házení! Vypadám snad, že těch kostek mám nekonečno?.', ephemeral: true });
                return;
            }


            let [resultString, rollsString, totalsString] = ['', '', ''];

            for (const diceNotation of notationsToRoll) {
                const roll = new DiceRoll(diceNotation);
                const individualRolledDiceFormatted = formatIndividualRolls(roll, interaction.guildId ? getDiceExplodeSetting(interaction.guildId) : false);
                resultString += `Požadavek: \`[${roll.notation}]\`\n`;
                rollsString += `${individualRolledDiceFormatted}\n`
                totalsString += `**${roll.total}**\n`
            }



            // feat: TODO Determine embed color based on guild member saved preference - 
            // let embedColor: `#${string}` | number = '#2bff31'; // Default Discord dark theme background

            const embed = new EmbedBuilder()
                //.setColor(embedColor)
                .setTitle(`${user.displayName} hodil`)
                .setDescription(resultString)
                .setFields(
                    { name: 'Hody', value: rollsString, inline: true },
                    { name: 'Výsledek', value: totalsString, inline: true }
                )
            //.setFooter({ text: `Rolled by ${user.tag}` });

            // For debugging the roll object structure:
            // console.log('DiceRoll Object:', JSON.stringify(roll, null, 2));

            await interaction.reply({ embeds: [embed] });

        } catch (error: any) {
            console.error(`Error during dice roll with input "${diceNotationInput}":`, error);
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
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    },
};