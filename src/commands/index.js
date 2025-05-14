const fs = require('fs');
const path = require('path');

async function registerCommands(client) {
  const commandFolders = ['peace', 'war'];
  const commandsPath = path.join(__dirname);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.existsSync(folderPath)) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = require(filePath);

      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
      } else {
        console.warn(`[WARNING] The command at ${filePath} is missing required "data" or "execute" property.`);
      }
    }
  }
}

module.exports = { registerCommands };