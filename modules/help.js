// modules/help.js
import { SlashCommandBuilder } from 'discord.js';

export const command = {
  name: 'help',
  description: 'Lists all available commands.',
  slashCommand: {
    data: new SlashCommandBuilder()
      .setName('help')
      .setDescription('Lists all available commands.'),
    execute: async (interaction, modules) => {
      let helpText = 'Available Commands:\n';
      modules.forEach(module => {
        if (module.command && module.command.name && module.command.description) {
          helpText += `/${module.command.name}: ${module.command.description}\n`;
        }
      });
      await interaction.reply({ content: helpText, ephemeral: true }); // Ephemeral for help command
    },
  },
};