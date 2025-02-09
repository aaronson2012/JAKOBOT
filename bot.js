// bot.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Routes, SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { REST } from '@discordjs/rest';
import { setupWeatherCron, command as weatherCommand } from './modules/weather.js'; // Import weather cron setup and command

const token = process.env.BOT_TOKEN;

// Create a new Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulesPath = path.join(__dirname, 'modules');
const moduleFiles = fs.readdirSync(modulesPath).filter(file => file.endsWith('.js'));

const commands = [];
const modules = [];
const moduleCommands = {}; // To store commands by name
let weatherCronJob; // To store the cron job instance

for (const file of moduleFiles) {
	const filePath = path.join(modulesPath, file);
	import(filePath)
    .then(module => {
        modules.push(module);
        if (module.command && module.command.slashCommand && module.command.name !== 'weather') { // Exclude weather command here
            commands.push(module.command.slashCommand.data.toJSON());
            moduleCommands[module.command.name] = module.command.slashCommand; // Store command
            console.log(`Loaded module: ${module.command.name}`);
        } else if (module.command && module.command.name === 'weather') {
            moduleCommands[module.command.name] = module.command.slashCommand; // Store weather command for later modification
            console.log(`Loaded module: ${module.command.name}`);
        } else {
            console.log(`Loaded module without slash command: ${module.command.name}`);
        }
    })
    .catch(error => {
        console.error(`Error loading module from ${filePath}: ${error}`);
    });
}

// Modify weather command to be top-level and push it to commands array
weatherCommand.slashCommand.data = new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Fetches current weather immediately.');
commands.push(weatherCommand.slashCommand.data.toJSON());
moduleCommands['weather'] = weatherCommand.slashCommand;


// When the client is ready, run this code
// This event will only trigger once after logging in
client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }

    // Setup weather cron job on bot ready
    if (weatherCronJob) { // Stop existing job if it exists
        weatherCronJob.stop();
    }
    weatherCronJob = setupWeatherCron(client); // Store cron job instance
});

// Log in to Discord with your client's token
client.login(token);

client.on('interactionCreate', async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const { commandName } = interaction;

    const slashCommand = moduleCommands[commandName]; // Retrieve stored command

	if (slashCommand) {
		try {
			await slashCommand.execute(interaction, modules); // Pass modules array if needed
		} catch (error) {
			console.error(`Error executing slash command ${commandName}: ${error}`);
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});