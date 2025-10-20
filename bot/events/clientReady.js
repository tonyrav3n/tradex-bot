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
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log(`Registered ${commands.length} commands in guild.`);
  } catch (err) {
    console.error("Command registration failed:", err);
  }
}
