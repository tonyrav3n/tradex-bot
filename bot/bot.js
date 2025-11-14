import fs from 'fs';
import path from 'path';

import { Client, GatewayIntentBits, Collection } from 'discord.js';

import { env, validateRequiredEnvVars } from './config/env.js';

validateRequiredEnvVars();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load all commands from /commands
const commandsDir = path.join(process.cwd(), 'bot', 'commands');
const commandFiles = fs
  .readdirSync(commandsDir)
  .filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const mod = await import(`./commands/${file}`);

  const name = mod?.data?.name;
  if (!name) {
    console.warn(`⚠️  Skipping ${file}: missing export 'data.name'`);
    continue;
  }

  client.commands.set(name, mod);
}

// Load all events from /events
const eventDir = path.join(process.cwd(), 'bot', 'events');
const eventFiles = fs.readdirSync(eventDir).filter((f) => f.endsWith('.js'));
for (const file of eventFiles) {
  const mod = await import(`./events/${file}`);

  const name = mod?.name;
  if (!name) {
    console.warn(`⚠️  Skipping ${file}: missing export 'name'`);
    continue;
  }

  if (mod.once) {
    client.once(name, (...args) => mod.execute(client, ...args));
  } else {
    client.on(name, (...args) => mod.execute(client, ...args));
  }
}

client.login(env.TOKEN);
