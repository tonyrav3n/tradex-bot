import { Events, MessageFlags } from "discord.js";

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(client, interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
    } else if (interaction.isButton()) {
      if (interaction.customId === "create_trade_button") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply({
          content: `Trade creation started — (this is a placeholder response).`,
        });
      }
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "There was an error handling your interaction.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
