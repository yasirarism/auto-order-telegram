const fs = require('fs').promises;
const path = require('path');

class Database {
  constructor(filePath) {
    if (!filePath) {
      throw new Error("you must provide a file path");
    }
    this.filePath = filePath;
  }

  async _readData() {
    try {
      await fs.access(this.filePath);
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }
  }

  async _writeData(data) {
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  async _generateId() {
    const data = await this._readData();
    const maxId = data.reduce((max, item) => {
      const idVal = item.id || 0;
      return idVal > max ? idVal : max;
    }, 0);
    return maxId + 1;
  }

  async add(item) {
    const data = await this._readData();

    if (!Array.isArray(item)) {
      const newId = await this._generateId();
      const newItem = { id: newId, ...item };
      data.push(newItem);
      await this._writeData(data);
      return newItem;
    }

    const maxId = data.reduce((max, it) => {
      const idVal = it.id || 0;
      return idVal > max ? idVal : max;
    }, 0);

    let currentId = maxId + 1;
    const addedItems = [];

    for (const element of item) {
      const newItem = { id: currentId, ...element };
      currentId++;
      data.push(newItem);
      addedItems.push(newItem);
    }

    await this._writeData(data);
    return addedItems;
  }

  async getAll() {
    return await this._readData();
  }

  async findAllById(id) {
    const data = await this._readData();
    return data.filter(item => item.id === id);
  }

  async findById(id) {
    const data = await this._readData();
    return data.find(item => item.id === id) || null;
  }

  async update(id, newData) {
    const data = await this._readData();
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return false;
    data[index] = { ...data[index], ...newData };
    await this._writeData(data);
    return true;
  }

  async delete(id) {
    const data = await this._readData();
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return false;
    data.splice(index, 1);
    await this._writeData(data);
    return true;
  }

  async find(predicateFn) {
    const data = await this._readData();
    return data.filter(predicateFn);
  }

  async clear() {
    await this._writeData([]);
  }
}

module.exports = Database;
