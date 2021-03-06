const sqlite3 = require('better-sqlite3');

function toJSType(type) {
    switch (type) {
        case "int":
        case "integer":
        case "numeric":
        case "smallint":
        case "double precision":
        case "decimal":
        case "double":
        case "float":
        case "bigint":
        case "int2":
        case "int8":
        case "mediumint":
        case "real":
        case "tinyint":
        case "unsigned bit int":
            return 'number';
        case "character":
        case "nvarchar":
        case "character varying":
        case "text":
        case "native character":
        case "nchar":
        case "varchar":
        case "varying character":
            return "string";
        case "boolean":
        case "bit":
            return "boolean";
        default:
            if (type.indexOf("date") !== -1) {
                return "date";
            } else {
                return "unknown";
            }
    }
}

const types = {
    "integer": { 0: ["int", "integer", "tinyint", "smallint", "mediumint", "bigint", "unsigned bit int", "int2", "int8"] },
    "text": {
        0: ["text", "clob"],
        1: ["character", "varchar", "varying character", "nchar", "native character", "nvarchar"]
    },
    "blob": { 0: ["blob"] },
    "real": { 0: ["real", "double", "double precision", "float"] },
    "numeric": { 0: ["numeric", "boolean", "date", "datetime"], 2: ["decimal"] }
}

function internalTypeToType(internal) {
    let f = { internalType: internal };
    let idx = internal.indexOf("(");
    if (idx != -1) {
        f.type = internal.substring(0, idx).toLowerCase();
        let bounds = internal.substring(idx + 1, internal.length - 1).split(',');
        if (bounds.length == 1) {
            f.bounds = { length: parseInt(bounds[0]) }
        } else {
            let o = {};
            let total = 0;
            for (let i = 0; i < bounds.length; i++) {
                let k = "slice_" + i;
                let v = parseInt(bounds[i]);
                o[k] = v;
                total += v;
            }
            o.length = total;
            f.bounds = o;
        }

    } else {
        f.type = internal.toLowerCase();
        f.bounds = {};
    }
    f.format = toJSType(f.type);
    return f;
}

async function connect(conf) {

    let db = null;
    if (!("readwrite" in conf)) conf.readwrite = false;

    async function disconnect() {
        if (db == null) return;
        return new Promise((resolve, reject) => {
            try {
                if (db != null) {
                    db.close();
                    db = null;
                }
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }


    async function createDBModel() {
        if (db == null) throw new Error("DB not connected");
        return new Promise((resolve, reject) => {
            try {
                let tables = {};
                let stmt = db.prepare(`SELECT name FROM sqlite_master
                WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`);
                let rows = stmt.all();
                let temp = [];
                for (let i = 0; i < rows.length; i++) {
                    temp.push(rows[i].name);
                }
                temp.sort();
                for (let i = 0; i < temp.length; i++) {
                    tables[temp[i]] = {};
                }
                for (let k in tables) {
                    stmt = db.prepare(`PRAGMA table_info('${k}')`);
                    let rows = stmt.all();
                    let table = tables[k];
                    rows = stmt.all();
                    for (let i = 0; i < rows.length; i++) {
                        let row = rows[i];
                        if (row.type == "") continue;
                        let f = {
                            name: row.name,
                            "nullable": row.notnull != 1,
                            "auto": (row.pk == 1 && row.type == "INTEGER"),
                            "pk": row.pk == 1,
                            "unique": row.pk == 1
                        };
                        let t = internalTypeToType(row.type);
                        for (let k in t) f[k] = t[k];
                        f.internalType = f.internalType.toLowerCase();
                        table[row.name] = f;
                    }
                }
                for (let k in tables) {
                    stmt = db.prepare(`PRAGMA foreign_key_list('${k}')`);
                    let rows = stmt.all();
                    for (let i = 0; i < rows.length; i++) {
                        let row = rows[i];
                        tables[k][row.from].fk = {
                            table: row.table,
                            column: row.to
                        };
                    }
                }
                resolve(tables);
            } catch (e) {
                reject(e);
            }
        });
    }

    async function queryDB(sql) {
        if (db == null) throw new Error("DB not connected");
        return new Promise((resolve, reject) => {
            try {
                let stmt = db.prepare(sql);
                stmt.raw(true);
                let rows = stmt.all();
                let qfields = stmt.columns();
                let fields = [];
                for (let i = 0; i < qfields.length; i++) {
                    let f = {};
                    let idx = qfields[i].type == null ? -1 : qfields[i].type.indexOf("(");
                    if (idx != -1) {
                        f.internalType = qfields[i].type.substring(0, idx).toLowerCase();
                        let bounds = qfields[i].type.substring(idx + 1, qfields[i].type.length - 1).split(',');
                        if (bounds.length == 1) {
                            f.bounds = { length: parseInt(bounds[0]) }
                        } else {
                            let o = {};
                            let total = 0;
                            for (let i = 0; i < bounds.length; i++) {
                                let k = "slice_" + i;
                                let v = parseInt(bounds[i]);
                                o[k] = v;
                                total += v;
                            }
                            o.length = total;
                            f.bounds = o;
                        }

                    } else {
                        f.internalType = qfields[i].type == null ? "number" : qfields[i].type.toLowerCase(); // null type for aggregate functions => they express numbers
                        f.bounds = {};
                    }
                    f.type = toJSType(f.internalType);
                    fields.push({
                        name: qfields[i].name,
                        internal: qfields[i],
                        internalType: f.internalType,
                        format: f
                    })
                }
                resolve({
                    rowCount: rows.length,
                    rows: rows,
                    fields: fields
                });
            } catch (e) {
                reject(e);
            }
        });
    }


    return new Promise((resolve, reject) => {
        try {
            db = new sqlite3(conf.file, { readonly: !conf.readwrite, fileMustExist: true });
            resolve({ createDBModel, connect, disconnect, query: queryDB, types, internalTypeToType, direct: db, transaction: db.transaction });
        } catch (e) {
            reject(e);
        }
    });
}

async function createDB(file, sql) {
    return new Promise((resolve, reject) => {
        try {
            let db = new sqlite3(file, { readonly: false, fileMustExist: false }, (err) => {
                reject(err);
            });
            db.exec(sql);
            db.close();
            db = null;
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

async function updateDB(file, sql) {
    return new Promise((resolve, reject) => {
        try {
            let db = new sqlite3(file, { readonly: false, fileMustExist: true }, (err) => {
                reject(err);
            });
            db.exec(sql);
            db.close();
            db = null;
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

function buildFields(qfields) {
    let fields = [];
    for (let i = 0; i < qfields.length; i++) {
        let f = {};
        let idx = qfields[i].type == null ? -1 : qfields[i].type.indexOf("(");
        if (idx != -1) {
            f.internalType = qfields[i].type.substring(0, idx).toLowerCase();
            let bounds = qfields[i].type.substring(idx + 1, qfields[i].type.length - 1).split(',');
            if (bounds.length == 1) {
                f.bounds = { length: parseInt(bounds[0]) }
            } else {
                let o = {};
                let total = 0;
                for (let i = 0; i < bounds.length; i++) {
                    let k = "slice_" + i;
                    let v = parseInt(bounds[i]);
                    o[k] = v;
                    total += v;
                }
                o.length = total;
                f.bounds = o;
            }

        } else {
            f.internalType = qfields[i].type == null ? "number" : qfields[i].type.toLowerCase(); // null type for aggregate functions => they express numbers
            f.bounds = {};
        }
        f.type = toJSType(f.internalType);
        fields.push({
            name: qfields[i].name,
            internal: qfields[i],
            internalType: f.internalType,
            format: f
        })
    }
    return fields;
}

async function execDB(file, sql) {
    return new Promise((resolve, reject) => {
        try {
            let ret = null;
            let db = new sqlite3(file, { readonly: false, fileMustExist: true }, (err) => {
                reject(err);
            });

            try {
                let stmt = db.prepare(sql);
                let query = true;
                try {
                    stmt.raw(true);
                } catch (e) {
                    if (e.message == "The raw() method is only for statements that return data") {
                        query = false;
                    } else {
                        throw e;
                    }
                }
                let rows = null;
                try {
                    rows = stmt.all();
                    query = true;
                } catch (e) {
                    query = false;
                }
                if (query) {
                    let fields = buildFields(stmt.columns());
                    ret = {
                        rowCount: rows.length,
                        rows: rows,
                        fields: fields
                    };
                } else {
                    try {
                        let info = db.prepare(sql).run();
                        ret = {
                            info: info,
                            success: true
                        };
                    } catch (e) {
                        db.exec(sql);
                        ret = {
                            success: true
                        };
                    }
                }
            } catch (e) {
                reject(e);
            }

            db.close();
            db = null;
            resolve(ret);
        } catch (e) {
            reject(e);
        }
    });
}

module.exports = { connect, types, internalTypeToType, createDB, updateDB, execDB }