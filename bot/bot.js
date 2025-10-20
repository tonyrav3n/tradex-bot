import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { Client, GatewayIntentBits, Collection, Events } from "discord.js";

dotenv.config();

const TOKEN = process.env.TOKEN || "";
const GUILD_ID = process.env.GUILD_ID || "";

if (!TOKEN) {
  console.error("Missing TOKEN in environment. Add TOKEN to your .env");
  process.exit(1);
}
if (!GUILD_ID) {
  console.error("Missing GUILD_ID in environment. Add GUILD_ID to your .env");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load all commands from /commands
const commandsPath = path.join(process.cwd(), "bot/commands");
for (const file of fs.readdirSync(commandsPath)) {
  if (!file.endsWith(".js")) continue;
  const command = await import(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// Load all events from /events
const eventsPath = path.join(process.cwd(), "bot/events");
for (const file of fs.readdirSync(eventsPath)) {
  if (!file.endsWith(".js")) continue;
  const event = await import(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(client, ...args));
  } else {
    client.on(event.name, (...args) => event.execute(client, ...args));
  }
}

client.login(process.env.TOKEN);
