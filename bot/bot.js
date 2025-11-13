import fs from 'fs';
import path from 'path';

import {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
} from 'discord.js';

import { config, validateRequiredEnvVars } from './utils/config.js';

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

// Register commands with Discord API
async function registerCommands() {
  const commands = [];

  for (const [name, commandModule] of client.commands) {
    if (commandModule?.data?.toJSON) {
      commands.push(commandModule.data.toJSON());
      console.log(`📝 Prepared command for registration: ${name}`);
    } else {
      console.warn(`⚠️  Command ${name} missing data.toJSON() method`);
    }
  }

  const rest = new REST({ version: '10' }).setToken(config.TOKEN);

  try {
    console.log(
      `🔄 Registering ${commands.length} application (/) commands...`,
    );

    // Register to specific guild
    const data = await rest.put(
      Routes.applicationGuildCommands(client.user.id, config.GUILD_ID),
      { body: commands },
    );
    console.log(`✅ Successfully registered ${data.length} guild commands`);
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

// Register commands when bot is ready
client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
  console.log(`🤖 Bot is ready and operational!`);
});

client.login(config.TOKEN);
