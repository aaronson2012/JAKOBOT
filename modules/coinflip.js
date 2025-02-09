import { SlashCommandBuilder } from 'discord.js';

function coinflip() {
  const randomValue = Math.random();
  if (randomValue < 0.5) {
    return "Heads! 🪙";
  } else {
    return "Tails! 🪙";
  }
}

export const command = {
  name: 'coinflip',
  slashCommand: {
    data: new SlashCommandBuilder()
      .setName('coinflip')
      .setDescription('Flip a coin and get Heads or Tails!'),
    async execute(interaction) {
      const result = coinflip();
      await interaction.reply(result);
    },
  },
};