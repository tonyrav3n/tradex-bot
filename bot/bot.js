import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { Client, GatewayIntentBits, Collection } from "discord.js";
import { initDb } from "./utils/db.js";

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
const commandsDir = path.join(process.cwd(), "bot", "commands");
const commandFiles = fs
  .readdirSync(commandsDir)
  .filter((f) => f.endsWith(".js"));

for (const file of commandFiles) {
  const mod = await import(`./commands/${file}`);

  const name = mod?.data?.name;
  if (!name) {
    console.warn(`Skipping ${file}: missing export 'data.name'`);
    continue;
  }

  client.commands.set(name, mod);
}

// Load all events from /events
const eventDir = path.join(process.cwd(), "bot", "events");
const eventFiles = fs.readdirSync(eventDir).filter((f) => f.endsWith(".js"));
for (const file of eventFiles) {
  const mod = await import(`./events/${file}`);

  const name = mod?.name;
  if (!name) {
    console.warn(`Skipping ${file}: missing export 'name'`);
    continue;
  }

  if (mod.once) {
    client.once(name, (...args) => mod.execute(client, ...args));
  } else {
    client.on(name, (...args) => mod.execute(client, ...args));
  }
}

await initDb();
client.login(process.env.TOKEN);
