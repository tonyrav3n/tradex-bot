import { REST, Routes } from 'discord.js';

import { env } from '../config/env.js';

export const name = 'clientReady';
export const once = true;

export async function execute(client) {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} guild(s)`);

  // Register commands with Discord API
  await registerCommands(client);

  console.log(`🤖 Bot is ready and operational!`);
}

async function registerCommands(client) {
  const commands = [];

  for (const [name, commandModule] of client.commands) {
    if (commandModule?.data?.toJSON) {
      commands.push(commandModule.data.toJSON());
      console.log(`📝 Prepared command for registration: ${name}`);
    } else {
      console.warn(`⚠️  Command ${name} missing data.toJSON() method`);
    }
  }

  const rest = new REST({ version: '10' }).setToken(env.TOKEN);

  try {
    console.log(
      `🔄 Registering ${commands.length} application (/) commands...`,
    );

    // Register to specific guild
    const data = await rest.put(
      Routes.applicationGuildCommands(client.user.id, env.GUILD_ID),
      { body: commands },
    );
    console.log(`✅ Successfully registered ${data.length} guild commands`);
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}
