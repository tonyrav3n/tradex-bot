import { Events, MessageFlags } from "discord.js";
import { handleButton } from "../handlers/buttons.js";
import { handleModal } from "../handlers/modals.js";
import { handleSelect } from "../handlers/selects.js";

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(client, interaction) {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    // Buttons
    if (interaction.isButton && interaction.isButton()) {
      await handleButton(client, interaction);
      return;
    }

    // Modals
    if (interaction.isModalSubmit && interaction.isModalSubmit()) {
      await handleModal(client, interaction);
      return;
    }

    // User selects
    if (
      typeof interaction.isUserSelectMenu === "function" &&
      interaction.isUserSelectMenu()
    ) {
      await handleSelect(client, interaction);
      return;
    }
  } catch (err) {
    // Centralized error handling for any interaction path
    // Prefer editing if already deferred; otherwise send ephemeral reply.
    // Avoid throwing to keep the client stable.
    // eslint-disable-next-line no-console
    console.error("Interaction error:", err);

    try {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: "There was an error handling your interaction.",
        });
      } else if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({
          content: "There was an error handling your interaction.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch {
      // Swallow errors from error-handling to avoid noise
    }
  }
}
