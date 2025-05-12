/**
 * Market command for Brother Owl
 * Provides information about Torn item market prices with direct buy links
 */

const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatNumber } = require('../utils/formatting');
const { BOT_CONFIG } = require('../config');
const keyStorageService = require('../services/key-storage-service');

// Popular item categories and their IDs
const ITEM_CATEGORIES = {
  drugs: {
    name: "Drugs",
    items: {
      366: "Xanax",
      367: "Ecstasy",
      368: "Cannabis",
      369: "Ketamine",
      370: "LSD",
      371: "Opium",
      372: "Shrooms",
      373: "Speed",
      374: "PCP",
      375: "Vicodin"
    }
  },
  boosters: {
    name: "Boosters",
    items: {
      394: "Energy Drink",
      395: "Protein Shake",
      396: "FHC Booster",
      397: "Canine Pill",
      707: "Epinephrine"
    }
  },
  cans: {
    name: "Cans",
    items: {
      179: "Feathery Hotel Coupon",
      180: "Hammer's Hardware Coupon",
      181: "Bobik's Vodka Coupon",
      182: "Big Al's Gun Shop Coupon",
      183: "Cessna's Jet Fuel Coupon",
      184: "Six Pack of Cans"
    }
  },
  weapons: {
    name: "Weapons",
    items: {
      77: "Beretta Pico",
      78: "PSG1",
      79: "MP5k",
      229: "Basic AEGIS"
    }
  },
  armor: {
    name: "Armor",
    items: {
      148: "Liquid Body Armor",
      149: "Body Armor",
      151: "Motorcycle Helmet",
      202: "Basic Helmet"
    }
  },
  misc: {
    name: "Misc Items",
    items: {
      258: "Drug Pack",
      259: "Supply Pack",
      311: "Christmas Crackers",
      358: "Box of Tissues",
      864: "Small first aid kit",
      865: "First aid kit",
      866: "Medical kit",
      869: "Teddy Bear"
    }
  }
};

// Top 6 most popular items (these would typically be determined by usage data)
const POPULAR_ITEMS = [
  { id: 366, name: "Xanax", category: "drugs" },
  { id: 394, name: "Energy Drink", category: "boosters" },
  { id: 184, name: "Six Pack of Cans", category: "cans" },
  { id: 258, name: "Drug Pack", category: "misc" },
  { id: 367, name: "Ecstasy", category: "drugs" },
  { id: 395, name: "Protein Shake", category: "boosters" }
];

/**
 * Fetch item market data from Torn API
 * @param {Array} itemIds - Array of item IDs to fetch
 * @param {string} apiKey - Torn API key
 * @returns {Promise<Object|null>} Market data or null if error
 */
async function fetchMarketData(itemIds, apiKey) {
  try {
    // Build comma-separated list of item IDs
    const itemsParam = itemIds.join(',');
    
    // Make the API request to Torn's items endpoint
    const response = await fetch(`https://api.torn.com/market/${itemsParam}?selections=itemmarket&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      logError(`API Error fetching market data: ${data.error.error}`);
      return null;
    }
    
    return data;
  } catch (error) {
    logError('Error fetching market data:', error);
    return null;
  }
}

/**
 * Generate direct buy link for an item
 * @param {string} itemId - ID of the item
 * @returns {string} URL to buy the item on Torn
 */
function generateBuyLink(itemId) {
  return `https://www.torn.com/imarket.php#/p=shop&step=buy&type=&searchname=&ID=${itemId}`;
}

/**
 * Format market data for display
 * @param {Object} marketData - Market data from API
 * @param {Array} itemsToShow - Array of item objects to show
 * @returns {Array} Array of formatted market entries
 */
function formatMarketData(marketData, itemsToShow) {
  const formattedEntries = [];
  
  for (const item of itemsToShow) {
    const itemId = item.id.toString();
    const itemData = marketData && marketData[itemId] ? marketData[itemId] : null;
    
    let lowestPrice = "No listings";
    let quantity = 0;
    
    if (itemData && itemData.listings && itemData.listings.length > 0) {
      // Find the lowest price
      const sortedListings = [...itemData.listings].sort((a, b) => a.cost - b.cost);
      lowestPrice = `$${formatNumber(sortedListings[0].cost)}`;
      
      // Count total quantity available
      quantity = itemData.listings.reduce((sum, listing) => sum + listing.quantity, 0);
    }
    
    formattedEntries.push({
      name: item.name,
      id: item.id,
      lowestPrice,
      quantity,
      category: item.category
    });
  }
  
  return formattedEntries;
}

// Market command
const marketCommand = {
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
        )),
  
  async execute(interaction, client) {
    const { user } = interaction;
    
    // Get selected category or default to popular
    const category = interaction.options.getString('category') || 'popular';
    
    // Get user's API key
    try {
      const apiKey = await keyStorageService.getApiKey(user.id, 'torn');
      if (!apiKey) {
        return interaction.reply({
          content: '❌ You need to set up your API key first with `/apikey`.',
          ephemeral: true
        });
      }
      
      // Defer the reply while we fetch data
      await interaction.deferReply();
      
      // Determine which items to fetch based on category
      let itemsToShow = [];
      let categoryTitle = '';
      
      if (category === 'popular') {
        itemsToShow = POPULAR_ITEMS;
        categoryTitle = 'Popular Items';
      } else {
        // Get items from the selected category
        const categoryInfo = ITEM_CATEGORIES[category];
        categoryTitle = categoryInfo.name;
        
        // Convert the category items object to an array of item objects
        itemsToShow = Object.entries(categoryInfo.items).map(([id, name]) => ({
          id: parseInt(id),
          name,
          category
        }));
      }
      
      // Get all item IDs to fetch
      const itemIds = itemsToShow.map(item => item.id);
      
      try {
        // Fetch market data for all items
        const marketData = await fetchMarketData(itemIds, apiKey);
        
        if (!marketData) {
          return interaction.editReply('❌ Could not fetch market data. Please try again later.');
        }
        
        // Format the market data
        const formattedData = formatMarketData(marketData, itemsToShow);
        
        // Create the market embed
        const embed = new EmbedBuilder()
          .setTitle(`📊 Torn Market - ${categoryTitle}`)
          .setColor(BOT_CONFIG.color)
          .setDescription(`Current market prices for ${categoryTitle.toLowerCase()} in Torn City.`)
          .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Prices update every few minutes` })
          .setTimestamp();
        
        // Add each item to the embed
        for (const item of formattedData) {
          embed.addFields({
            name: item.name,
            value: `💰 **Price:** ${item.lowestPrice}\n📦 **Quantity:** ${formatNumber(item.quantity)}`,
            inline: true
          });
        }
        
        // Create buy buttons for each item (max 5 buttons per row)
        const buttonRows = [];
        let currentRow = new ActionRowBuilder();
        let buttonCount = 0;
        
        for (const item of formattedData) {
          if (buttonCount >= 5) {
            buttonRows.push(currentRow);
            currentRow = new ActionRowBuilder();
            buttonCount = 0;
          }
          
          currentRow.addComponents(
            new ButtonBuilder()
              .setLabel(`Buy ${item.name}`)
              .setURL(generateBuyLink(item.id))
              .setStyle(ButtonStyle.Link)
          );
          
          buttonCount++;
        }
        
        // Add the last row if it has buttons
        if (buttonCount > 0) {
          buttonRows.push(currentRow);
        }
        
        // Create category selector
        const categorySelector = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('market_category_select')
              .setPlaceholder('Select a category')
              .addOptions(
                new StringSelectMenuOptionBuilder()
                  .setLabel('Popular Items')
                  .setValue('popular')
                  .setDescription('Most frequently checked items')
                  .setDefault(category === 'popular'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Drugs')
                  .setValue('drugs')
                  .setDescription('Xanax, Ecstasy, and other drugs')
                  .setDefault(category === 'drugs'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Boosters')
                  .setValue('boosters')
                  .setDescription('Energy Drinks, FHCs, and other boosters')
                  .setDefault(category === 'boosters'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Cans')
                  .setValue('cans')
                  .setDescription('Various coupons and six packs')
                  .setDefault(category === 'cans'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Weapons')
                  .setValue('weapons')
                  .setDescription('Popular weapons')
                  .setDefault(category === 'weapons'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Armor')
                  .setValue('armor')
                  .setDescription('Body armor and protection')
                  .setDefault(category === 'armor'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Misc Items')
                  .setValue('misc')
                  .setDescription('Drug packs, supplies, and other items')
                  .setDefault(category === 'misc')
              )
          );
        
        // Combine all components
        const components = [categorySelector, ...buttonRows];
        
        // Send the response
        await interaction.editReply({
          embeds: [embed],
          components: components
        });
        
        log(`Market prices for ${categoryTitle} checked by ${user.tag} [${user.id}]`);
      } catch (error) {
        logError('Error processing market data:', error);
        await interaction.editReply('❌ Error processing market data. Please try again later.');
      }
    } catch (error) {
      logError('Error retrieving API key:', error);
      if (!interaction.deferred) {
        await interaction.reply({
          content: '❌ Error retrieving your API key. Please try again later.',
          ephemeral: true
        });
      } else {
        await interaction.editReply('❌ Error retrieving your API key. Please try again later.');
      }
    }
  },
  
  // Handle select menu interactions
  async handleSelectMenu(interaction, client) {
    if (interaction.customId === 'market_category_select') {
      const selectedCategory = interaction.values[0];
      
      // Create a new interaction to simulate the command being run with the selected category
      const options = { category: selectedCategory };
      
      // Defer the update
      await interaction.deferUpdate();
      
      // Re-execute the command with the selected category
      try {
        // We need to modify the interaction object to include the selected category
        const modifiedInteraction = { 
          ...interaction,
          options: {
            getString: (name) => name === 'category' ? selectedCategory : null
          }
        };
        
        await this.execute(modifiedInteraction, client);
      } catch (error) {
        logError('Error handling market category selection:', error);
        await interaction.editReply({
          content: '❌ Error changing category. Please try again.',
          embeds: [],
          components: []
        });
      }
    }
    
    return false;
  }
};

module.exports = marketCommand;