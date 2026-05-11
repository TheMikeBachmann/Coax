const fs = require('fs');
const path = require('path');

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function matches(record, query) {
    if (!query) return true;
    const keys = Object.keys(query);
    if (keys.length === 0) return true;
    return keys.every(k => record[k] === query[k]);
}

class Collection {
    constructor(filePath) {
        this.filePath = filePath;
    }

    _read() {
        try {
            return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        } catch (_) {
            return [];
        }
    }

    _write(records) {
        fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2), 'utf8');
    }

    find(query) {
        const records = this._read();
        if (query === undefined || query === null) return records;
        return records.filter(r => matches(r, query));
    }

    save(obj) {
        const records = this._read();
        const record = Object.assign({}, obj, { _id: generateId() });
        records.push(record);
        this._write(records);
        return record;
    }

    update(query, newObj) {
        const records = this._read();
        const result = records.map(r => {
            if (matches(r, query)) {
                return Object.assign({}, newObj, { _id: r._id });
            }
            return r;
        });
        this._write(result);
    }

    remove(query) {
        if (query === undefined || query === null) {
            this._write([]);
            return;
        }
        const records = this._read();
        this._write(records.filter(r => !matches(r, query)));
    }
}

class JsonDB {
    connect(dbPath, collections) {
        for (const name of collections) {
            const filePath = path.join(dbPath, `${name}.json`);
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, '[]', 'utf8');
            }
            this[name] = new Collection(filePath);
        }
        return this;
    }
}

module.exports = new JsonDB();
