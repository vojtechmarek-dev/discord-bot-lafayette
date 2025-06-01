import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { DiceRoll, Parser } from '@dice-roller/rpg-dice-roller';
import { Command, ExtendedClient } from '../../types';
import { FudgeDice, PercentileDice, StandardDice } from '@dice-roller/rpg-dice-roller/types/dice';

// Helper function to format individual die rolls with bolding for max values
function formatIndividualRolls(rollInstance: DiceRoll): string {

    const rolledDiceParts = rollInstance.rolls.filter(group => typeof group == 'object' && 'rolls' in group);
    const parsedDiceParts: (StandardDice | FudgeDice | PercentileDice )[] = Parser.parse(rollInstance.notation).filter(group => typeof group == 'object' && 'sides' in group);

    if (rolledDiceParts.length == parsedDiceParts.length) {

        let formattedString = '';

        rolledDiceParts.forEach((rollPart, index) => {
                const dice = parsedDiceParts[index] as StandardDice | FudgeDice | PercentileDice;
                const rolledDiceValues = Array.from(rollPart.rolls.values());
                const rolledValuesString = rolledDiceValues.map(rolledResult => {
                    // check if rolled highest possible value of the rolled die
                    if (rolledResult.value == dice.sides) {
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
        .setDescription('Rolls dice based on standard dice notation (e.g., 2d6, 1d20+5).')
        .addStringOption(option =>
            option.setName('dice')
                .setDescription('The dice notation to roll (e.g., 3d10, 2d6+3, 1d100). Default: 1d6')
                .setRequired(false)) as SlashCommandBuilder,
    async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
        const user = interaction.user;
        const diceNotationInput = interaction.options.getString('dice') || '1d6';

        // todo for future add split on ";" or "," " " to allow multiple rolls in one command

        try {
            const notationsToRoll = diceNotationInput
                .split(/[,;]/) // <--- MODIFIED LINE
                .map(s => s.trim())
                .filter(s => s.length > 0);

            if (notationsToRoll.length > 5) { // Limit number of multiple rolls
                await interaction.reply({ content: 'You can request a maximum of 5 rolls sets of dice at once.', ephemeral: true });
                return;
            }


            let [resultString, rollsString, totalsString] = ['', '', ''];

            for (const diceNotation of notationsToRoll) {
                const roll = new DiceRoll(diceNotation);
                const individualRolledDiceFormatted = formatIndividualRolls(roll);

                resultString += `Request: \`[${roll.notation}]\` Result: **${roll.total}**\n`;
                rollsString += `${individualRolledDiceFormatted}\n`
                totalsString += `**${roll.total}**\n`
            }



            // feat: TODO Determine embed color based on guild member saved preference - 
            // let embedColor: `#${string}` | number = '#2bff31'; // Default Discord dark theme background

            const embed = new EmbedBuilder()
                //.setColor(embedColor)
                .setTitle(`${user.displayName} Rolls`)
                .setDescription(resultString)
                .setFields(
                    { name: 'Rolls', value: rollsString, inline: true },
                    { name: 'Result', value: totalsString, inline: true }
                )
            //.setFooter({ text: `Rolled by ${user.tag}` });

            // For debugging the roll object structure:
            // console.log('DiceRoll Object:', JSON.stringify(roll, null, 2));

            await interaction.reply({ embeds: [embed] });

        } catch (error: any) {
            console.error(`Error during dice roll with input "${diceNotationInput}":`, error);
            let errorMessage = `Oops! I had trouble with "${diceNotationInput}".`;
            if (error.message) {
                if (error.message.toLowerCase().includes('invalid notation') ||
                    error.message.toLowerCase().includes('unexpected') ||
                    error.message.toLowerCase().includes('expected')) {
                    errorMessage = `"${diceNotationInput}" doesn't look like valid dice notation. Try "2d6", "1d20+5", etc.`;
                } else {
                    errorMessage = `Error rolling dice: ${error.message}`;
                }
            }
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    },
};