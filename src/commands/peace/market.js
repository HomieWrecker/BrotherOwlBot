import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';

import { log, logError } from '../../utils/logger.js';
import { formatNumber } from '../../utils/formatting.js';
import { BOT_CONFIG } from '../../config.js';
import keyStorageService from '../../services/key-storage-service.js';

const ITEM_CATEGORIES = {
  drugs: { name: "Drugs", items: { 366: "Xanax", 367: "Ecstasy", 368: "Cannabis", 369: "Ketamine", 370: "LSD", 371: "Opium", 372: "Shrooms", 373: "Speed", 374: "PCP", 375: "Vicodin" }},
  boosters: { name: "Boosters", items: { 394: "Energy Drink", 395: "Protein Shake", 396: "FHC Booster", 397: "Canine Pill", 707: "Epinephrine" }},
  cans: { name: "Cans", items: { 179: "Feathery Hotel Coupon", 180: "Hammer's Hardware Coupon", 181: "Bobik's Vodka Coupon", 182: "Big Al's Gun Shop Coupon", 183: "Cessna's Jet Fuel Coupon", 184: "Six Pack of Cans" }},
  weapons: { name: "Weapons", items: { 77: "Beretta Pico", 78: "PSG1", 79: "MP5k", 229: "Basic AEGIS" }},
  armor: { name: "Armor", items: { 148: "Liquid Body Armor", 149: "Body Armor", 151: "Motorcycle Helmet", 202: "Basic Helmet" }},
  misc: { name: "Misc Items", items: { 258: "Drug Pack", 259: "Supply Pack", 311: "Christmas Crackers", 358: "Box of Tissues", 864: "Small first aid kit", 865: "First aid kit", 866: "Medical kit", 869: "Teddy Bear" }}
};

const POPULAR_ITEMS = [
  { id: 366, name: "Xanax", category: "drugs" },
  { id: 394, name: "Energy Drink", category: "boosters" },
  { id: 184, name: "Six Pack of Cans", category: "cans" },
  { id: 258, name: "Drug Pack", category: "misc" },
  { id: 367, name: "Ecstasy", category: "drugs" },
  { id: 395, name: "Protein Shake", category: "boosters" }
];

function generateBuyLink(itemId) {
  return `https://www.torn.com/imarket.php#/p=shop&step=buy&type=&searchname=&ID=${itemId}`;
}

async function fetchMarketData(apiKey) {
  try {
    const response = await fetch(`https://api.torn.com/market?selections=itemmarket&key=${apiKey}`);
    const data = await response.json();
    if (data.error) {
      logError(`API Error: ${data.error.error}`);
      return { error: data.error.error, code: data.error.code };
    }
    return data.itemmarket || {};
  } catch (error) {
    logError('Network error fetching market data:', error);
    return { error: 'Network or server error', code: 0 };
  }
}

function formatMarketData(marketData, itemsToShow) {
  return itemsToShow.map(item => {
    const itemData = marketData[item.id];
    let lowestPrice = "No listings";
    let quantity = 0;
    if (itemData?.listings?.length > 0) {
      const sorted = [...itemData.listings].sort((a, b) => a.cost - b.cost);
      lowestPrice = `$${formatNumber(sorted[0].cost)}`;
      quantity = itemData.listings.reduce((sum, l) => sum + l.quantity, 0);
    }
    return { ...item, lowestPrice, quantity };
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('market')
    .setDescription('Check Torn item market prices')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Item category to browse')
        .setRequired(false)
        .addChoices(
          { name: 'Popular Items', value: 'popular' },
          { name: 'Drugs', value: 'drugs' },
          { name: 'Boosters', value: 'boosters' },
          { name: 'Cans', value: 'cans' },
          { name: 'Weapons', value: 'weapons' },
          { name: 'Armor', value: 'armor' },
          { name: 'Misc Items', value: 'misc' }
        )
    ),

  async execute(interaction) {
    const user = interaction.user;
    const category = interaction.options.getString('category') || 'popular';

    const apiKey = await keyStorageService.getApiKey(user.id, 'torn');
    if (!apiKey) {
      return interaction.reply({ content: '❌ Use `/apikey` to set your Torn API key.', ephemeral: true });
    }

    await interaction.deferReply();

    const itemsToShow = category === 'popular'
      ? POPULAR_ITEMS
      : Object.entries(ITEM_CATEGORIES[category].items).map(([id, name]) => ({
          id: parseInt(id), name, category
        }));

    const marketData = await fetchMarketData(apiKey);
    if (marketData.error) {
      return interaction.editReply(`❌ API Error: ${marketData.error}`);
    }

    const formatted = formatMarketData(marketData, itemsToShow);
    const embed = new EmbedBuilder()
      .setTitle(`📊 Torn Market - ${ITEM_CATEGORIES[category]?.name || 'Popular Items'}`)
      .setColor(BOT_CONFIG.color)
      .setDescription(`Prices for ${category} in Torn City.`)
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();

    formatted.forEach(item => {
      embed.addFields({
        name: item.name,
        value: `💰 **Price:** ${item.lowestPrice}\n📦 **Quantity:** ${formatNumber(item.quantity)}`,
        inline: true
      });
    });

    const buttonRows = [];
    let row = new ActionRowBuilder();
    let count = 0;

    for (const item of formatted) {
      if (count === 5) {
        buttonRows.push(row);
        row = new ActionRowBuilder();
        count = 0;
      }
      row.addComponents(
        new ButtonBuilder()
          .setLabel(`Buy ${item.name}`)
          .setStyle(ButtonStyle.Link)
          .setURL(generateBuyLink(item.id))
      );
      count++;
    }
    if (count > 0) buttonRows.push(row);

    const categorySelector = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('market_category_select')
        .setPlaceholder('Select a category')
        .addOptions(Object.keys(ITEM_CATEGORIES).map(key => {
          const cat = ITEM_CATEGORIES[key];
          return new StringSelectMenuOptionBuilder()
            .setLabel(cat.name)
            .setValue(key)
            .setDefault(category === key)
            .setDescription(`Browse ${cat.name}`);
        }).concat([
          new StringSelectMenuOptionBuilder()
            .setLabel('Popular Items')
            .setValue('popular')
            .setDefault(category === 'popular')
            .setDescription('Most commonly traded items')
        ]))
    );

    await interaction.editReply({ embeds: [embed], components: [categorySelector, ...buttonRows] });
    log(`Market command run by ${user.tag}`);
  },

  async handleSelectMenu(interaction) {
    if (interaction.customId !== 'market_category_select') return false;

    const category = interaction.values[0];
    await interaction.deferUpdate();

    const modifiedInteraction = {
      ...interaction,
      options: {
        getString: name => name === 'category' ? category : null
      }
    };

    await this.execute(modifiedInteraction);
    return true;
  }
};