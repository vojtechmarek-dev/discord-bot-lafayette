import { Collection } from "discord.js";
import { Command } from "../types";
import { pingCommand } from "./utility";
import { playCommand, queueCommand, skipCommand, stopCommand } from "./music";

// Create an array of all command objects
const allCommands: Command[] = [
    pingCommand,
    playCommand,
    skipCommand,
    stopCommand,
    queueCommand
];


// Create a collection and populate it
const commandsCollection = new Collection<string, Command>();
for (const command of allCommands) {
  commandsCollection.set(command.data.name, command);
  console.log(`[CMDS] Registered command manually: /${command.data.name}`);
}

export default commandsCollection;