const store = require('./mongo-store');

class Database {
  constructor(filePath) {
    if (!filePath) {
      throw new Error("you must provide a file path");
    }
    this.filePath = filePath;
  }

  async _readData() {
    const data = await store.readJson(this.filePath, []);
    return Array.isArray(data) ? data : [];
  }

  async _writeData(data) {
    await store.writeJson(this.filePath, data);
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
