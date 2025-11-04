import { Collection } from "discord.js";
import { Command } from "../types";
import { echoCommand, pingCommand, settingsCommand } from "./utility";
import { pauseCommand, playCommand, playFileCommand, queueCommand, resumeCommand, skipCommand, stopCommand } from "./music";
import { rollCommand } from "./fun";
import { drawCommand } from "./fun/draw";
import { shuffleCommand } from "./fun/shuffe";

// Create an array of all command objects
const allCommands: Command[] = [
    pingCommand,
    playCommand,
    playFileCommand,
    skipCommand,
    stopCommand,
    queueCommand,
    resumeCommand,
    pauseCommand,
    rollCommand,
    echoCommand,
    drawCommand,
    shuffleCommand,
    settingsCommand
];


// Create a collection and populate it
const commandsCollection = new Collection<string, Command>();
for (const command of allCommands) {
  commandsCollection.set(command.data.name, command);
  console.log(`[CMDS] Registered command manually: /${command.data.name}`);
}

export default commandsCollection;