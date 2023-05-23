/* 
* this adapter is working fine, however 
* - better-sqlite3 needs to be compiled, which requires extra work,
* - better-sqlite3 is not precompiled for Mac OSX arm64 for electron-builder, preventing from creating installer if you don't have an access to this platform (my case)
*
*/

const sqlite3 = require('better-sqlite3');
const {
    toJSType, types, internalTypeToType, buildFields
} = require('./sqliteutils');


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
        return new Promise(async (resolve, reject) => {
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
                for (let k in tables) {
                    let checks = await getCheckConstraints(k);
                    //                    if (checks.length>0) {
                    tables[k].checks___ = checks;
                    //                    }
                }
                resolve(tables);
            } catch (e) {
                reject(e);
            }
        });
    }

    async function getCheckConstraints(table) {
        if (db == null) throw new Error("DB not connected");
        return new Promise((resolve, reject) => {
            try {
                let stmt = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name=?`);
                let create = stmt.get(table);
                let sql = create.sql.trim();
                sql = sql.substring(0, sql.length - 1); // drop last ) that may break the regexp
                let constraints = [...sql.matchAll(/\b[cC][hH][eE][cC][kK]\s*\((.+)\)/g)]
                let ret = [];
                for (let i = 0; i < constraints.length; i++) {
                    let c = constraints[i];
                    ret.push(c[c.length - 1]);
                }
                resolve(ret);
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
            resolve({ createDBModel, connect, disconnect, query: queryDB, types, internalTypeToType, direct: db, transaction: db.transaction, getCheckConstraints });
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

async function execDB(file, sql, args = []) {
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
                    rows = stmt.all.apply(stmt, args);
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