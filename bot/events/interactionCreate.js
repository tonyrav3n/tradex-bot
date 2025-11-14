import { handleButton } from '../handlers/buttonsHandler.js';

export const name = 'interactionCreate';
export const once = false;

export async function execute(client, interaction) {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.warn(`⚠️  Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(
        `❌ Error executing command ${interaction.commandName}:`,
        error,
      );
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    handleButton(interaction);
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    // TODO: Add select menu handlers here
    console.log(`📋 Select menu interaction: ${interaction.customId}`);
  }
}
