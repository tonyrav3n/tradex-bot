import { REST, Routes } from "discord.js";

export const name = "clientReady";
export const once = true;

export async function execute(client) {
  console.log(`Logged in as ${client.user.tag}`);

  const GUILD_ID = process.env.GUILD_ID;
  const CLIENT_ID = client.user.id;
  const TOKEN = process.env.TOKEN;

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const commands = client.commands.map((cmd) => cmd.data.toJSON());

  try {
    // Clear all global application commands to remove stale slash commands
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log("Cleared all global application commands.");

    // Register current guild commands only
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log(`Registered ${commands.length} guild commands.`);
  } catch (err) {
    console.error("Command registration failed:", err);
  }
}
