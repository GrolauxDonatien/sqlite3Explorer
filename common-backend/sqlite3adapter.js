const sqlite3 = require('sqlite3');

const {
    toJSType, types, internalTypeToType, buildFields, toArray
} = require('./sqliteutils');


async function promise(db, op, ...args) {
    return new Promise((resolve, reject) => {
        args.push(function (err, result) {
            if (err != null) {
                reject(err);
            } else {
                resolve(result || this);
            }
        });
        db[op].apply(db, args);
    });
}

async function connect(conf) {

    let db = null;
    if (!("readwrite" in conf)) conf.readwrite = false;

    async function disconnect() {
        if (db == null) return;
        return new Promise((resolve, reject) => {
            try {
                if (db != null) {
                    db.close((err) => {
                        if (err == null) {
                            db = null;
                            resolve();
                        } else {
                            reject(err);
                        }
                    });
                }
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
                db.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
                    async (err, rows) => {
                        if (err != null) {
                            reject(err);
                            return;
                        }
                        let temp = [];
                        for (let i = 0; i < rows.length; i++) {
                            temp.push(rows[i].name);
                        }
                        if (temp.length == 0) {
                            resolve(tables);
                            return;
                        }
                        temp.sort();
                        for (let i = 0; i < temp.length; i++) {
                            tables[temp[i]] = {};
                        }
                        async function step1() {
                            let count = temp.length;
                            for (let k in tables) {
                                db.all(`PRAGMA table_info('${k}')`,
                                    async (err, rows) => {
                                        if (err != null) {
                                            reject(err);
                                            return;
                                        }
                                        let table = tables[k];
                                        for (let i = 0; i < rows.length; i++) {
                                            let row = rows[i];
                                            if (row.type == "") continue;
                                            let f = {
                                                name: row.name,
                                                "nullable": row.notnull != 1,
                                                "auto": (row.pk > 0 && row.type == "INTEGER"),
                                                "pk": row.pk > 0,
                                                "unique": row.pk > 0
                                            };
                                            let t = internalTypeToType(row.type);
                                            for (let k in t) f[k] = t[k];
                                            f.internalType = f.internalType.toLowerCase();
                                            table[row.name] = f;
                                        }
                                        count--;
                                        if (count == 0) step2();
                                    });
                            }
                        }
                        async function step2() {
                            let count = temp.length;
                            for (let k in tables) {
                                db.all(`PRAGMA foreign_key_list('${k}')`,
                                    async (err, rows) => {
                                        if (err != null) {
                                            reject(err);
                                            return;
                                        }
                                        for (let i = 0; i < rows.length; i++) {
                                            let row = rows[i];

                                            tables[k][row.from].fk = {
                                                table: row.table,
                                                column: row.to
                                            };
                                        }
                                        count--;
                                        if (count == 0) step3();
                                    }
                                );
                            }
                        }
                        async function step3() {
                            for (let k in tables) {
                                let checks = await getCheckConstraints(k);
                                tables[k].checks___ = checks;
                            }
                            resolve(tables);
                        }
                        step1();
                    });
            } catch (e) {
                reject(e);
            }
        });
    }

    async function getCheckConstraints(table) {
        if (db == null) throw new Error("DB not connected");
        return new Promise((resolve, reject) => {
            try {
                db.get(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name=?`, [table], (err, create) => {
                    let sql = create.sql.trim();
                    sql = sql.substring(0, sql.length - 1); // drop last ) that may break the regexp
                    let constraints = [...sql.matchAll(/\b[cC][hH][eE][cC][kK]\s*\((.+)\)/g)]
                    let ret = [];
                    for (let i = 0; i < constraints.length; i++) {
                        let c = constraints[i];
                        ret.push(c[c.length - 1]);
                    }
                    resolve(ret);
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    async function queryDB(sql) {
        if (db == null) throw new Error("DB not connected");

        return new Promise((resolve, reject) => {
            db.serialize(async () => {
                let orows = [];
                let qfields = [];
                try {
                    await promise(db, "run", 'BEGIN TRANSACTION');
                    orows = await promise(db, "all", sql);
                    await promise(db, "run", "CREATE TEMP VIEW query__tmp AS " + sql);
                    qfields = await promise(db, "all", "PRAGMA table_info(query__tmp)");
                    await promise(db, "run", "DROP VIEW query__tmp");
                    await promise(db, "run", "COMMIT");
                } catch (e) {
                    try {
                        await promise(db, "run", "ROLLBACK");
                    } catch (_) { }
                    reject(e);
                }
                let fields = buildFields(qfields);
                for(let i=0; i<fields.length; i++) {
                    if (fields[i].name.indexOf(':')!=-1) {
                        reject(new Error("Query contains several columns of the same name: "+fields[i].name.split(':')[0]));
                        return;
                    }
                }
                let rows = toArray(orows, fields);
                resolve({
                    rowCount: rows.length,
                    rows: rows,
                    fields: fields
                });
            });
        });
    }

    function prepare(sql) {
        return {
            async run(...params) { return promise(db, "run", sql, ...params) },
            async get(...params) { return promise(db, "get", sql, ...params) },
            async all(...params) { return promise(db, "all", sql, ...params) }
        }
    }

    async function transaction(cmd) {
        return new Promise((resolve, reject) => {
            db.serialize(async () => {
                try {
                    await promise(db, "run", 'BEGIN TRANSACTION');
                    await cmd();
                    await promise(db, "run", 'COMMIT');
                    resolve();
                } catch (e) {
                    try {
                        await promise(db, "run", "ROLLBACK");
                    } catch (_) { }
                    reject(e);
                }
            })
        });
    }

    return new Promise((resolve, reject) => {
        try {
            db = new sqlite3.Database(conf.file, (conf.readwrite ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY),
                async (err) => {
                    if (err == null) {
                        await promise(db, "exec", "PRAGMA foreign_keys = ON;");
                        resolve({ createDBModel, connect, disconnect, query: queryDB, prepare, transaction, types, internalTypeToType, getCheckConstraints });
                    } else {
                        reject(err);
                    }
                });
        } catch (e) {
            reject(e);
        }
    });
}

async function createDB(file, sql) {
    return new Promise((resolve, reject) => {
        try {
            let db = new sqlite3.Database(file, sqlite3.OPEN_CREATE | sqlite3.OPEN_READWRITE,
                async (err) => {
                    if (err != null) {
                        reject(e);
                    } else {
                        try {
                            await promise(db, "exec", sql);
                            resolve();
                        } catch (e) {
                            reject(e);
                        } finally {
                            try {
                                await promise(db, "close", sql);
                            } catch (_) { }
                        }
                    }
                });
        } catch (e) {
            reject(e);
        }
    });
}

async function updateDB(file, sql) {
    return new Promise((resolve, reject) => {
        try {
            let db = new sqlite3.Database(file, sqlite3.OPEN_READWRITE,
                async (err) => {
                    if (err != null) {
                        reject(err);
                    } else {
                        try {
                            await promise(db, "exec", "PRAGMA foreign_keys = ON;");
                            await promise(db, "exec", sql);
                            resolve();
                        } catch (e) {
                            reject(e);
                        } finally {
                            try {
                                await promise(db, "close", sql);
                            } catch (_) { }
                        }
                    }
                });
        } catch (e) {
            reject(e);
        }
    });
}

function inject(sql, args) {
    // this is unsafe : resolve a parametrised statement injecting the values directly.
    // A proper solution would be to parse the statement, identify the ? and insert the values safely.
    // However, due to the use case of this application, this simple solution is good enough.
    let parts = sql.split('?');
    let ret = [];
    for (let i = 0; i < args.length; i++) {
        ret.push(parts[i]);
        if (args[i] == null) {
            ret.push('NULL');
        } else if (typeof args[i] == "string" || (args[i] instanceof String)) {
            ret.push("'" + args[i].split("'").join("''") + "'");
        } else {
            ret.push(args[i]);
        }
    }
    return ret.join('');
}

async function execDB(file, sql, args = []) {
    return new Promise((resolve, reject) => {
        try {
            let db = new sqlite3.Database(file, sqlite3.OPEN_READWRITE,
                async (err) => {
                    if (err != null) {
                        reject(e);
                    } else {
                        try {
                            await promise(db, "exec", "PRAGMA foreign_keys = ON;");
                            await promise(db, "run", 'BEGIN TRANSACTION');
                            let orows = [];
                            let qfields = [];
                            if (sql.trim().toUpperCase().startsWith("PRAGMA ")) {
                                orows = await promise(db, "all", sql, args);
                                await promise(db, "run", "COMMIT");
                                let fields=[];
                                if (orows.length>0) for(let k in orows[0]) {
                                    fields.push({
                                        name: k,
                                        internal: typeof k,
                                        internalType: typeof k,
                                        format: typeof k
                                    });
                                }
                                let rows = toArray(orows, fields);
                                resolve({
                                    rowCount: rows.length,
                                    rows: rows,
                                    fields: fields
                                });
                            } else {
                                let query = false;
                                try {
                                    if (args.length == 0) {
                                        await promise(db, "run", "CREATE TEMP VIEW query__tmp AS " + sql, args);
                                    } else {
                                        await promise(db, "run", "CREATE TEMP VIEW query__tmp AS " + inject(sql, args));
                                    }
                                    query = true;
                                } catch (_) {
                                    console.log(_);
                                };    
                                if (query) {
                                    qfields = await promise(db, "all", "PRAGMA table_info(query__tmp)");
                                    await promise(db, "run", "DROP VIEW query__tmp");
                                    orows = await promise(db, "all", sql, args);
                                    await promise(db, "run", "COMMIT");
                                    let fields = buildFields(qfields);
                                    let rows = toArray(orows, fields);
                                    resolve({
                                        rowCount: rows.length,
                                        rows: rows,
                                        fields: fields
                                    });
                                } else {
                                    try {
                                        await promise(db, "run", sql, args);
                                    } catch (run_error) {
                                        try {
                                            await promise(db, "exec", sql, args);
                                        } catch (exec_error) {
                                            if (exec_error.message == 'Argument 1 must be a function') {
                                                throw run_error;
                                            } else {
                                                throw exec_error;
                                            }
                                        }
                                    }
                                    await promise(db, "run", "COMMIT");
                                    resolve({ success: true });
                                }
                            }
                        } catch (e) {
                            try {
                                await promise(db, "run", "ROLLBACK");
                            } catch (_) { }
                            reject(e);
                        } finally {
                            try {
                                await promise(db, "close");
                            } catch (_) { }
                        }
                    }
                });
        } catch (e) {
            reject(e);
        }
    });
}

module.exports = { connect, types, internalTypeToType, createDB, updateDB, execDB }