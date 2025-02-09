// modules/weather.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import cron from 'node-cron';
import axios from 'axios';
import moment from 'moment-timezone';

const weatherDescriptionEmojis = {
  'clear sky': '☀️',
  'few clouds': '🌤️',
  'scattered clouds': '☁️',
  'broken clouds': '🌥️',
  'shower rain': '🌦️',
  'rain': '🌧️',
  'thunderstorm': '⛈️',
  'snow': '❄️',
  'mist': '🌫️',
  'overcast clouds': '☁️', // Added overcast clouds
  'light snow': '🌨️',
};

const temperatureEmojis = {
  'hot': '🔥',
  'warm': '☀️',
  'moderate': '🌡️',
  'cool': '🍃',
  'cold': '🥶',
  'freezing': '❄️',
};

const humidityEmojis = {
  'high': '💦',
  'moderate': '💧',
  'low': '🏜️',
};

const windSpeedEmojis = {
  'high': '🌪️',
  'moderate': '💨',
  'breezy': '🌬️',
  'calm': '🍃',
};

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const WEATHER_CITY = process.env.WEATHER_CITY;
const WEATHER_TIMEZONE = process.env.WEATHER_TIMEZONE; // New env variable for timezone
const WEATHER_CHANNEL_ID = process.env.WEATHER_CHANNEL_ID; // Discord channel to send weather updates

let weatherCronJob; // To store the cron job instance

async function fetchWeather() {
  if (!WEATHER_API_KEY) {
    console.error('WEATHER_API_KEY is not set in environment variables.');
    return { error: 'Weather forecast is unavailable due to missing API key.' };
  }
  if (!WEATHER_CITY) {
    console.error('WEATHER_CITY is not set in environment variables.');
    return { error: 'Weather forecast is unavailable due to missing city configuration.' };
  }

  try {
    const response = await axios.get(`http://api.openweathermap.org/data/2.5/forecast?q=${WEATHER_CITY}&appid=${WEATHER_API_KEY}&units=imperial`);
    const forecastData = response.data;
    const timezoneOffsetSeconds = forecastData.city.timezone;

    return {
      forecastData, // Return the raw forecast data
      timezoneOffsetSeconds, // Return timezone offset in seconds
    };
  } catch (error) {
    console.error('Error fetching weather data:', error);
    return { error: 'Failed to fetch weather data. Please try again later.' };
  }
}

function formatForecastData(rawForecastData, timezone) {
  const city = rawForecastData.city.name;
  const timezoneOffsetSeconds = rawForecastData.city.timezone;
  const cityTimezone = timezone || 'UTC';

  const hourlyForecasts = rawForecastData.list.map(item => {
    return {
      time: moment.utc(item.dt_txt).utcOffset(timezoneOffsetSeconds / 3600).format('H'), // Get hour in 24-hour format
      time_full: item.dt_txt,
      temperature: item.main.temp,
      description: item.weather[0].description,
      icon: item.weather[0].icon,
      humidity: item.main.humidity,
      wind_speed: item.wind.speed
    };
  });

  const periods = {
    morning: { hours: ['6', '7', '8', '9'], forecasts: [], emoji: '🌅' },
    noon: { hours: ['12'], forecasts: [], emoji: '☀️' },
    afternoon: { hours: ['15', '16', '17', '18'], forecasts: [], emoji: '🌇' }, // 3pm to 6pm
    night: { hours: ['21', '22', '23', '0', '24'], forecasts: [], emoji: '🌙' } // 9pm to midnight
  };

  for (const forecast of hourlyForecasts) {
    const hour = forecast.time;
    if (periods.morning.hours.includes(hour)) {
      periods.morning.forecasts.push(forecast);
    } else if (periods.noon.hours.includes(hour)) {
      periods.noon.forecasts.push(forecast);
    } else if (periods.afternoon.hours.includes(hour)) {
      periods.afternoon.forecasts.push(forecast);
    } else if (periods.night.hours.includes(hour)) {
      periods.night.forecasts.push(forecast);
    }
  }

  const periodSummaries = {};
  for (const periodName in periods) {
    const period = periods[periodName];
    if (period.forecasts.length > 0) {
      let avgTemp = period.forecasts.reduce((sum, f) => sum + f.temperature, 0) / period.forecasts.length;
      avgTemp = parseFloat(avgTemp.toFixed(1)); // Round to one decimal place
      const representativeForecast = period.forecasts[Math.floor(period.forecasts.length / 2)]; // Pick middle forecast as representative
      
      // Determine emojis based on weather conditions
      const descriptionEmoji = weatherDescriptionEmojis[representativeForecast.description] || '';
      let temperatureEmoji = '';
      if (avgTemp > 90) temperatureEmoji = temperatureEmojis.hot;
      else if (avgTemp > 75) temperatureEmoji = temperatureEmojis.warm;
      else if (avgTemp > 60) temperatureEmoji = temperatureEmojis.moderate;
      else if (avgTemp > 45) temperatureEmoji = temperatureEmojis.cool;
      else if (avgTemp > 32) temperatureEmoji = temperatureEmojis.cold;
      else temperatureEmoji = temperatureEmojis.freezing;

      let humidityEmoji = '';
      if (representativeForecast.humidity > 80) humidityEmoji = humidityEmojis.high;
      else if (representativeForecast.humidity > 50) humidityEmoji = humidityEmojis.moderate;
      else humidityEmoji = humidityEmojis.low;

      let windSpeedEmoji = '';
      if (representativeForecast.wind_speed > 30) windSpeedEmoji = windSpeedEmojis.high;
      else if (representativeForecast.wind_speed > 15) windSpeedEmoji = windSpeedEmojis.moderate;
      else if (representativeForecast.wind_speed > 5) windSpeedEmoji = windSpeedEmojis.breezy;
      else windSpeedEmoji = windSpeedEmojis.calm;

      periodSummaries[periodName] = {
        emoji: period.emoji,
        time: periodName.charAt(0).toUpperCase() + periodName.slice(1), // Capitalize period name
        temperature: avgTemp,
        temperatureEmoji: temperatureEmoji,
        description: representativeForecast.description,
        descriptionEmoji: descriptionEmoji,
        icon: representativeForecast.icon,
        humidity: representativeForecast.humidity,
        humidityEmoji: humidityEmoji,
        wind_speed: representativeForecast.wind_speed,
        windSpeedEmoji: windSpeedEmoji
      };
    } else {
      periodSummaries[periodName] = {
        emoji: period.emoji,
        time: periodName.charAt(0).toUpperCase() + periodName.slice(1),
        description: "Not available" // Indicate no forecast for this period
      };
    }
  }


  return {
    city,
    timezone: cityTimezone,
    periods: periodSummaries,
  };
}


export const command = {
  name: 'weather',
  description: 'Fetches current weather manually.',
  slashCommand: {
    data: new SlashCommandBuilder()
      .setName('weather')
      .setDescription('Fetches current weather immediately.'),
    execute: async (interaction) => {
      console.log("Weather command executed"); // Simple log
      const weatherDataRaw = await fetchWeather();
      if (weatherDataRaw.error) {
        await interaction.reply({ content: weatherDataRaw.error, ephemeral: true });
        return;
      }

      const weatherData = formatForecastData(weatherDataRaw.forecastData, WEATHER_TIMEZONE || 'UTC');

      const forecastEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`Weather Forecast for ${weatherData.city} ${weatherData.periods.morning.emoji}`) // Removed timezone from title
        .setDescription(`Forecast for Morning, Noon, Afternoon, and Night.`)
        .setThumbnail(`http://openweathermap.org/img/wn/${weatherData.periods.noon.icon}@2x.png`) // Noon icon as thumbnail
        .setTimestamp();


      for (const periodName in weatherData.periods) {
        const period = weatherData.periods[periodName];
        if (period.description !== "Not available") {
          forecastEmbed.addFields(
            {
              name: `${period.time} ${period.emoji}`, // Period name with emoji
              value: `* **Temp:** ${period.temperature}°F ${period.temperatureEmoji || ''}\n* **Description:** ${period.description} ${period.descriptionEmoji || ''}\n* **Humidity:** ${period.humidity}% ${period.humidityEmoji || ''}\n* **Wind Speed:** ${period.wind_speed} mph ${period.windSpeedEmoji || ''}`,
              inline: true,
            },
          );
        } else {
          forecastEmbed.addFields(
            {
              name: `${period.time} ${period.emoji}`, // Period name with emoji
              value: `Not available`,
              inline: true,
            },
          );
        }
      }

      await interaction.reply({ embeds: [forecastEmbed], ephemeral: false });
    },
  },
};

export const setupWeatherCron = async (client) => {
  if (!WEATHER_API_KEY) {
    console.error('WEATHER_API_KEY is not set in environment variables.');
    return;
  }
  if (!WEATHER_CITY) {
    console.error('WEATHER_CITY is not set in environment variables.');
    return;
  }
  if (!WEATHER_TIMEZONE) {
    console.error('WEATHER_TIMEZONE is not set in environment variables.');
    return;
  }
  if (!WEATHER_CHANNEL_ID) {
    console.error('WEATHER_CHANNEL_ID is not set in environment variables.');
    return;
  }


  if (weatherCronJob) {
    weatherCronJob.stop(); // Stop existing cron job
  }

  const weatherDataRaw = await fetchWeather();
  if (weatherDataRaw.error) {
    console.error("Could not setup weather cron job due to weather data fetch error:", weatherDataRaw.error);
    return;
  }

  const weatherData = formatForecastData(weatherDataRaw.forecastData, WEATHER_TIMEZONE || 'UTC');
  const cityTimezone = WEATHER_TIMEZONE || 'UTC'; // Use WEATHER_TIMEZONE from env

  console.log('Setting weather cron job for timezone: ' + cityTimezone);

  weatherCronJob = cron.schedule('0 8 * * *', async () => {
    const weatherDataRaw = await fetchWeather();
    if (weatherDataRaw.error) {
      console.error('Error fetching weather for daily cron:', weatherDataRaw.error);
      return; // Do not send error to Discord channel for cron jobs, just log it.
    }

    const weatherData = formatForecastData(weatherDataRaw.forecastData, WEATHER_TIMEZONE || 'UTC');


    const forecastEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`Good Morning! Weather Forecast for ${weatherData.city} ${weatherData.periods.morning.emoji}`) // Removed timezone, added emoji to title
      .setDescription(`Here is your weather forecast for today:`) // Updated description
      .setThumbnail(`http://openweathermap.org/img/wn/${weatherData.periods.morning.icon}@2x.png`) // Morning icon as thumbnail
      .setTimestamp();

    for (const periodName in weatherData.periods) {
      const period = weatherData.periods[periodName];
      if (period.description !== "Not available") {
        forecastEmbed.addFields({
          name: `${period.time} ${period.emoji}`, // Period name with emoji
          value: `* **Temp:** ${period.temperature}°F ${period.temperatureEmoji || ''}\n* **Description:** ${period.description} ${period.descriptionEmoji || ''}\n* **Humidity:** ${period.humidity}% ${period.humidityEmoji || ''}\n* **Wind Speed:** ${period.wind_speed} mph ${period.windSpeedEmoji || ''}`,
          inline: true
        });
      } else {
        forecastEmbed.addFields({
          name: `${period.time} ${period.emoji}`, // Period name with emoji
          value: `Not available`,
          inline: true
        });
      }
    }


    const channel = client.channels.cache.get(process.env.WEATHER_CHANNEL_ID); // Set channel ID in .env
    if (channel && channel.isTextBased()) {
      channel.send({ embeds: [forecastEmbed] });
    } else {
      console.error('Could not find weather channel or channel is not text-based.');
    }
  }, {
    scheduled: true,
    timezone: cityTimezone // Use city's timezone for cron scheduling
  });
};