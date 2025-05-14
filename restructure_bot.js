// restructure_bot.js
const fs = require('fs');
const path = require('path');

// Helpers
function moveFile(file, targetDir) {
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const dest = path.join(targetDir, path.basename(file));
  fs.renameSync(file, dest);
}

// 1. Create target structure
const folders = [
  'src/commands/war',
  'src/commands/peace',
  'src/events',
  'src/utils',
  'docs',
  'archives',
  'legacy',
];

folders.forEach(folder => {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

// 2. Move core files
moveFile('index.js', 'src/');
moveFile('event_handlers.js', 'src/events/');

// 3. Move API docs
['api_documentation.html', 'api_page.html'].forEach(file => {
  if (fs.existsSync(file)) moveFile(file, 'docs');
});

// 4. Move archive zips
['brotherOwl_bot.zip', 'brother_owl_release.zip', 'brother_owl_components.zip'].forEach(file => {
  if (fs.existsSync(file)) moveFile(file, 'archives');
});

// 5. Move legacy Python and test files
['check_tornstats_key.py', 'quick_test.py', 'simple_test.py', 'pyproject.toml', 'uv.lock'].forEach(file => {
  if (fs.existsSync(file)) moveFile(file, 'legacy');
});

console.log('Restructure complete.');