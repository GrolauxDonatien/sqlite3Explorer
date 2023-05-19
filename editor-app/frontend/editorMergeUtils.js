const editorMergeUtils = (() => {
    Object.equals = (o1, o2) => {
        let i1 = Object.keys(o1);
        i1.sort();
        let i2 = Object.keys(o2);
        i2.sort();
        if (i1.length != i2.length) return false;
        for (let i = 0; i < i1.length; i++) {
            if (i2[i] != i1[i]) return false;
            if (o1[i1[i]] instanceof Object && o2[i1[i]] instanceof Object) {
                if (!Object.equals(o1[i1[i]], o2[i1[i]])) return false;
            } else if (o1[i1[i]] != o2[i1[i]]) {
                return false;
            }
        }
        return true;
    }

    const defaults = {};

    const LOCALSETOK = '#1C7727';
    const LOCALSETKO = '#B5FCC0';
    const LOCALUNSET = '#3DFF60';
    const REMOTESETOK = '#466187';
    const REMOTESETKO = '#CEE2FF';
    const REMOTEUNSET = '#729DDB';
    const CONFLICTSETLOCAL = '#124C18';
    const CONFLICTSETREMOTE = '#466186';
    const CONFLICTUNSET = '#FF3200';
    const NEUTRAL = '#000000';
    const CHECKLOCAL="checkslocal___";
    const CHECKREMOTE="checksremote___";

    function unsetfk2() {
        if ("fk2" in schema[target.table][target.column]) {
            colors[target.table][target.column].fk.fk1 = schema[target.table][target.column].fk;
            colors[target.table][target.column].fk.fk2 = schema[target.table][target.column].fk2;
            delete schema[target.table][target.column].fk2;
            delete schema[target.table][target.column].fk;
        }
    }

    function resolveSchema(schema, colors, map) {
        function applyMap(o) {
            if (o && "coords___" in o) {
                if (o.coords___ in map) o.coords___ = map[o.coords___];
            }
        }
        for (let table in colors) {
            applyMap(colors[table]);
            for (let column in colors[table]) {
                if (column.endsWith("___")) continue;
                applyMap(colors[table][column]);
                if ("fk" in schema[table][column] && (colors[table][column].fk.coords___ in map)) {
                    let c = map[colors[table][column].fk.coords___];
                    colors[table][column].fk.coords___ = c;
                    if (c == CONFLICTSETREMOTE) {
                        if (!("fk1" in colors[table][column].fk)) {
                            colors[table][column].fk.fk1 = schema[table][column].fk;
                            colors[table][column].fk.fk2 = schema[table][column].fk2;
                        }
                        delete schema[table][column].fk2;
                        schema[table][column].fk = colors[table][column].fk.fk2;
                    } else if (c == CONFLICTSETLOCAL) {
                        if (!("fk1" in colors[table][column].fk)) {
                            colors[table][column].fk.fk1 = schema[table][column].fk;
                            colors[table][column].fk.fk2 = schema[table][column].fk2;
                        }
                        schema[table][column].fk = colors[table][column].fk.fk1;
                        delete schema[table][column].fk2;
                    }
                }
            }
        }
    }

    function clearRenamedTable(schema, colors, table) {
        if ("renamed" in schema[table].coords___) {
            let saved = schema[table].coords___.renamed;
            let all = $.extend({}, saved); // figure out other name by removing the other keys
            delete all.fks123;
            for (let k in all) {
                if (k.endsWith("_color123")) { delete all[k] };
            }
            delete all[table];
            let other = Object.keys(all)[0];
            delete schema[table];
            schema[table] = saved[table];
            schema[other] = saved[other];
            colors[table] = saved[table + "_color123"];
            colors[other] = saved[other + "_color123"];
            for (let i = 0; i < saved.fks123.length; i++) {
                let fk = saved.fks123[i];
                if ("fk" in fk) {
                    schema[fk.table][fk.column].fk = fk.fk;
                    colors[fk.table][fk.column].fk = fk.colors;
                }
                if ("fk2" in fk) {
                    schema[fk.table][fk.column].fk2 = fk.fk2;
                    colors[fk.table][fk.column].fk = fk.colors;
                }
            }
        }
    }

    function clearSelections(schema, colors) {
        function clear(o) {
            if ("coords___" in o) {
                if (o.coords___ == CONFLICTSETREMOTE || o.coords___ == CONFLICTSETLOCAL) {
                    o.coords___ = CONFLICTUNSET;
                } else if (o.coords___ == LOCALSETOK || o.coords___ == LOCALSETKO) {
                    o.coords___ = LOCALUNSET;
                } else if (o.coords___ == REMOTESETOK || o.coords___ == REMOTESETKO) {
                    o.coords___ = REMOTEUNSET;
                }
            }
        }
        // resplit renamed tables
        for (let table in schema) {
            clearRenamedTable(schema, colors, table);
        }
        // reset schema
        for (let table in schema) {
            clear(colors[table]);
            for (let column in schema[table]) {
                if (column.endsWith("___")) continue;
                clear(colors[table][column]);
                if ("fk" in colors[table][column]) {
                    clear(colors[table][column].fk);
                    if (("fk1" in colors[table][column].fk)) {
                        schema[table][column].fk = colors[table][column].fk.fk1;
                        schema[table][column].fk2 = colors[table][column].fk.fk2;
                        delete colors[table][column].fk.fk1;
                        delete colors[table][column].fk.fk2;
                    }
                }
                if ("renamed" in schema[table][column]) {
                    schema[table][schema[table][column].renamed.name] = schema[table][column].renamed;
                    delete schema[table][column].renamed;
                    delete schema[table].coords___.height;
                }
            }
        }
    }

    function hasUnset(schema, colors) {
        function check(m) {
            if (m.coords___ == CONFLICTUNSET || m.coords___ == LOCALUNSET || m.coords___ == REMOTEUNSET) {
                return true;
            }
            return false;
        }
        for (let table in schema) {
            if (check(colors[table])) return true;
            for (let column in schema[table]) {
                if (column == "checks___") continue;
                if (check(colors[table][column])) return true;
                if ("fk" in schema[table][column]) {
                    if (check(colors[table][column].fk)) return true;
                }
            }
        }
        return false;
    }

    function diffSchemas(local, remote) {
        let schema = {};
        let colors = {};
        function setColumns(table) {
            for (let c in local[table]) {
                if (c.endsWith("___")) continue;
                if (c in remote[table]) {
                    let c1 = $.extend({}, local[table][c]);
                    let c2 = $.extend({}, remote[table][c]);
                    delete c1.fk;
                    delete c2.fk;
                    schema[table][c] = c1;
                    if (Object.equals(c1, c2)) {
                        colors[table][c] = { coords___: NEUTRAL };
                    } else {
                        colors[table][c] = $.extend({ coords___: CONFLICTUNSET }, c2);
                        let conflicts = [];
                        if (c1.internalType != c2.internalType) {
                            conflicts.push(c1.internalType + ' <> ' + c2.internalType);
                        }
                        if (c1.nullable != c2.nullable) {
                            conflicts.push(c1.nullable ? "NULL <> NOT NULL" : "NOT NULL <> NULL");
                        }
                        if (c1.pk != c2.pk) {
                            conflicts.push(c1.pk ? "PK <> NOT PK" : "NOT PK <> PK");
                        }
                        if (c1.unique != c2.unique) {
                            conflicts.push(c1.pk ? "UNIQUE <> NOT UNIQUE" : "NOT UNIQUE <> UNIQUE");
                        }
                        colors[table][c].conflicts = conflicts.join(" / ");
                    }
                } else {
                    schema[table][c] = $.extend({}, local[table][c]);
                    colors[table][c] = { coords___: LOCALUNSET };
                }
            }
            for (let c in remote[table]) {
                if (c.endsWith("___")) continue;
                if (c in schema[table]) continue;
                schema[table][c] = remote[table][c];
                colors[table][c] = { coords___: REMOTEUNSET };
            }
        }
        for (let table in local) { // for tables in local
            if (table in remote) { // that are also in remote
                schema[table] = {};
                schema[table].coords___ = $.extend({}, local[table].coords___);
                delete schema[table].coords___.height;
                delete schema[table].coords___.width;
                colors[table] = { coords___: NEUTRAL };
                setColumns(table); // resolve their columns
                let c1 = local[table].checks___ || [];
                let c2 = remote[table].checks___ || [];
                let same = c1.length == c2.length;
                if (same) {
                    for (let i = 0; i < c1.length; i++) {
                        if (c1[i] != c2[i]) {
                            same = false;
                            break;
                        }
                    }
                }
                if (!same) {
                    colors[table].conflicts___ = "CHECK differs";
                    colors[table][CHECKLOCAL] = c1;
                    colors[table][CHECKREMOTE] = c2;
                    if (!(table in colors)) colors[table] = {};
                    colors[table].coords___ = CONFLICTUNSET;
                }
            } else {
                schema[table] = local[table]; // keep local table
                colors[table] = { coords___: LOCALUNSET };
                for (let c in schema[table]) {
                    if (c.endsWith("___")) continue;
                    colors[table][c] = { coords___: LOCALUNSET };
                }
            }
        }
        for (let table in remote) { // for tables in remote
            if (table in schema) continue; // that are not in local (already processed)
            schema[table] = remote[table]; // keep remote table
            colors[table] = { coords___: REMOTEUNSET };
            for (let c in schema[table]) {
                if (c.endsWith("___")) continue;
                colors[table][c] = { coords___: REMOTEUNSET };
            }
        }
        // what about PKs ?
        for (let table in schema) {
            for (let column in schema[table]) {
                let hasLocalFK = table in local && column in local[table] && "fk" in local[table][column];
                let hasRemoteFk = table in remote && column in remote[table] && "fk" in remote[table][column];
                if (hasLocalFK && hasRemoteFk && Object.equals(local[table][column].fk, remote[table][column].fk)) {
                    schema[table][column].fk = $.extend({}, local[table][column].fk);
                    colors[table][column].fk = { coords___: NEUTRAL };
                } else if (hasLocalFK) {
                    if (hasRemoteFk) {
                        schema[table][column].fk = $.extend({}, local[table][column].fk);
                        schema[table][column].fk2 = $.extend({}, remote[table][column].fk);
                        colors[table][column].fk = { coords___: CONFLICTUNSET };
                    } else {
                        schema[table][column].fk = $.extend({}, local[table][column].fk);
                        colors[table][column].fk = { coords___: LOCALUNSET };
                    }
                } else if (hasRemoteFk) {
                    schema[table][column].fk = $.extend({}, remote[table][column].fk);
                    colors[table][column].fk = { coords___: REMOTEUNSET };
                }
            }
        }
        return {
            schema, colors
        }
    }

    function diffToActions(schema, colors, setok, setko, conflict, checkkey) {
        const list = [];
        const todelete = {};
        for (let table in schema) {
            if ("renamed" in schema[table].coords___) {
                if (colors[table].coords___ == setok) { // rename other name to this table
                    let saved = schema[table].coords___.renamed;
                    let all = $.extend({}, saved); // figure out other name by removing the other keys
                    delete all.fks123;
                    for (let k in all) {
                        if (k.endsWith("_color123")) { delete all[k] };
                    }
                    delete all[table];
                    let other = Object.keys(all)[0];
                    list.push(["renameTable", other, table]);
                }
            } else if (checkkey in colors[table]) { // there is a conflict in check constraints
                if (colors[table].coords___ == setok) {
                    list.push(["setChecks", table, colors[table][checkkey]]);
                }
            } else if (colors[table].coords___ == setok || colors[table].coords___ == conflict) {
                list.push(["createTable", table, schema[table].coords___.x, schema[table].coords___.y]);
            } else if (colors[table].coords___ == setko) {
                todelete[table] = {}
                for (let c in schema[table]) {
                    if (c.endsWith("___")) continue;
                    if ("fk" in schema[table][c]) {
                        todelete[table][schema[table][c].fk.table] = true;
                    }
                }
                continue; // do not process columns of deleted table
            }
            let idx = 0;
            for (let column in schema[table]) {
                if (column.endsWith("___")) continue;
                if (schema[table][column].renamed !== undefined) {
                    if (colors[table][column].coords___ == setok) { // it's the other name that is now in use
                        list.push(["renameColumn", table, schema[table][column].renamed.name, column]);
                    }
                } else if (colors[table][column].coords___ == setok) {
                    let def = $.extend({}, schema[table][column]);
                    //                    delete def.fk;
                    list.push(["addColumn", table, def, idx]);
                } else if (colors[table][column].coords___ == setko) {
                    list.push(["deleteColumn", table, column]);
                } else if (colors[table][column].coords___ == conflict) {
                    if (conflict == CONFLICTSETLOCAL) {
                        list.push(["editColumn", table, column, $.extend({}, schema[table][column])]);
                    } else {
                        let def = $.extend({}, colors[table][column]);
                        delete def.coords___
                        list.push(["editColumn", table, column, def]);
                    }
                }
                idx++;
            }
        }
        // what about FKs?
        for (let table in schema) {
            if (colors[table].coords___ == setko) {
                continue; // do not process columns of deleted table
            }
            for (let column in schema[table]) {
                if (column == 'checks___') continue;
                if (colors[table][column].coords___ == setko) {
                    continue; // deleted column
                }
                if (!("fk" in schema[table][column])) {
                    continue; // no FK here
                }
                if (colors[table][column].fk.coords___ == setok) {
                    list.push(["createFK", table, column, schema[table][column].fk.table, schema[table][column].fk.column]);
                } else if (colors[table][column].fk.coords___ == setko) {
                    list.push(["deleteFK", table, column]);
                } else if (colors[table][column].fk.coords___ == conflict) {
                    list.push(["deleteFK", table, column]);
                    list.push(["createFK", table, column, schema[table][column].fk.table, schema[table][column].fk.column]);
                }
            }
        }
        let touched = true;
        let deleted = {};
        while (touched && Object.keys(todelete).length > 0) { // as long as we keep on deleting tables & there are tables still to be deleted
            touched = false; // mark as no deletion so far
            for (let table in todelete) {
                let ok = true;
                for (let d in todelete[table]) {
                    if (d in todelete && !(d in deleted)) {
                        ok = false;
                        break;
                    }
                } // if all dependents of table are already deleted
                if (ok) {
                    list.push(["deleteTable", table]); // delete table
                    deleted[table] = true; // add to deleted
                    delete todelete[table]; // remove from todelete
                    touched = true; // mark as we deleted something
                }
            }
        }
        if (!touched && Object.keys(todelete).length > 0) { // there are still tables needing deletion, but we cannot delete them because of dependencies
            // this could happen with circular FK betwenn two tables for example
            for (let table in todelete) { // we just give up and mark them to be deleted anyway
                list.push(["deleteTable", table]);
            }
        }
        return list;
    }


    function updateSchema(oldschema, diff) {
        let warnings = [];
        let str = [];
        let error = false;
        let destructive = false;
        let newschema = {};

        function fixFKs(tables, oldname, newname) {
            // a table has been renamed, fix all FKs that reference that table
            for (let table in tables) {
                for (let column in tables[table].def) {
                    if ("fk" in tables[table].def[column] && tables[table].def[column].table == oldname) {
                        tables[table].def[column].table = newname;
                    }
                }
                for (let i = 0; i < tables[table].ops.length; i++) {
                    if (tables[table].ops[i][0] == "createFK" && tables[table].ops[i][3] == oldname) {
                        tables[table].ops[i][3] = newname;
                    }
                }
            }
        }
        try {
            let newTables = {}, oldTables = {};
            //step 1: split changes according to edit existing tables and add new tables
            for (let i = 0; i < diff.length; i++) {
                let cmd = diff[i];
                if (cmd[0] == "createTable") {
                    if (cmd[0] in oldTables || cmd[0] in oldschema) {
                        warnings.push(`Cannot create ${table} because it already exists`);
                        error = true;
                    } else {
                        newTables[cmd[1]] = { def: {}, ops: [] };
                    }
                } else { // first parameter is always the table to work on
                    if (cmd[1] in newTables) {
                        if (cmd[0] == "renameTable") {
                            newTables[cmd[2]] = newTables[cmd[1]];
                            delete newTables[cmd[1]];
                            // new tables are created with their renamed name directly, other tables should use the final name immediately
                            fixFKs(newTables, cmd[1], cmd[2]);
                            fixFKs(oldTables, cmd[1], cmd[2]);
                        } else {
                            newTables[cmd[1]].ops.push(cmd);
                        }
                    } else if (cmd[1] in oldschema) {
                        if (cmd[1] in oldTables) {
                            oldTables[cmd[1]].ops.push(cmd);
                        } else {
                            oldTables[cmd[1]] = {
                                def: oldschema[cmd[1]],
                                ops: [cmd]
                            }
                        }
                        // nothing to do for renames: new tables are created before existing ones, so they don't have to update their FKs yet
                    } else {
                        warnings.push(`Cannot ${cmd[0]} on ${cmd[1]} because it is unknown`);
                        error = true;
                        console.info(cmd);
                    }
                }
            }

            let needsRecreateFK = {};

            function processTable(table, def) {
                let needsRecreate = false;
                let needsDelete = false;
                let tableSchema = {};
                let sql = [];
                for (let k in def.def) tableSchema[k] = def.def[k];

                for (let i = 0; i < def.ops.length; i++) {
                    ({
                        renameColumn(column, newname) {
                            if (newname in tableSchema) {
                                warnings.push(`Cannot rename ${table}.${column} to ${newname} because it already exists`);
                                error = true;
                            } else {
                                // requires SQLite 3 version 3.25+
                                sql.push(`ALTER TABLE ${table} RENAME COLUMN ${column} TO ${newname};`);
                                tableSchema[newname] = tableSchema[column];
                                delete tableSchema[column];
                                if (!(table in needsRecreateFK)) {
                                    needsRecreateFK[table] = {};
                                }
                                needsRecreateFK[table][column] = newname;
                            }
                        },
                        editColumn(column, def) {
                            if (column != def.name && (def.name in tableSchema)) {
                                warnings.push(`Cannot rename ${table}.${column} to ${newname} because it already exists`);
                                error = true;
                            } else {
                                // not possible to edit a column definition with SQLite 3
                                needsRecreate = true;
                                let fk = null;
                                if ("fk" in tableSchema[column] && !("fk" in def)) {
                                    def.fk = tableSchema[column][fk];
                                }
                                if (def.name != column) {
                                    delete tableSchema[column];
                                    if (!(table in needsRecreateFK)) {
                                        needsRecreateFK[table] = {};
                                    }
                                    needsRecreateFK[table][column] = def.name;
                                }
                                tableSchema[def.name] = def;
                            }
                        },
                        deleteColumn(column) {
                            // not possible to edit a column definition with SQLite 3
                            needsRecreate = true;
                            if (!(column in tableSchema)) {
                                warnings.push(`Cannot delete ${table}.${column} because it does not exists`);
                                error = true;
                            } else {
                                // not possible to drop a column definition with SQLite 3
                                needsRecreate = true;
                                delete tableSchema[column];
                            }
                        },
                        addColumn(def) {
                            if (def.name in tableSchema) {
                                warnings.push(`Cannot add column ${table}.${column} because it already exists`);
                                error = true;
                            }
                            tableSchema[def.name] = def;
                            if (def.auto || def.pk || def.unique) {
                                // SQLLite 3 does not support add such columns
                                needsRecreate = true;
                            } else {
                                let col = `ALTER TABLE ${table} ADD COLUMN ${def.name} ${def.internalType}`;
                                if (!def.nullable) {
                                    let idx = def.internalType.indexOf('(');
                                    let type = (idx == -1 ? def.internalType : def.internalType.substring(0, idx))
                                    col += ` NOT NULL DEFAULT ${defaults[type]}`;
                                }
                                sql.push(col + ";");
                            }
                        },
                        renameTable(newname) {
                            if (newname in newTables || newname in oldTables) {
                                warnings.push(`Cannot rename table ${table} because it already exists`);
                                error = true;
                            } else {
                                sql.push(`ALTER TABLE ${table} RENAME TO ${newname};`);
                                oldTables[newname] = oldTables[table];
                                delete oldTables[table];
                                table = newname;
                                if (table in needsRecreateFK) {
                                    needsRecreateFK[newname] = needsRecreateFK[table];
                                    delete needsRecreateFK[table];
                                }
                            }
                        },
                        deleteTable() {
                            if (!(table in newTables || table in oldTables)) {
                                warnings.push(`Cannot delete table ${table} because it does not exists`);
                                error = true;
                            } else {
                                sql.push(`DROP TABLE ${table};`);
                                needsDelete = true;
                                needsRecreate = false;
                                if (table in newTables) {
                                    delete newTables[table];
                                } else {
                                    if (!(table in needsRecreateFK)) {
                                        needsRecreateFK[table] = {};
                                    }
                                    for (let c in oldTables[table].def) {
                                        needsRecreateFK[table][c] = null;
                                    }
                                    delete oldTables[table];
                                }
                            }
                        },
                        deleteFK(column) {
                            if (!("fk" in tableSchema[column])) {
                                warnings.push(`Cannot delete FK on ${table}.${column} because it does not exists`);
                                error = true;
                            } else {
                                needsRecreate = true;
                                delete tableSchema[column].fk;
                                if (!(table in needsRecreateFK)) {
                                    needsRecreateFK[table] = {};
                                }
                                needsRecreateFK[table][column] = null;
                            }
                        },
                        createFK(column, fktable, fkcolumn) {
                            needsRecreate = true;
                            tableSchema[column].fk = { table: fktable, column: fkcolumn };
                        },
                        setChecks(checks) {
                            needsRecreate = true;
                            tableSchema.checks___ = checks;
                        }
                    })[def.ops[i][0]].apply(null, def.ops[i].slice(2));
                }
                return {
                    needsRecreate,
                    needsDelete,
                    sql,
                    originalSchema: def.def,
                    tableSchema
                }
            }

            for (let table in oldschema) { // keep untouched tables
                if (!(table in oldTables)) {
                    newschema[table] = $.extend({}, oldschema[table]);
                }
            }


            for (let table in newTables) {
                newTables[table] = processTable(table, newTables[table]);
            }

            for (let table in oldTables) {
                oldTables[table] = processTable(table, oldTables[table]);
            }

            for (let table in oldschema) {
                if (!(table in oldTables) || !oldTables[table].needsRecreate) {
                    let s = (table in oldTables) ? oldTables[table].tableSchema : oldschema[table];
                    for (let c in s) {
                        if (("fk" in s[c]) && (s[c].fk.table in needsRecreateFK) && (s[c].fk.column in needsRecreateFK[s[c].fk.table])) {
                            let newcol = needsRecreateFK[s[c].fk.table][s[c].fk.column];
                            if (newcol == null) {
                                delete s[c].fk;
                            } else {
                                s[c].column = newcol;
                            }
                            let old;
                            if (table in oldTables) {
                                old = oldTables[table];
                            } else {
                                old = {
                                    sql: "",
                                    originalSchema: oldschema[table],
                                    tableSchema: oldschema[table]
                                }
                            }
                            oldTables[table] = old;
                            old.needsRecreate = true;
                            old.tableSchema[c] = s[c];
                            break;
                        }
                    }
                }
            }

            let tables = [];
            let idx = 0;
            for (let table in newTables) {
                let fmt = schemaToSql({ [table]: newTables[table].tableSchema });
                warnings.push.apply(warnings, fmt.warnings);
                let dependencies = [];
                for (let column in newTables[table].tableSchema) {
                    if ("fk" in newTables[table].tableSchema[column] && newTables[table].tableSchema[column].fk.table != table) {
                        let tgt = newTables[table].tableSchema[column].fk.table;
                        if (tgt in newTables) dependencies.push(tgt);
                    }
                }
                tables[idx] = {
                    sql: fmt.sql,
                    dependencies,
                    name: table
                }
                idx++;
            }

            let defined = {};
            while (tables.length > 0) {
                let done = false;
                for (let i = 0; i < tables.length; i++) {
                    let dep = tables[i].dependencies;
                    for (let j = dep.length - 1; j >= 0; j--) {
                        if (dep[j] in defined) dep.splice(j, 1);
                    }
                    if (dep.length == 0) {
                        defined[tables[i].name] = true; // mark as defined
                        str.push(tables[i].sql);
                        tables.splice(i, 1);
                        done = true;
                        break;
                    }
                }
                if (!done) {
                    let warning = "Could not create these tables because of their dependencies (FK):";
                    for (let i = 0; i < tables.length; i++) {
                        warning += tables[i].name + " ";
                    }
                    warnings.push(warning);
                    break;
                }
            }

            let recreating = false;
            for (let table in oldTables) {
                if (oldTables[table].needsRecreate) {
                    if (oldTables[table].needsDelete) {
                        oldTables[table].needsRecreate = false;
                        continue;
                    }
                    if (!recreating) {
                        recreating = true;
                        str.push(`PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;`);
                    }
                    let fmt = schemaToSql({ ["___" + table + "_tmp"]: oldTables[table].tableSchema });
                    let cols = [];
                    for (let k in oldTables[table].tableSchema) { // for all columns of new table
                        if (k.endsWith("___")) continue;
                        if (k in oldTables[table].originalSchema) { // was present before => copy
                            cols.push(k);
                        } else { // not present => use default
                            if (oldTables[table].tableSchema[k].nullable) {
                                cols.push("NULL");
                            } else {
                                let type = oldTables[table].tableSchema[k].internalType;
                                let idx = type.indexOf('(');
                                type = (idx == -1 ? type : type.substring(0, idx))
                                cols.push(defaults[type].replace(/"/g, "'"));
                            }
                        }
                    }
                    str.push(`${fmt.sql}
    INSERT INTO ${"___" + table + "_tmp"} SELECT ${cols.join(', ')} FROM ${table};
    DROP TABLE ${table};
    ALTER TABLE ${"___" + table + "_tmp"} RENAME TO ${table};`);
                }
            }
            if (recreating) {
                str.push(`COMMIT;
    PRAGMA foreign_keys = ON;`);
            }

            for (let table in oldTables) {
                if (!oldTables[table].needsRecreate && ("sql" in oldTables[table])) {
                    str.push(oldTables[table].sql.join('\n'));
                }
            }


            for (let table in oldTables) {
                if (!oldTables[table].needsDelete) {
                    newschema[table] = oldTables[table].tableSchema;
                }
            }

            for (let table in newTables) {
                if (!newTables[table].needsDelete) {
                    newschema[table] = newTables[table].tableSchema;
                }
            }


        } catch (e) {
            console.error(e);
            throw e;
        }


        return {
            destructive,
            error,
            schema: newschema,
            update: {
                warnings,
                sql: str.join('\n\n')
            },
            create: schemaToSql(newschema)
        }
    }


    function coldef(def) {
        let str = def.internalType;
        if (def.pk) str += " primary key";
        if (def.nullable) str += " null";
        if (def.auto) str += " auto";
        if (def.unique) str += " unique";
        return str;
    }

    function sameFK(target, other) {
        if (!("fk" in target) && !("fk" in other)) return true;
        if (("fk" in target) && ("fk" in other)) {
            return target.fk.table == other.fk.table && target.fk.column == other.fk.column;
        }
        return false;
    }


    function renameTable(local, remote, schema, colors, table, other, refcoords, color) {
        clearRenamedTable(schema, colors, table);
        let save = {
            [table]: $.extend(true, {}, schema[table]),
            [other]: $.extend(true, {}, schema[other]),
            [table + "_color123"]: $.extend(true, {}, colors[table]),
            [other + "_color123"]: $.extend(true, {}, colors[other]),
            fks123: []
        };
        let saveTable = schema[table];
        delete schema[table];
        schema[other] = saveTable;
        delete colors[table];
        colors[other] = { coords___: color };
        schema[other].coords___ = refcoords;
        schema[other].coords___.renamed = save;
        // rename fks references to table too
        for (let table2 in schema) {
            if (table2 == other) continue;
            for (let column in schema[table2]) {
                if (column.endsWith("___")) continue;
                if (("fk" in schema[table2][column]) && schema[table2][column].fk.table == other) {
                    save.fks123.push({
                        table: table2,
                        column: column,
                        colors: $.extend(true, {}, colors[table2][column].fk),
                        fk: $.extend(true, {}, schema[table2][column].fk)
                    });
                    delete schema[table2][column].fk;
                    if ("fk2" in schema[table2][column] && schema[table2][column].fk2.table == table) {
                        save.fks123.push({
                            table: table2,
                            column: column,
                            colors: $.extend(true, {}, colors[table2][column].fk),
                            fk2: $.extend(true, {}, schema[table2][column].fk2)
                        });
                        // upgrade fk2 to fk
                        schema[table2][column].fk = schema[table2][column].fk2;
                        delete schema[table2][column].fk2;
                        colors[table2][column].fk.coords___ = NEUTRAL;
                    }
                }
                if (("fk2" in schema[table2][column]) && schema[table2][column].fk2.table == other) {
                    save.fks123.push({
                        table: table2,
                        column: column,
                        colors: $.extend(true, {}, colors[table2][column].fk),
                        fk: $.extend(true, {}, schema[table2][column].fk)
                    });
                    save.fks123.push({
                        table: table2,
                        column: column,
                        colors: $.extend(true, {}, colors[table2][column].fk),
                        fk2: $.extend(true, {}, schema[table2][column].fk2)
                    });
                    delete schema[table2][column].fk2;
                    colors[table2][column].fk.coords___ = NEUTRAL;
                }
                if (("fk" in schema[table2][column]) && schema[table2][column].fk.table == table) {
                    // rename FK
                    schema[table2][column].fk.table = other;
                }
                if (("fk2" in schema[table2][column]) && schema[table2][column].fk2.table == table) {
                    // rename FK
                    schema[table2][column].fk2.table = other;
                }
            }
        }
        // recompute colors for the columns
        let ltable = (color == REMOTESETOK ? table : other);
        let rtable = (color == REMOTESETOK ? other : table);
        for (let c in local[ltable]) {
            if (c.endsWith("___")) continue;
            if (c in remote[rtable]) {
                let c1 = $.extend({}, local[ltable][c]);
                let c2 = $.extend({}, remote[rtable][c]);
                delete c1.fk;
                delete c2.fk;
                if (Object.equals(c1, c2)) {
                    colors[other][c] = { coords___: NEUTRAL };
                } else {
                    colors[other][c] = $.extend({ coords___: CONFLICTUNSET }, c2);
                }
            } else {
                colors[other][c] = { coords___: LOCALUNSET };
            }
            if ((c in schema[other]) && ("fk" in schema[other][c])) {
                colors[other][c].fk = { coords___: colors[other][c].coords___ };
            }
        }
        for (let c in remote[rtable]) {
            if (c.endsWith("___")) continue;
            if (c in schema[other]) continue;
            colors[other][c] = { coords___: REMOTEUNSET };
        }
    }

    function scoreDiffTables(schema, table1, table2) {
        let c1 = schema[table1];
        let c2 = schema[table2];
        let total = Math.max(Object.keys(c1).length, Object.keys(c2).length) - 1; // -1 because of coords___
        let same = 0;
        for (let column in c1) {
            if (column in c2 && coldef(c1[column]) == coldef(c2[column]) && sameFK(c1[column], c2[column])) same++;
        }
        return same / total;
    }

    function levenshtein(string1, string2) {
        var a = string1 + "", b = string2 + "", m = [], i, j, min = Math.min;

        if (!(a && b)) return (b || a).length;

        for (i = 0; i <= b.length; m[i] = [i++]);
        for (j = 0; j <= a.length; m[0][j] = j++);

        for (i = 1; i <= b.length; i++) {
            for (j = 1; j <= a.length; j++) {
                m[i][j] = b.charAt(i - 1) == a.charAt(j - 1)
                    ? m[i - 1][j - 1]
                    : m[i][j] = min(
                        m[i - 1][j - 1] + 1,
                        min(m[i][j - 1] + 1, m[i - 1][j]))
            }
        }

        return m[b.length][a.length];
    }

    function autoUpdateRemote(local, remote, schema, colors) {
        // step 0 : start over
        clearSelections(schema, colors);
        // step 1: attempt checks + renaming tables
        for (let table1 in schema) {
            if (CHECKLOCAL in colors[table1]) {
                colors[table1].coords___=LOCALSETOK;
                continue;
            }
            if (colors[table1].coords___ != LOCALUNSET) continue; // table1 must be a target for rename
            let bestrename = null;
            let bestscore = 0.75;
            for (let table2 in schema) {
                if (table1 == table2) continue;
                if (colors[table2].coords___ != REMOTEUNSET) continue; // table2 must be an external DB candidate for rename
                let score = scoreDiffTables(schema, table1, table2);
                if (score > bestscore) {
                    bestrename = table2;
                    bestscore = score;
                }
            }
            if (bestrename != null) {
                // apply rename
                renameTable(local, remote, schema, colors, bestrename, table1, schema[table1].coords___, LOCALSETOK);
            }
        }
        // step 2: attempt renaming columns
        for (let table in schema) {
            let cols = Object.keys(schema[table]);
            let idx = cols.indexOf('checks___');
            if (idx != -1) cols.splice(idx, 1);
            for (let i = 0; i < cols.length - 1; i++) {
                let column1 = cols[i];
                if (colors[table][column1].coords___ == LOCALUNSET) { // target for rename of column
                    let bestrename = null;
                    let bestscore = Number.MAX_VALUE;
                    let coldef1 = coldef(schema[table][column1]);
                    for (let j = cols.length - 1; j > i; j--) {
                        let column2 = cols[j];
                        if (colors[table][column2].coords___ == REMOTEUNSET) { // src for rename of column
                            let diff = levenshtein(column1, column2); // we'll assume that the renaming does not change everything most of the time
                            if (diff < bestscore) {
                                bestscore = diff;
                                bestrename = column2;
                            }
                        }
                    }
                    if (bestrename != null) {
                        schema[table][column1].renamed = schema[table][bestrename];
                        colors[table][column1].coords___ = LOCALSETOK;
                        let newCols = {}; // reinsert into a new object to have the correct order
                        for (let c in schema[table]) {
                            if (c != bestrename) {
                                newCols[c] = schema[table][c];
                            }
                        }
                        for (let c in schema[table]) {
                            delete schema[table][c];
                        }
                        for (let c in newCols) {
                            schema[table][c] = newCols[c];
                        }
                        delete schema[table].coords___.height;
                        if ("fk" in schema[table][column1]) colors[table][column1].fk.coords___ = LOCALSETOK;
                    }
                }
            }
        }
        // step 3: resolve conflicting FKs to loca
        for (let table in schema) {
            for (let column in schema[table]) {
                if (column.endsWith("___")) continue;
                if ("fk" in colors[table][column] && colors[table][column].fk.coords___ == CONFLICTUNSET) {
                    if ("fk2" in schema[table][column]) {
                        colors[table][column].fk.fk1 = schema[table][column].fk;
                        colors[table][column].fk.fk2 = schema[table][column].fk2;
                        delete schema[table][column].fk2;
                        delete schema[table][column].fk;
                    }
                    colors[table][column].fk.coords___ = CONFLICTSETLOCAL;
                    schema[table][column].fk = colors[table][column].fk.fk1;
                }
            }
        }
        // step 4: accept all local changes and reject all extenal BD changes
        function set(o) {
            if ("coords___" in o) {
                if (o.coords___ == CONFLICTSETREMOTE || o.coords___ == CONFLICTUNSET) {
                    o.coords___ = CONFLICTSETLOCAL;
                } else if (o.coords___ == LOCALUNSET || o.coords___ == LOCALSETKO) {
                    o.coords___ = LOCALSETOK;
                } else if (o.coords___ == REMOTESETOK || o.coords___ == REMOTEUNSET) {
                    o.coords___ = REMOTESETKO;
                }
            }
        }
        for (let table in schema) {
            set(colors[table]);
            for (let column in schema[table]) {
                if (column.endsWith("___")) continue;
                set(colors[table][column]);
                if ("fk" in colors[table][column]) {
                    set(colors[table][column].fk);
                }
            }
        }
    }


    function schemaToSql(schema) {
        let warnings = [];
        let tables = [];
        for (let table in schema) {
            let dependencies = [];
            let str = [];
            let pks = [];
            let autoincrement = false;
            let pkcol = -1;
            for (let column in schema[table]) {
                if (column.endsWith("___")) continue;
                let col = `  ${column} ${schema[table][column].internalType.toUpperCase()}`;
                if (schema[table][column].pk) {
                    pks.push(column);
                    pkcol = str.length;
                    if (schema[table][column].internalType == "integer" && !schema[table][column].auto) {
                        warnings.push(`${table}.${column} is forced to be autogenerated because it is integer primary key.`);
                    }
                }
                if (!schema[table][column].nullable) {
                    let idx = schema[table][column].internalType.indexOf('(');
                    let type = (idx == -1 ? schema[table][column].internalType : schema[table][column].internalType.substring(0, idx))
                    col += ` NOT NULL DEFAULT ${defaults[type]}`;
                }
                if (schema[table][column].unique) col += " UNIQUE";
                if (schema[table][column].auto) {
                    if (schema[table][column].internalType != "integer" || !schema[table][column].pk) {
                        warnings.push(`${table}.${column} cannot be auto (integer primary key required).`);
                    } else {
                        autoincrement = true;
                    }
                }
                str.push(col);
            }
            if (pks.length > 0) {
                if (pks.length == 1 && pkcol != -1 && autoincrement) {
                    str[pkcol] += " PRIMARY KEY AUTOINCREMENT";
                } else {
                    str.push(`  PRIMARY KEY (${pks.join(', ')})`);
                }
            }
            for (let column in schema[table]) {
                if (column.endsWith("___")) continue;
                if ('fk' in schema[table][column]) {
                    if (dependencies.indexOf(schema[table][column].fk.table) == -1) {
                        if (table == schema[table][column].fk.table) continue;
                        dependencies.push(schema[table][column].fk.table);
                    }
                    str.push(`  FOREIGN KEY (${column}) REFERENCES ${schema[table][column].fk.table} (${schema[table][column].fk.column})`)
                }
            }
            if (schema[table] && ("checks___" in schema[table])) {
                for (let i = 0; i < schema[table].checks___.length; i++) {
                    str.push(`  CHECK(${schema[table].checks___[i]})`);
                }
            }
            if (str.length > 0) {
                tables.push({
                    name: table,
                    sql: `CREATE TABLE ${table} (\n` + str.join(',\n') + `\n);`,
                    dependencies
                })
            }
        }
        let str = [];
        let defined = {};
        if (tables.length > 1) { // for multiples tables creation, create them in order according to their dependencies
            while (tables.length > 0) {
                let done = false;
                for (let i = 0; i < tables.length; i++) {
                    let dep = tables[i].dependencies;
                    for (let j = dep.length - 1; j >= 0; j--) {
                        if (dep[j] in defined) dep.splice(j, 1);
                    }
                    if (dep.length == 0) {
                        defined[tables[i].name] = true; // mark as defined
                        str.push(tables[i].sql);
                        tables.splice(i, 1);
                        done = true;
                        break;
                    }
                }
                if (!done) {
                    let warning = "Could not create these tables because of their dependencies (FK):";
                    for (let i = 0; i < tables.length; i++) {
                        warning += tables[i].name + " ";
                    }
                    warnings.push(warning);
                    break;
                }
            }
        } else { // for a single table, do not bother with its dependencies
            if (tables.length > 0) {
                str.push(tables[0].sql);
            }
        }

        return {
            warnings,
            sql: str.join('\n\n')
        }
    }

    /*
        let { schema, colors } = diffSchemas(local, remote);
        autoUpdateRemote(schema,colors);
        let remoteActions = diffToActions(schema, colors, LOCALSETOK, REMOTESETKO, CONFLICTSETLOCAL);
        let localActions = diffToActions(schema, colors, REMOTESETOK, LOCALSETKO, CONFLICTSETREMOTE);
        let dbsql=updateSchema(remote,ra);

    */

    return {
        LOCALSETKO, LOCALSETOK, LOCALUNSET, REMOTESETKO, REMOTESETOK, REMOTEUNSET, CONFLICTSETLOCAL, CONFLICTSETREMOTE, CONFLICTUNSET, NEUTRAL,
        CHECKLOCAL, CHECKREMOTE,
        clearRenamedTable, clearSelections, hasUnset, diffSchemas, diffToActions, resolveSchema, updateSchema, autoUpdateRemote,
        coldef, sameFK, renameTable, scoreDiffTables, autoUpdateRemote, schemaToSql, defaults
    }

})();

if (window) window.editorMergeUtils = editorMergeUtils;
try {
    module.exports = editorMergeUtils;
} catch (_) { }
