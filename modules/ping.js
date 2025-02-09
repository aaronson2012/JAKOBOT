// modules/ping.js
import { SlashCommandBuilder } from 'discord.js';

export const command = {
  name: 'ping',
  description: 'Responds with Pong!',
  slashCommand: {
    data: new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Responds with Pong!'),
    execute: async (interaction) => {
      await interaction.reply('Pong!');
    },
  },
};