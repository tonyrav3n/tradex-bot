import { Events, MessageFlags } from "discord.js";
import { createTrade } from "../utils/createTrade.js";

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(client, interaction) {
  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    // Handle button interactions
    if (interaction.isButton()) {
      if (interaction.customId === "create_trade_button") {
        // Defer reply to prevent Discord timeout
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Define trade participants (temp hardcoded for now)
        const buyer = "0x8748B8d799754DA4bD9B5640e444b59E957F8f8E";
        const seller = "0xe3378EE2b08284f5ac0c2695d4029E1C444beE6F";
        const amount = "0.001"; // example ETH amount — you can change this later

        try {
          // Call createTrade util (which interacts with the Factory contract)
          const txHash = await createTrade(buyer, seller, amount);

          await interaction.editReply({
            content: `✅ Trade successfully created!\n\n**Transaction hash:** ${txHash}`,
          });
        } catch (err) {
          console.error("Create trade error:", err);
          await interaction.editReply({
            content: `❌ Failed to create trade:\n\`${err.message}\``,
          });
        }
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
