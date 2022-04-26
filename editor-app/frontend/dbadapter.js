(() => {

    let adapter = (db) => {
        function tables() {
            return new Promise((resolve, reject) => {
                db.transaction(function (tx) {
                    tx.executeSql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__WebKitDatabaseInfoTable__'`, [],
                        (tx, r) => {
                            let tables = [];
                            for (let i = 0; i < r.rows.length; i++) {
                                tables.push(r.rows[i].name);
                            }
                            resolve(tables);
                        },
                        (tx, err) => {
                            reject(err ? err : tx);
                            return true;
                        });
                });
            });
        }

        function createDB(schema, force = false) {
            return new Promise((resolve, reject) => {
                tables().then((tables) => {
                    if (tables.length > 0) {
                        reject(new Error("DB is not empty"));
                    } else {
                        let tasks = window.editorMergeUtils.schemaToSql(schema);
                        if (tasks.warnings.length > 0 && !force) {
                            reject(new Error("SQL yields these warnings: " + tasks.warnings.join('\n')));
                        } else {
                            let sql = tasks.sql.split(';'); // break individual sql statement
                            let i = 0;
                            while (i < sql.length) {
                                if (sql[i].trim() == "") {
                                    sql.splice(i, 1);
                                } else {
                                    i++;
                                }
                            }
                            let ierr = undefined;
                            db.transaction((tx) => {
                                let count = 0;
                                for (let i = 0; i < sql.length; i++) {
                                    tx.executeSql(sql[i].replace(/\n/g, " "), [], (tx, r) => {
                                        count++;
                                        if (count == sql.length) {
                                            resolve();
                                        }
                                    }, (tx, err) => {
                                        console.log(sql[i]);
                                        ierr = err;
                                        return true;
                                    });
                                }
                            }, (tx, err) => {
                                reject(err ? err : (ierr ? ierr : tx));
                                return true;
                            });
                        }
                    }
                });
            });
        }


        function clearDB() {
            return new Promise((resolve, reject) => {
                tables().then((tables) => {
                    let ierr = undefined;
                    db.transaction((tx) => {
                        function attemptDelete() {
                            // PRAGMA is forbidden, so cannot figure out dependencies nor disable FK
                            // API does not allow deleting the DB either
                            // we will brute force the deletion : hammer DELETE FROM and DROP TABLE until it works
                            if (tables.length == 0) {
                                resolve();
                                return;
                            }
                            let count = 0;
                            let todel = [];
                            for (let i = 0; i < tables.length; i++) {
                                tx.executeSql(`DROP TABLE ${tables[i]}`, [], (tx, r) => {
                                    todel.push(i);
                                    next();
                                }, next);
                            }
                            function next() {
                                count++;
                                if (count == tables.length) {
                                    // came back from all DELETE FROMs,
                                    if (todel.length == 0) {
                                        // rollback transaction
                                        tx.executeSql(`DROP TABLE ${tables[0]}`, [], (tx, r) => {
                                        }, (tx, err) => {
                                            ierr = err;
                                            return true;
                                        });
                                        reject(new Error("Cannot delete anymore tables"));
                                    } else {
                                        todel.sort((a, b) => a - b);
                                        // delete in order
                                        for (let i = todel.length - 1; i >= 0; i--) {
                                            tables.splice(todel[i], 1);
                                        }
                                        attemptDelete();
                                    }
                                }
                            }
                        }
                        attemptDelete();
                    }, (tx, err) => {
                        reject(err ? err : (ierr ? ierr : tx));
                        return true;
                    });
                })
            });
        }

        function deleteAllTuplesDB() {
            return new Promise((resolve, reject) => {
                tables().then((tables) => {
                    let ierr = undefined;
                    db.transaction((tx) => {
                        function attemptDelete() {
                            // PRAGMA is forbidden, so cannot figure out dependencies nor disable FK
                            if (tables.length == 0) {
                                resolve();
                                return;
                            }
                            let count = 0;
                            let todel = [];
                            for (let i = 0; i < tables.length; i++) {
                                tx.executeSql(`DELETE FROM ${tables[i]}`, [], (tx, r) => {
                                    todel.push(i);
                                    next();
                                }, next);
                            }
                            function next() {
                                count++;
                                if (count == tables.length) {
                                    // came back from all DELETE FROMs,
                                    if (todel.length == 0) {
                                        // rollback transaction
                                        tx.executeSql(`DELETE FROM ${tables[0]}`, [], (tx, r) => {
                                        }, (tx, err) => {
                                            ierr = err;
                                            return true;
                                        });
                                        reject(new Error("Cannot delete anymore tuples"));
                                    } else {
                                        todel.sort((a, b) => a - b);
                                        // delete in order
                                        for (let i = todel.length - 1; i >= 0; i--) {
                                            tables.splice(todel[i], 1);
                                        }
                                        attemptDelete();
                                    }
                                }
                            }
                        }
                        attemptDelete();
                    }, (tx, err) => {
                        reject(err ? err : (ierr ? ierr : tx));
                        return true;
                    });
                })
            });
        }


        function queryDB(sql, parameters = []) {
            return new Promise((resolve, reject) => {
                let ierr;
                db.transaction((tx) => {
                    tx.executeSql(sql, parameters, (tx, r) => {
                        resolve([...r.rows]);
                    }, (tx, err) => {
                        ierr = err;
                        return true;
                    });
                }, (tx, err) => {
                    reject(err ? err : (ierr ? ierr : tx));
                    return true;
                });
            });
        }

        function infoQueryDB(sql, parameters = []) {
            return new Promise((resolve, reject) => {
                let ierr;
                db.transaction((tx) => {
                    tx.executeSql(sql, parameters, (tx, r) => {
                        resolve(r);
                    }, (tx, err) => {
                        ierr = err;
                        return true;
                    });
                }, (tx, err) => {
                    reject(err ? err : (ierr ? ierr : tx));
                    return true;
                });
            });
        }

        function insertDB(table, fields, pks) {
            return new Promise((resolve, reject) => {
                let ierr;
                db.transaction((tx) => {
                    let questions = [];
                    let params = [];
                    for (let k in fields) {
                        questions.push('?');
                        params.push(fields[k]);
                    }
                    tx.executeSql(`INSERT INTO ${table} (${Object.keys(fields).join(',')}) VALUES (${questions.join(',')})`, params, (tx, r) => {
                        let where = [];
                        let params = [];
                        for (let i = 0; i < pks.length; i++) {
                            if (pks[i] in fields) {
                                where.push(`${pks[i]}=?`);
                                params.push(fields[pks[i]]);
                            } else {
                                where.push(`${pks[i]}=(SELECT MAX(${pks[i]}) FROM ${table})`);
                            }
                        }
                        tx.executeSql(`SELECT * FROM ${table} WHERE ${where.join(' AND ')}`, params, (tx, r) => {
                            resolve([...r.rows][0]);
                        }, (tx, err) => {
                            ierr = err;
                            return true;
                        });
                    }, (tx, err) => {
                        ierr = err;
                        return true;
                    });
                }, (tx, err) => {
                    reject(err ? err : (ierr ? ierr : tx));
                    return true;
                });
            });
        }

        function updateDB(table, fields, where, whrparams) {
            return new Promise((resolve, reject) => {
                let ierr;
                db.transaction((tx) => {
                    let params = [];
                    let set = [];
                    for (let f in fields) {
                        params.push(fields[f]);
                        set.push(`${f}=?`);
                    }
                    // find all records first
                    tx.executeSql(`SELECT * FROM ${table} ${where.trim().length > 0 ? `WHERE ${where}` : ""}`, whrparams, (tx, r) => {
                        let records = [...r.rows];
                        params.push.apply(params, whrparams);
                        tx.executeSql(`UPDATE ${table} SET ${set.join(',')} ${where.trim().length > 0 ? `WHERE ${where}` : ""}`, params, (tx, r) => {
                            if (r.rowsAffected==records.length) {
                                for(let i=0; i<records.length; i++) {
                                    for(let k in fields) {
                                        records[i][k]=fields[k];
                                    }
                                }
                                resolve(records);
                                return;
                            }
                            // search back all records => this is broken with date and time fields
                            // SQLite3 claime date fields are stored as text using ISO8601 format
                            // this is only partially true : yes it is the format you are supposed to use when inserting or updating
                            // but when requesting the data back, you get back something formatted according to current locale
                            // and you are supposed to use a formatting function (date(), time(), ...) to get back the ISO8601 format
                            let all = [];
                            let condition = [];
                            for (let f in fields) {
                                condition.push(`${f}=?`);
                                all.push(fields[f]);
                            }
                            let recordsCond = [];
                            if (where.trim().length > 0) {
                                condition.push("(" + where + ")");
                                all.push.apply(all, whrparams);
                            }
                            for (let i = 0; i < records.length; i++) {
                                let recordCond = [];
                                for (let f in records[i]) {
                                    if (!(f in fields)) {
                                        recordCond.push(`${f}=?`);
                                        all.push(records[i][f]);
                                    }
                                }
                                if (recordCond.length > 0) {
                                    recordsCond.push("(" + recordCond.join(' AND ') + ")");
                                }
                            }
                            if (recordsCond.length > 0) {
                                condition.push("(" + recordsCond.join(' OR ') + ")");
                            }
                            tx.executeSql(`SELECT * FROM ${table} WHERE ${condition.join(' AND ')}`, all, (tx, r) => {
                                resolve([...r.rows]);
                            }, (tx, err) => {
                                ierr = err;
                                return true;
                            })
                        }, (tx, err) => {
                            ierr = err;
                            return true;
                        });

                    }, (tx, err) => {
                        ierr = err;
                        return true;
                    });
                }, (tx, err) => {
                    reject(err ? err : (ierr ? ierr : tx));
                    return true;
                });
            });
        }

        function deleteDB(table, where, whrparams) {
            return new Promise((resolve, reject) => {
                let ierr;
                db.transaction((tx) => {
                    // find all records first
                    tx.executeSql(`SELECT * FROM ${table} ${where.trim().length > 0 ? `WHERE ${where}` : ""}`, whrparams, (tx, r) => {
                        let rows = [...r.rows];
                        tx.executeSql(`DELETE FROM ${table} ${where.trim().length > 0 ? `WHERE ${where}` : ""}`, whrparams, (tx, r) => {
                            resolve(rows);
                        }, (tx, err) => {
                            ierr = err;
                            return true;
                        });
                    }, (tx, err) => {
                        ierr = err;
                        return true;
                    });
                }, (tx, err) => {
                    reject(err ? err : (ierr ? ierr : tx));
                    return true;
                });
            });
        }

        function dumpDB() {
            return new Promise((resolve, reject) => {
                tables().then((tables) => {
                    let ierr;
                    db.transaction((tx) => {
                        let dump = {};
                        let count = 0;
                        let total = 0;
                        let finished = false;
                        for (let i = 0; i < tables.length; i++) {
                            total++;
                            tx.executeSql(`SELECT * FROM ${tables[i]}`, [], (tx, r) => {
                                dump[tables[i]] = [...r.rows];
                                count++;
                                if (count == tables.length) {
                                    resolve(dump);
                                }
                            }, (tx, err) => {
                                ierr = err;
                                return true;
                            });
                        }
                        finished = true;
                        if (total == count) resolve(dump);
                    }, (tx, err) => {
                        reject(err ? err : (ierr ? ierr : tx));
                        return true;
                    });
                }, (err) => {
                    reject(err);
                });
            })
        }

        function setDB(odump, silent = true) {
            let dump = {};
            for (let table in odump) dump[table] = odump[table];
            return new Promise((resolve, reject) => {
                deleteAllTuplesDB().then(() => {
                    // once again, PRAGMA is unavailable, so we'll force insert everything
                    let ierr = undefined;
                    db.transaction((tx) => {
                        function attemptInsertTable(table, success, error) {
                            let data = dump[table];
                            let hasError = false;
                            let count = 0;
                            if (data.length == 0) {
                                success();
                                return;
                            }
                            for (let i = 0; i < data.length; i++) {
                                let row = data[i];
                                let questions = [];
                                let params = [];
                                for (let f in row) {
                                    questions.push('?');
                                    params.push(row[f]);
                                }
                                tx.executeSql(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${questions.join(',')})`, params, (tx, r) => {
                                    if (hasError) return;
                                    count++;
                                    if (count == data.length) {
                                        success();
                                    }
                                }, (tx, err) => {
                                    if (hasError) return;
                                    hasError = true;
                                    return error(tx, err);
                                });
                            }
                        }
                        function attemptInsert() {
                            // PRAGMA is forbidden, so cannot figure out dependencies nor disable FK
                            // API does not allow deleting the DB either
                            // we will brute force the deletion : hammer DELETE FROM and DROP TABLE until it works
                            if (Object.keys(dump).length == 0) {
                                resolve();
                                return;
                            }
                            let count = 0;
                            let todel = [];
                            for (let table in dump) {
                                tx.executeSql(`DELETE FROM ${table}`, [], (tx, r) => {
                                    attemptInsertTable(table, () => {
                                        todel.push(table);
                                        next();
                                    }, next)
                                }, (tx, err) => {
                                    ierr = err;
                                    next();
                                });
                            }
                            function next() {
                                count++;
                                if (count == Object.keys(dump).length) {
                                    // came back from all INSERTs,
                                    if (todel.length == 0) { // but could not insert elements anymore
                                        if (silent) {
                                            resolve();
                                        } else {
                                            // rollback transaction
                                            let table = Object.keys(dump)[0];
                                            attemptInsertTable(table, () => { }, (tx, err) => {
                                                ierr = err;
                                                return true;
                                            });
                                            reject(new Error("Cannot insert anymore tuples"));
                                        }
                                    } else {
                                        for (let i = 0; i < todel.length; i++) {
                                            delete dump[todel[i]];
                                        }
                                        attemptInsert();
                                    }
                                }
                            }
                        }
                        attemptInsert();
                    }, (tx, err) => {
                        reject(err ? err : (ierr ? ierr : tx));
                        return true;
                    });
                }, (err) => {
                    reject(err);
                })
            });
        }




        function syncTableDB(table, array, where = "", whereparams, pks, map = null, doinsert = true, doupdate = true, dodelete = true) {
            return new Promise((resolve, reject) => {
                db.transaction((tx) => {
                    let operations = [];
                    if (dodelete) {
                        // assemble all pks from array
                        let items = [];
                        for (let i = 0; i < array.length; i++) {
                            let item = [];
                            for (let j = 0; j < pks.length; j++) {
                                let v = array[i][pks[j]];
                                if (v !== undefined && v !== null && v !== "") {
                                    item.push(v);
                                } else {
                                    item = null;
                                    break;
                                }
                            }
                            if (item != null) items.push(item);
                        }
                        // issue a delete statement for all tuples in DB that do not have the right PK
                        let sql = [];
                        sql.push(`DELETE FROM ${table} `);
                        let sep = "WHERE "
                        let params = [];
                        if (where != "") {
                            sql.push(`WHERE ${where}`);
                            params.push.apply(params, whereparams);
                            sep = " AND ";
                        }
                        for (let i = 0; i < items.length; i++) {
                            sql.push(sep);
                            sql.push('(');
                            sep = " AND ";
                            let sub = [];
                            for (let j = 0; j < pks.length; j++) {
                                sub.push(`${pks[j]}<>?`);
                                params.push(items[i][j]);
                            }
                            sql.push(sub.join(' OR ') + ')');
                        }
                        operations.push({
                            sql: sql.join(''),
                            params: params,
                            collect: false
                        });
                    }
                    for (let i = 0; i < array.length; i++) {
                        let row = array[i];
                        function get(k) {
                            if (map == null) {
                                return row[k];
                            } else {
                                if (k in map) {
                                    if ("k" in map[k]) {
                                        return row[map[k].k];
                                    } else if ("v" in map[k]) {
                                        return map[k].v;
                                    }
                                }
                            }
                        }
                        let imap = map;
                        if (imap == null) {
                            imap = {};
                            for (k in row) imap[k] = k;
                        }
                        if (doinsert && doupdate) {
                            // use upsert statements for all rows in array
                            let sql = [];
                            let params = [];
                            sql.push(`INSERT INTO ${table} (`);
                            let sub = [];
                            let cols = [];
                            let conflicts = [];
                            for (let k in imap) {
                                let v = get(k);
                                if (pks.indexOf(k) != -1) { // that's a PK
                                    if (v !== undefined && v !== null && v !== "") {
                                        // a value is given for this PK, it might be a conflict
                                        conflicts.push(k);
                                    } else {
                                        // a value is not given for this PK, do not try to insert it, let the DB autogenerate it
                                        continue;
                                    }
                                }
                                cols.push(k);
                                sub.push('?');
                                params.push(v);
                            }
                            sql.push(cols.join(','));
                            sql.push(') VALUES (');
                            sql.push(sub.join(','));
                            sql.push(`)`);
                            if (conflicts.length > 0) {
                                /* // ON CONFLICT does not seem to be supported by the SQLite version of the browser even though its version > 3.24
                                    sql.push(` ON CONFLICT (${conflicts.join(',')}) DO UPDATE SET `);
                                    sub = [];
                                    for (let k in imap) {
                                        if (pks.indexOf(k) != -1) { // that's a PK
                                            continue;
                                        }
                                        sub.push(`${k}=?`);
                                        params.push(get(k));
                                    }
                                    sql.push(sub.join(','));
                                    let sep = " WHERE "
                                    if (where != "") {
                                        sql.push(` WHERE ${where}`);
                                        params.push.apply(params,whereparams);
                                        sep = " AND ";
                                    }
                                    for (let i = 0; i < conflicts.length; i++) {
                                        sql.push(`${sep}${conflicts[i]}=?`);
                                        params.push(get(conflicts[i]));
                                        sep = " AND ";
                                }*/ // instead, when the insert fails, we use an update operation instead
                                let sql2 = [];
                                let params2 = [];
                                sql2.push(`UPDATE ${table} SET `);
                                sub = [];
                                for (let k in imap) {
                                    if (pks.indexOf(k) != -1) { // that's a PK
                                        continue;
                                    }
                                    sub.push(`${k}=?`);
                                    params2.push(get(k));
                                }
                                sql2.push(sub.join(','));
                                let sep = " WHERE "
                                if (where != "") {
                                    sql2.push(` WHERE ${where}`);
                                    params2.push.apply(params2, whereparams);
                                    sep = " AND ";
                                }
                                for (let i = 0; i < conflicts.length; i++) {
                                    sql2.push(`${sep}${conflicts[i]}=?`);
                                    params2.push(get(conflicts[i]));
                                    sep = " AND ";
                                }
                                operations.push({
                                    sql: sql.join(''),
                                    params: params,
                                    onerrorsql: sql2.join(''),
                                    onerrorparams: params2,
                                    collect: false
                                });
                            } else {
                                operations.push({
                                    sql: sql.join(''),
                                    params: params,
                                    onerrorsql: sql.join(''),
                                    onerrorparams: params,
                                    collect: false
                                });

                            }
                            sql = [];
                            params = [];
                            sql.push(`SELECT * FROM ${table} WHERE `);
                            let sep = "";
                            for (let i = 0; i < pks.length; i++) {
                                sql.push(sep);
                                sep = " AND ";
                                if (conflicts.indexOf(pks[i]) == -1) { // no conflict on PK means it is autogenerated
                                    sql.push(`${pks[i]}=(SELECT MAX(${pks[i]}) FROM ${table})`);
                                } else {
                                    sql.push(`${pks[i]}=?`);
                                    params.push(get(pks[i]));
                                }
                            }
                            operations.push({
                                sql: sql.join(''),
                                params: params,
                                collect: true
                            });
                        } else if (doinsert) {
                            // use insert statements for all rows in array, and ignore on conflict
                            let sql = [];
                            let params = [];
                            sql.push(`INSERT INTO ${table} (`);
                            let sub = [];
                            for (let k in imap) {
                                let v = get(k);
                                if (pks.indexOf(k) != -1) { // that's a PK
                                    if (!(v !== undefined && v !== null && v !== "")) {
                                        // a value is not given for this PK, do not try to insert it, let the DB autogenerate it
                                        continue;
                                    }
                                }
                                sub.push(k);
                            }
                            sql.push(sub.join(','));

                            sql.push(') VALUES (');
                            sub = [];
                            let conflicts = [];
                            for (let k in imap) {
                                let v = get(k);
                                if (pks.indexOf(k) != -1) { // that's a PK
                                    if (v !== undefined && v !== null && v !== "") {
                                        // a value is given for this PK, it might be a conflict
                                        conflicts.push(k);
                                    } else {
                                        // a value is not given for this PK, do not try to insert it, let the DB autogenerate it
                                        continue;
                                    }
                                }
                                sub.push('?');
                                params.push(v);
                            }
                            sql.push(sub.join(','));
                            sql.push(`)`);
                            if (conflicts.length > 0) {
                                //                            sql.push(` ON CONFLICT (${conflicts.join(',')}) DO NOTHING`);
                                // does not seem to be supported by the DB, work around:
                                operations.push({
                                    sql: sql.join(''),
                                    params: params,
                                    onerror: 'SELECT true',
                                    onerrorparams: params,
                                    collect: false
                                });
                            } else {
                                operations.push({
                                    sql: sql.join(''),
                                    params: params,
                                    collect: false
                                });
                            }
                            sql = [];
                            params = [];
                            sql.push(`SELECT * FROM ${table} WHERE `);
                            let sep = "";
                            for (let i = 0; i < pks.length; i++) {
                                sql.push(sep);
                                sep = " AND ";
                                if (conflicts.indexOf(pks[i]) == -1) { // no conflict on PK means it is autogenerated
                                    sql.push(`${pks[i]}=(SELECT MAX(${pks[i]}) FROM ${table})`);
                                } else {
                                    sql.push(`${pks[i]}=?`);
                                    params.push(get(pks[i]));
                                }
                            }
                            operations.push({
                                sql: sql.join(''),
                                params: params,
                                collect: true
                            });
                        } else if (doupdate) {
                            // use only update statements for all rows in array
                            let sql = [];
                            let params = [];
                            let conflicts = [];
                            for (let k in imap) {
                                let v = get(k);
                                if (pks.indexOf(k) != -1) { // that's a PK
                                    if (v !== undefined && v !== null && v !== "") {
                                        // a value is given for this PK, it might be a conflict
                                        conflicts.push(k);
                                    } else {
                                        // a value is not given for this PK, do not try to insert it
                                        continue;
                                    }
                                }
                            }
                            if (conflicts.length > 0) {
                                sql.push(`UPDATE ${table} SET `);
                                sub = [];
                                for (let k in imap) {
                                    if (pks.indexOf(k) != -1) { // that's a PK
                                        continue;
                                    }
                                    sub.push(`${k}=?`);
                                    params.push(get(k));
                                }
                                sql.push(sub.join(','));
                                let sep = " WHERE "
                                if (where != "") {
                                    sql.push(` WHERE ${where}`);
                                    params.push.apply(params, whereparams);
                                    sep = " AND ";
                                }
                                for (let i = 0; i < conflicts.length; i++) {
                                    sql.push(`${sep}${conflicts[i]}=?`);
                                    params.push(get(conflicts[i]));
                                    sep = " AND ";
                                }
                            }
                            if (sql.length > 0) {
                                operations.push({
                                    sql: sql.join(''),
                                    params: params,
                                    collect: false
                                });
                                sql = [];
                                params = [];
                                sql.push(`SELECT * FROM ${table} WHERE `);
                                let sep = "";
                                for (let i = 0; i < pks.length; i++) {
                                    sql.push(sep);
                                    sep = " AND ";
                                    sql.push(`${pks[i]}=?`);
                                    params.push(get(pks[i]));
                                }
                                operations.push({
                                    sql: sql.join(''),
                                    params: params,
                                    collect: true
                                });
                            }
                        }
                    }
                    if (operations.length == 0) {
                        resolve([]);
                    } else {
                        let count = 0;
                        function tryResolve() {
                            count++;
                            if (count == operations.length) {
                                resolve(ret);
                            }
                        }
                        let ret = [];
                        for (let i = 0; i < operations.length; i++) {
                            if (operations[i].collect) {
                                tx.executeSql(operations[i].sql, operations[i].params, (tx, r) => {
                                    ret.push.apply(ret, [...r.rows]);
                                    tryResolve();
                                }, (tx, err) => {
                                    if ("onerrorsql" in operations[i]) {
                                        tx.executeSql(operations[i].onerrorsql, operations[i].onerrorparams, (tx, r) => {
                                            ret.push.apply(ret, [...r.rows]);
                                            tryResolve();
                                        }, (tx, err) => {
                                            if (err === undefined) err = tx;
                                            err.operation = operations[i];
                                            reject(err);
                                            return true;
                                        });
                                    } else {
                                        if (err === undefined) err = tx;
                                        err.operation = operations[i];
                                        reject(err);
                                        return true;
                                    }
                                })
                            } else {
                                tx.executeSql(operations[i].sql, operations[i].params, (tx, r) => {
                                    tryResolve();
                                }, (tx, err) => {
                                    if ("onerrorsql" in operations[i]) {
                                        tx.executeSql(operations[i].onerrorsql, operations[i].onerrorparams, (tx, r) => {
                                            tryResolve();
                                        }, (tx, err) => {
                                            if (err === undefined) err = tx;
                                            err.operation = operations[i];
                                            reject(err);
                                            return true;
                                        });
                                    } else {
                                        if (err === undefined) err = tx;
                                        err.operation = operations[i];
                                        reject(err);
                                        return true;
                                    }
                                })
                            }
                        }
                    }
                });
            });
        }

        return {
            tables,
            create: createDB,
            clear: clearDB,
            dump: dumpDB,
            set: setDB,
            insert: insertDB,
            update: updateDB,
            delete: deleteDB,
            query: queryDB,
            infoQuery: infoQueryDB,
            syncTable: syncTableDB
        }
    }

    function querySpliter(query, withIndex=false) {
        let indexes=[];
        let ret = [];
        let state = null;
        let start = 0;
        let i = 0;
        while (i < query.length) {
            let c = query.charAt(i);
            if (state != null) {
                if (c == state) {
                    state = null;
                }
                i++;
            } else if (`'"`.indexOf(c) != -1) {
                state = c;
                i++;
            } else if (c == "[") {
                state = "]";
                i++;
            } else {
                let inc = false;
                while ("<>= (),\n+-*/%|".indexOf(c) != -1) {
                    if (i > start) {
                        indexes.push(start);
                        ret.push(query.substring(start, i));
                    }
                    indexes.push(i);
                    ret.push(c);
                    i++;
                    inc = true;
                    start = i;
                    if (i >= query.length) break;
                    c = query.charAt(i);
                }
                if (!inc) i++;
            }
        }
        indexes.push(start);
        ret.push(query.substring(start));
        if (withIndex) {
            return {tokens:ret,indexes}
        } else {
            return ret;
        }
    }

    function prepQuery(query, schema) {
        function inferType(n) {
            n = n.toUpperCase();
            if (n.startsWith("MAX(") || n.startsWith("MIN(") || n.startsWith("AVG(") || n.startsWith("COUNT(") || n.startsWith("SUM(")) {
                return "integer";
            }
            return "unknown";
        }
        let {tokens, indexes} = querySpliter(query,true);
        // isolate sub queries first

        let alias = {};
        // fill up aliases first
        let idx = 0;
        while (idx < tokens.length && tokens[idx].toUpperCase() != "FROM") idx++
        let state = 0;
        let table = "";
        let regex = /^[a-zA-Z].*/;
        let froms = [];
        let aliasFroms = [];

        while (idx < tokens.length && ["WHERE", "ORDER", "GROUP", "HAVING"].indexOf(tokens[idx].toUpperCase()) == -1) {
            if (["INNER", "OUTER", "LEFT", "RIGHT", "FULL", ",", "JOIN"].indexOf(tokens[idx].toUpperCase()) != -1) {
                state = 0;
            } else if (tokens[idx].toUpperCase() == "ON") {
                state = 2;
            } else if (state == 0) {
                if (tokens[idx] in schema) {
                    state = 1;
                    table = tokens[idx];
                    froms.push(table);
                    aliasFroms.push(table);
                }
            } else if (state == 1 && tokens[idx].match(regex)) {
                alias[tokens[idx]] = table;
                aliasFroms.pop();
                aliasFroms.push(tokens[idx]);
                state = 2;
            }
            idx++;
        }
        // figure out types for result query
        let fields = [];
        idx = 0;
        while (idx < tokens.length && tokens[idx].toUpperCase() != "SELECT") idx++
        idx++;
        state = 0;
        let all = [];
        let allindexes=[];
        let allindexend=[];
        let current = [];
        let start=indexes[idx];
        while (idx < tokens.length && ["FROM", "WHERE", "ORDER", "GROUP", "HAVING"].indexOf(tokens[idx].toUpperCase()) == -1) {
            if (tokens[idx] == "(") { // skip till ')'
                let depth = 0;
                do {
                    current.push(tokens[idx]);
                    if (tokens[idx] == "(") depth++;
                    if (tokens[idx] == ")") depth--;
                    idx++;
                } while (idx < tokens.length && depth > 0);
            } else {
                if (tokens[idx] == ",") {
                    allindexes.push(start);
                    allindexend.push(indexes[idx]);
                    all.push(current.join('').trim());
                    current = [];
                    start=indexes[idx]+1;
                } else {
                    current.push(tokens[idx]);
                }
                idx++;
            }
        }
        if (current.length > 0) {
            allindexes.push(start);
            allindexend.push(indexes[idx]);
            all.push(current.join('').trim());
        }
        // adjust indexes to skip spaces, tabs and returns
        for(let i=0; i<allindexes.length; i++) {
            while(allindexes[i]<query.length && " \t\n".indexOf(query[allindexes[i]])!=-1) allindexes[i]++;
            while(allindexend[i]>0 && " \t\n".indexOf(query[allindexend[i]-1])!=-1) allindexend[i]--;
        }
        for (let i = 0; i < all.length; i++) {
            // isolate AS colname from all[i]
            let sel = all[i];
            let ups = querySpliter(all[i]);
            let colname;
            let state = 0;
            for (let j = 0; j < ups.length; j++) {
                if (state == 0 && ups[j].toUpperCase() == "AS") {
                    state = 1;
                    all[i] = ups.slice(0, j - 1).join('').trim(); // keep whatever at the left of AS
                } else if (state == 1 && ups[j] != " ") {
                    colname = ups[j];
                    state = 2;
                } else if (state == 2 && ups[j] != " ") {
                    throw new Error("Syntax error for " + sel);
                }
            }
            if (all[i] == "*") {
                // expands *
                for (let j = 0; j < aliasFroms.length; j++) {
                    let short = aliasFroms[j];
                    let table = froms[j];
                    if (table in schema) {
                        for (let column in schema[table]) {
                            if (column == "coords___") continue;
                            fields.push({
                                shortname: column,
                                longname: short + "." + column,
                                tablename: table + "." + column,
                                colname: column,
                                type: schema[table][column].type,
                                index:{start:allindexes[i], end:allindexend[i]}
                            });
                        }
                    }
                }
            } else if (all[i].indexOf("(") != -1) {
                // a function is involved
                fields.push({
                    shortname: all[i],
                    longname: all[i],
                    tablename: all[i],
                    colname: colname ? colname : all[i],
                    type: inferType(all[i]),
                    index:{start:allindexes[i], end:allindexend[i]}
                });
            } else if (all[i].endsWith('.*')) {
                // expands table.*
                let short = all[i].substring(0, all[i].length - 2);
                let table = (short in alias) ? alias[short] : short;
                if (table in schema) {
                    for (let column in schema[table]) {
                        if (column == "coords___") continue;
                        fields.push({
                            shortname: column,
                            longname: short + "." + column,
                            tablename: table + "." + column,
                            colname: short + "." + column,
                            type: schema[table][column].type,
                            index:{start:allindexes[i], end:allindexend[i]}
                        });
                    }
                } else {
                    fields.push({
                        shortname: all[i],
                        longname: all[i],
                        tablename: all[i],
                        colname: all[i],
                        type: 'unknown',
                        index:{start:allindexes[i], end:allindexend[i]}
                    })
                }
            } else if (all[i].indexOf('.') != -1) {
                // splits table.column
                let idx = all[i].indexOf('.');
                let short = all[i].substring(0, idx);
                let table = (short in alias) ? alias[short] : short;
                let column = all[i].substring(idx + 1);
                if (table in schema) {
                    if (column in schema[table]) {
                        if (column == "coords___") continue;
                        fields.push({
                            shortname: column,
                            longname: short + "." + column,
                            tablename: table + "." + column,
                            colname: colname ? colname : column,
                            type: schema[table][column].type,
                            index:{start:allindexes[i], end:allindexend[i]}
                        })
                    } else {
                        fields.push({
                            shortname: column,
                            longname: all[i],
                            tablename: all[i],
                            colname: colname ? colname : column,
                            type: 'unknown',
                            index:{start:allindexes[i], end:allindexend[i]}
                        })
                    }
                } else {
                    fields.push({
                        shortname: column,
                        longname: all[i],
                        tablename: all[i],
                        colname: colname ? colname : column,
                        type: 'unknown',
                        index:{start:allindexes[i], end:allindexend[i]}
                    })
                }
            } else {
                // find first table with this name
                let found = false;
                for (let i = 0; i < aliasFroms.length; i++) {
                    let short = aliasFroms[i];
                    let table = froms[i];
                    if (all[i] in schema[table]) {
                        found = true;
                        fields.push({
                            shortname: all[i],
                            longname: short + "." + all[i],
                            fullname: table + "." + all[i],
                            colname: colname ? colname : all[i],
                            type: schema[table][all[i]].type,
                            index:{start:allindexes[i], end:allindexend[i]}
                        });
                        break;
                    }
                }
                if (!found) {
                    fields.push({
                        shortname: all[i],
                        longname: all[i],
                        tablename: all[i],
                        colname: colname ? colname : all[i],
                        type: 'unknown',
                        index:{start:allindexes[i], end:allindexend[i]}
                    });
                }
            }
        }
        // figure out params
        let params = [];
        let pos = [];
        let result = "";
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].match(regex)) {
                let idx = tokens[i].indexOf(".");
                if (idx != -1) {
                    if (!(tokens[i].substring(0, idx) in schema) && !(tokens[i].substring(0, idx) in alias)) {
                        params.push(tokens[i]);
                        tokens[i] = "?";
                        pos.push(result.length);
                    }
                }
            }
            result += tokens[i];
        }
        return {
            query: result,
            pos,
            params: "[" + params.join(',') + "]",
            bareParams: params,
            froms,
            fields,
            alias,
            aliasFroms
        }
    }

    function pksForTable(table, schema) {
        let ret = [];
        if (table in schema) {
            for (let column in schema[table]) {
                if (column == "coords___") continue;
                if (schema[table][column].pk === true) ret.push(column);
            }
        }
        return ret;
    }

    function prepSelect(query, start = 0) {
        let s = querySpliter(query);
        let count = start;
        let map = {};
        let state = 0;
        function formatAs(str) {
            if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith('[') && str.endsWith(']')) || (str.startsWith("'") && str.endsWith("'"))) {
                return "'" + str.substring(1, str.length - 1).replace(/'/g, "") + "'";
            }
            return "'" + str.replace(/'/g, "") + "'";
        }
        for (let i = 0; i < s.length && state != 3; i++) {
            let token = s[i].trim().toUpperCase();
            switch (state) {
                case 0: // preselect
                    if (token == "SELECT") state = 1;
                    break;
                case 1: // in select
                    if (token == "(") { // skip till corresponding )
                        let lvl = 1;
                        i++;
                        let idx = i;
                        while (i < s.length && lvl > 0) {
                            if (s[i] == ")") lvl--;
                            if (s[i] == "(") lvl++;
                            i++;
                        }
                        i--;
                        let sub = s.slice(idx, i).join('');
                        if (sub.trim().toUpperCase().startsWith("SELECT ")) {
                            let ss = prepSelect(sub, count);
                            s.splice(idx, (i - idx), ss.query);
                            count += Object.keys(ss.map).length;
                            for (let k in ss.map) map[k] = ss.map[k];
                            i = idx + 2;
                        }
                    } else if (token == "FROM") {
                        state = 3;
                    } else if (token == "AS") {
                        state = 2;
                    }
                    break;
                case 2: // right after AS
                    if (token != "") {
                        map[`_____AS__NAME__${count}`] = formatAs(s[i]);
                        s[i] = `_____AS__NAME__${count}`;
                        count++;
                        state = 1;
                    }
                    break;
            }
        }
        return {
            map,
            originalQuery: query,
            query: s.join('')
        };
    }

    function setAlias(struct, map) {
        if (struct == null) {
        } else if (Array.isArray(struct)) {
            for (let k in struct) setAlias(struct[k], map);
        } else if (struct.constructor.name === "Object") {
            if ("alias" in struct && struct.alias in map) {
                struct.alias = map[struct.alias];
            }
            for (let k in struct) setAlias(struct[k], map);
        }
    }

    adapter.prepQuery = prepQuery;
    adapter.querySpliter = querySpliter;
    adapter.pksForTable = pksForTable;
    adapter.prepSelect = prepSelect;
    adapter.setAlias = setAlias;

    if (typeof window != "undefined") { window.dbadapter = adapter; }
    if (typeof module != "undefined" && "exports" in module) { module.exports.dbadapter = adapter; }
})()
