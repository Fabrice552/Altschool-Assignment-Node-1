const fs = require('fs/promises');
const path = require('path');

const FILE = path.join(__dirname, '..', 'items.json');

async function ensureFile() {
  try {
    await fs.access(FILE);
  } catch (err) {
    await fs.writeFile(FILE, '[]', 'utf8');
  }
}

async function readAll() {
  await ensureFile();
  const raw = await fs.readFile(FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Corrupt file -> reset to empty
    await fs.writeFile(FILE, '[]', 'utf8');
    return [];
  }
}

async function writeAll(items) {
  await fs.writeFile(FILE, JSON.stringify(items, null, 2), 'utf8');
}

module.exports = {
  async getAll() {
    return await readAll();
  },

  async getById(id) {
    const items = await readAll();
    // use loose equality so numeric-string mixes still match
    return items.find(i => String(i.id) === String(id)) || null;
  },

  async create(item) {
    const items = await readAll();
    items.push(item);
    await writeAll(items);
    return item;
  },

  async update(id, patch) {
    const items = await readAll();
    const idx = items.findIndex(i => String(i.id) === String(id));
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch };
    await writeAll(items);
    return items[idx];
  },

  async remove(id) {
    if (typeof id === 'undefined' || id === null) {
      // remove all
      const items = await readAll();
      const count = items.length;
      await writeAll([]);
      return { removed: count };
    }
    const items = await readAll();
    const idx = items.findIndex(i => String(i.id) === String(id));
    if (idx === -1) return { removed: 0 };
    items.splice(idx, 1);
    await writeAll(items);
    return { removed: 1, id: id };
  },

  async clearAll() {
    await writeAll([]);
  }
};