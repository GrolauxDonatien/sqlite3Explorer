const sqlite3 = require('sqlite3');

const {
    toJSType, types, internalTypeToType, buildFields, toArray
} = require('./sqliteutils');

const sqlparser = require('../common-frontend/lib/js-sql-parser-master/dist/parser/sqlParser');

//let sql = "SELECT t1.figid,table2.figid as figid FROM table1 t1, table2";
//let ast = sqlparser.parse(sql);
function fixQueryColumns(array) {
    let colnames = {};
    function getColname(col) {
        if (col.alias != null) return col.alias;
        let two = col.value.split('.');
        switch (two.length) {
            case 1: return two[0];
            case 2: return two[1];
            default: return col.value;
        }
    }
    for (let i = 0; i < array.length; i++) {
        if (array[i].type == 'Identifier') {
            let colname = getColname(array[i]);
            if (colname in colnames) {
                colnames[colname].push(i);
            } else colnames[colname] = [i];
        }
    }
    let allAs = true;
    for (let colname in colnames) {
        if (colnames[colname].length > 1) {
            for (let i = 0; i < colnames[colname].length; i++) {
                let col = array[colnames[colname][i]];
                if (col.alias == null) {
                    allAs = false;
                    col.alias = col.value.split('.').join('_');
                    col.hasAs = true;
                }
            }
        }
    }
    if (allAs) { // could not create explicit AS
        for (let colname in colnames) {
            if (colnames[colname].length > 1) {
                for (let i = 0; i < colnames[colname].length; j++) {
                    let col = array[colnames[colname][i]];
                    col.alias = col.alias + '_' + (i + 1);
                }
            }
        }
    } else { // colnames have changed, try again
        return fixQueryColumns(array);
    }
    return array;
}
//ast.value.selectItems.value = fix(ast.value.selectItems.value);
//sql = sqlparser.stringify(ast);
//console.log(sql);

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
                            if (count == 0) {
                                step2();
                                return;
                            }
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
                                        if (count == 0) step1b();
                                    });
                            }
                        }
                        async function step1b() {
                            let todo = [];
                            let count = Object.keys(tables).length;
                            if (count == 0) step2();
                            for (let k in tables) {
                                db.all(`PRAGMA index_list('${k}')`, (err, indexes) => {
                                    if (err != null) {
                                        reject(err);
                                        return;
                                    }
                                    for (let i = 0; i < indexes.length; i++) {
                                        todo.push({ table: k, index: indexes[i].name });
                                    }
                                    count--;
                                    if (count == 0) step1c(todo);
                                });
                            }
                        }
                        async function step1c(todo) {
                            if (todo.length == 0) {
                                step2();
                                return;
                            }
                            let count = todo.length;
                            for (let i = 0; i < todo.length; i++) {
                                db.get(`PRAGMA index_info('${todo[i].index}')`, (err, row) => {
                                    if (err != null) {
                                        reject(err);
                                        return;
                                    }
                                    tables[todo[i].table][row.name].unique = true;
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
                let conflict = undefined;
                while (true) {
                    // The sqlite driver has a nasty limitation: as tuples are returned as objects indexed on column names, 
                    // queries returning several columns with the same name end up collapsed into a single key.
                    // This code tries to be smart to detect, and resolve the issue.
                    let orows = [];
                    let qfields = [];
                    try {
                        await promise(db, "run", 'BEGIN TRANSACTION');
                        orows = await promise(db, "all", sql);
                        // to detect the issue, we create a view out of the query
                        await promise(db, "run", "CREATE TEMP VIEW query__tmp AS " + sql);
                        // which allows introspecting its structure
                        qfields = await promise(db, "all", "PRAGMA table_info(query__tmp)");
                        await promise(db, "run", "DROP VIEW query__tmp");
                        await promise(db, "run", "COMMIT");
                    } catch (e) {
                        try {
                            await promise(db, "run", "ROLLBACK");
                        } catch (_) { }
                        if (first) {
                            // this is a proper issue with the query
                            reject(e);
                            return;
                        } else {
                            // this is a problem with the rewritten SQL query: exits the break loop
                            break;
                        }
                    }
                    let fields = buildFields(qfields);
                    let ok = true;
                    for (let i = 0; i < fields.length; i++) {
                        // multiple fields with the same name end up with :1, :2, etc added
                        // this detection mechanism could yield false results though...
                        if (fields[i].name.indexOf(':') != -1) {
                            ok = false;
                            if (conflict === undefined) conflict = fields[i].name.split(':')[0];
                            break;
                        }
                    }
                    if (ok) {
                        // no conflicts
                        let rows = toArray(orows, fields);
                        resolve({
                            rowCount: rows.length,
                            rows: rows,
                            fields: fields
                        });
                        return;
                    } else {
                        first = false;
                        oldsql = sql;
                        // rewrite the SQL query to ensure uniqueness of column names
                        try {
                            let ast = sqlparser.parse(sql);
                            ast.value.selectItems.value = fixQueryColumns(ast.value.selectItems.value);
                            sql = sqlparser.stringify(ast);
                        } catch (_) { }
                        if (oldsql == sql) { // did not successfully change to something working right
                            break;
                        }
                    }
                }
                reject(new Error("Query contains several columns of the same name: " + conflict));
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
                                let fields = [];
                                if (orows.length > 0) for (let k in orows[0]) {
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