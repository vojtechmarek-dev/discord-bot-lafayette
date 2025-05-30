import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { DiceRoll } from '@dice-roller/rpg-dice-roller';
import { Command, ExtendedClient } from '../../types';

// Helper function to format individual die rolls with bolding for max values
function formatIndividualRolls(rollInstance: DiceRoll): string {
    let formattedString = "N/A";

    // Try to get the detailed rolls part, e.g., (6, 2, 10) from "1d6 + 1d20 (6, 2, 10) = 18"
    // The most reliable way is often to look at the structure of roll.rolls
    // Each part of the notation (e.g., "2d6", "1d10") becomes an object in roll.rolls
    // These objects (usually of type Dice from dice-roller-core) have their own .rolls array of results.

    const allRollParts: string[] = [];

    if (rollInstance.rolls && Array.isArray(rollInstance.rolls)) {
        rollInstance.rolls.forEach(group => {
            // 'group' can be a number (modifier) or an object representing a set of dice rolled
            if (typeof group === 'object' && group !== null && 'rolls' in group && 'sides' in group && Array.isArray(group.rolls)) {
                // This is likely a Dice object (from dice-roller-core which rpg-dice-roller uses)
                const diceGroup = group as any; // Cast for easier access to properties
                const individualDieValues: string[] = [];
                diceGroup.rolls.forEach((die: any) => { // die is likely a RollResult object or number
                    const value = typeof die === 'number' ? die : die.value;
                    if (value === diceGroup.sides) { // Check if it's a max roll for this die type
                        individualDieValues.push(`**${value}**`);
                    } else {
                        individualDieValues.push(value.toString());
                    }
                });
                if (individualDieValues.length > 0) {
                    // Add notation for this group if desired, e.g., "d6: (1, **6**)"
                    // For now, just concatenate all die values.
                    // To get something like "(1, **6**, 3, 2)" we collect all.
                    allRollParts.push(...individualDieValues);
                }
            } else if (typeof group === 'number') {
                // This is a modifier, we don't typically include it in the "Roll: (...)" part
                // unless the full output string is parsed.
                // For simplicity, we're focusing on actual die faces.
            }
        });
    }

    if (allRollParts.length > 0) {
        formattedString = `(${allRollParts.join(', ')})`;
    } else if (rollInstance.rolls.length === 1 && typeof rollInstance.rolls[0] === 'number') {
        // Handle case of a single constant number as the "roll" (e.g., input "5")
        // The "Roll: (...)" part doesn't really apply to constants.
        // formattedString = `(${rollInstance.rolls[0]})`; // Or keep as N/A
    } else if (rollInstance.total !== undefined && rollInstance.rolls.length === 0) {
        // Another case for constants where .rolls might be empty
        // formattedString = `(${rollInstance.total})`; // Or keep as N/A
    }


    // Fallback if the above structure doesn't yield results easily (e.g. very complex notation)
    // try parsing the default output string.
    if (formattedString === "N/A" && rollInstance.output) {
        const outputMatch = rollInstance.output.match(/\(([^)]+)\)/);
        if (outputMatch && outputMatch[1]) {
            // This part won't have bolding yet if we use this fallback.
            // To add bolding here, we'd need to know the die sides for each number in outputMatch[1]
            // which is harder from just the string.
            // For now, this fallback provides the unbolded numbers.
            formattedString = `(${outputMatch[1]})`;
        }
    }


    return formattedString;
}


export const command: Command = {
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

    try {
      const roll = new DiceRoll(diceNotationInput);
      const individualRollsFormatted = formatIndividualRolls(roll);

      const resultString = `${user.username} Rolls: [${roll.notation}] Roll: ${individualRollsFormatted} Result: ${roll.total}`;

      // Determine embed color based on d20 criticals if applicable
      let embedColor: `#${string}` | number = '#2b2d31'; // Default Discord dark theme background
      let isD20Roll = false;
      let d20Value: number | undefined;

      // Check if it's a simple d20 roll (e.g., "1d20", "d20", "1d20+5")
      // This check is a heuristic and might need refinement for complex d20 rolls.
      if (roll.notation.toLowerCase().includes('d20')) {
        // If it's a single d20 (no other dice types involved in the primary roll part)
        // `roll.rolls` will likely contain one primary Dice object for the d20.
        if (roll.rolls && roll.rolls.length > 0) {
            const firstDiceGroup = roll.rolls[0];
            if (typeof firstDiceGroup === 'object' && firstDiceGroup !== null && 'sides' in firstDiceGroup && firstDiceGroup.sides === 20) {
                if ('rolls' in firstDiceGroup && Array.isArray(firstDiceGroup.rolls) && firstDiceGroup.rolls.length === 1) {
                    const d20Die = firstDiceGroup.rolls[0];
                    d20Value = (typeof d20Die === 'number') ? d20Die : d20Die.value;
                    isD20Roll = true;
                }
            }
        }
      }

      if (isD20Roll && d20Value === 1) {
        embedColor = 0xFF0000; // Red for Nat 1
      } else if (isD20Roll && d20Value === 20) {
        embedColor = 0x00FF00; // Green for Nat 20
      }


      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle('🎲 Dice Roll!')
        .setDescription(resultString)
        .setFooter({ text: `Rolled by ${user.tag}` })
        .setTimestamp();

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
      await interaction.reply({ content: errorMessage, flags: ['Ephemeral'] });
    }
  },
};