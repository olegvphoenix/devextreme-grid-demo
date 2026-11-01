// Считает строки своего кода по locFiles каждого требования из
// src/app/features/about/requirements.json — без пустых строк и комментариев —
// и пишет src/assets/loc.json. Запуск: npm run loc.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requirementsPath = path.join(
  root,
  'src/app/features/about/requirements.json'
);
const outputPath = path.join(root, 'src/assets/loc.json');
// Обвязка страницы грида обслуживает все требования и не разносится по ним.
const sharedFiles = [
  'src/app/features/grid/grid.component.ts',
  'src/app/features/grid/grid.component.html',
  'src/app/features/grid/grid.component.css',
];

function countLines(text) {
  const withoutBlocks = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return withoutBlocks
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//')).length;
}

function countFile(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Файл из locFiles не найден: ${relativePath}`);
  }
  return countLines(fs.readFileSync(absolute, 'utf8'));
}

const requirements = JSON.parse(fs.readFileSync(requirementsPath, 'utf8'));
const files = {};
const perRequirement = {};
for (const requirement of requirements) {
  let total = 0;
  for (const file of requirement.locFiles) {
    if (files[file] === undefined) {
      files[file] = countFile(file);
    }
    total += files[file];
  }
  perRequirement[requirement.id] = total;
}
let shared = 0;
for (const file of sharedFiles) {
  files[file] = countFile(file);
  shared += files[file];
}

const report = { requirements: perRequirement, shared, files };
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `loc.json: ${requirements.length} требований, ${Object.keys(files).length} файлов, обвязка грида ${shared} строк`
);
