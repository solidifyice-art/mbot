'use strict';

const { Vec3 } = require('vec3');

const BLOCK_CHARS = [
  [/lava/, '!'],
  [/water/, '~'],
  [/_ore$/, '*'],
  [/grass_block|moss_block/, '"'],
  [/sand|soul_sand|red_sand/, ':'],
  [/gravel/, ','],
  [/log|wood|stem|hyphae/, 'T'],
  [/leaves/, 'L'],
  [/planks|slab|stairs|fence/, '='],
  [/glass|pane/, 'o'],
  [/cobblestone|stone|deepslate|andesite|granite|diorite|brick|terracotta/, '#'],
  [/dirt|podzol|mud|clay/, '.'],
  [/_air$|^air$|cave_air|void_air/, ' '],
];

function blockChar(name) {
  if (!name) return ' ';
  for (const [pattern, char] of BLOCK_CHARS) {
    if (pattern.test(name)) return char;
  }
  if (name === 'air') return ' ';
  return '?';
}

/**
 * Render a top-down ASCII map of the surface around the bot. Each column shows
 * the highest non-empty block within the vertical scan range.
 */
function renderMap(bot, { radius = 8, up = 8, down = 24 } = {}) {
  if (!bot || !bot.entity) throw new Error('Bot is not connected.');

  const origin = bot.entity.position;
  const baseX = Math.floor(origin.x);
  const baseZ = Math.floor(origin.z);
  const topY = Math.floor(origin.y) + up;
  const bottomY = Math.floor(origin.y) - down;

  const lines = [];
  for (let dz = -radius; dz <= radius; dz += 1) {
    let row = '';
    for (let dx = -radius; dx <= radius; dx += 1) {
      let char = ' ';
      for (let y = topY; y >= bottomY; y -= 1) {
        let block = null;
        try {
          block = bot.blockAt(new Vec3(baseX + dx, y, baseZ + dz));
        } catch {
          block = null;
        }
        if (block && block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air') {
          char = blockChar(block.name);
          break;
        }
      }
      if (dx === 0 && dz === 0) char = '@';
      row += char;
    }
    lines.push(row);
  }
  return lines.join('\n');
}

module.exports = { renderMap, blockChar };