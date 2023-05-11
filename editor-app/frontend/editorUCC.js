const editorUCC = function (schema) {
    let undoList = [];
    let redoList = [];
    let diff = [];
    const self = {
        diff(f) {
            diff = [];
            try {
                f();
                if (diff.length > 0) {
                    undoList.push(diff);
                    redoList.splice(0, redoList.length);
                    diff = [];
                    $.SQLEditor.setUndoRedoState({undo:true,redo:false});
                }
            } catch (e) {
                throw e;
            }
        },
        undo() {
            if (!self.hasUndo()) return;
            let undo = undoList.pop();
            diff = [];
            try {
                redoList.push(diff);
                for (let i = undo.length - 1; i >= 0; i--) {
                    let cmd = undo[i];
                    self[cmd[0]].apply(self, cmd.slice(1, cmd.length));
                }
                diff = [];
                if (!self.hasUndo()) {
                    $.SQLEditor.setUndoRedoState({undo:false});
                }
                if (self.hasRedo()) {
                    $.SQLEditor.setUndoRedoState({redo:true});
                }
            } catch (e) {
                console.error(e);
                throw e;
            }
        },
        redo() {
            if (!self.hasRedo()) return;
            let redo = redoList.pop();
            diff = [];
            try {
                undoList.push(diff);
                for (let i = redo.length - 1; i >= 0; i--) {
                    let cmd = redo[i];
                    self[cmd[0]].apply(self, cmd.slice(1, cmd.length));
                }
                diff = [];
            } catch (e) {
                console.error(e);
                throw e;
            }
            if (self.hasUndo()) {
                $.SQLEditor.setUndoRedoState({undo:true});
            }
            if (!self.hasRedo()) {
                $.SQLEditor.setUndoRedoState({redo:false});
            }
        },
        hasUndo() {
            return undoList.length > 0;
        },
        hasRedo() {
            return redoList.length > 0;
        },
        reset() {
            undoList.length = 0;
            redoList.length = 0;
            $.SQLEditor.setUndoRedoState({undo:false,redo:false});
        },
        apply(list) {
            try {
                for (let i = 0; i < list.length; i++) {
                    let cmd = list[i];
                    self[cmd[0]].apply(self, cmd.slice(1, cmd.length));
                }
            } catch (e) {
                console.error(e);
                throw e;
            }
        },
        renameColumn(table, column, newname) {
            if (column == newname) return;
            let target = { table, column };
            let coltable = Object.keys(schema[target.table]); // we have to preserve the order when renaming
            let newCols = {};
            for (let i = 0; i < coltable.length; i++) {
                if (coltable[i] == target.column) {
                    newCols[newname] = schema[target.table][coltable[i]];
                } else {
                    newCols[coltable[i]] = schema[target.table][coltable[i]];
                }
            }
            if (Object.keys(newCols).length != coltable.length) {
                throw new Error("Column " + newname + " already exists");
            }
            newCols[newname].name = newname;
            schema[target.table] = newCols;
            for (let table in schema) {
                for (let column in schema[table]) {
                    if ("fk" in schema[table][column]) {
                        if (schema[table][column].fk.table == target.table
                            && schema[table][column].fk.column == target.column) {
                            schema[table][column].fk.column = newname;
                        }
                    }
                }
            }
            delete schema[target.table].coords___.width;
            diff.push(["renameColumn", table, newname, column]);
        },
        editColumn(table, column, def) {
            let old = $.extend({}, schema[table][column]);
            if (column != def.name) {
                self.renameColumn(table, column, def.name);
                diff.pop(); // drop rename in diff has it will be covered by editColumn anyway
            }
            schema[table][def.name] = def;
            diff.push(["editColumn", table, def.name, old]);
        },
        deleteColumn(table, column) {
            let old = $.extend({}, schema[table][column]);
            let idx = 0;
            for (let k in schema[table]) {
                if (k == column) {
                    break;
                }
                idx++;
            }
            let target = { table, column };
            for (let table in schema) {
                for (let column in schema[table]) {
                    if ("fk" in schema[table][column]) {
                        if (schema[table][column].fk.table == target.table
                            && schema[table][column].fk.column == target.column) {
                            self.deleteFK(table, column);
                        }
                    }
                }
            }
            diff.push(["addColumn", table, old, idx]);
            delete schema[target.table][target.column];
            delete schema[target.table].coords___.width;
            delete schema[target.table].coords___.height;
        },
        addColumn(table, def, idx) {
            let current = [];
            let coords = null;
            let checks=[];
            if ("coords___" in schema[table]) coords = schema[table].coords___;
            if ("checks___" in schema[table]) checks = schema[table].checks___;
            delete schema[table].coords___;
            delete schema[table].checks___;
            if (idx == undefined) idx = Object.keys(schema[table]).length;
            for (let k in schema[table]) current.push(schema[table][k]);
            current.splice(idx, 0, def);
            // reinsert in order
            for (let k in schema[table]) delete schema[table][k];
            for (let i = 0; i < current.length; i++) {
                schema[table][current[i].name] = current[i];
            }
            if (coords != null) {
                delete coords.width;
                delete coords.height;
                schema[table].coords___ = coords;
            }
            schema[table].checks___ = checks;
            diff.push(["deleteColumn", table, def.name]);
        },
        createTable(table, x, y) {
            schema[table] = {
                coords___: { x, y }
            }
            diff.push(["deleteTable", table]);
        },
        renameTable(oldname, newname) {
            if (oldname == newname) return;
            let oldtable = schema[oldname];
            delete schema[oldname];
            if (newname in schema) {
                schema[oldname] = oldtable;
                throw new Error("Table " + newname + " already exists");
            } else {
                schema[newname] = oldtable;
                for (let table in schema) {
                    for (let column in schema[table]) {
                        if ("fk" in schema[table][column]) {
                            if (schema[table][column].fk.table == oldname) {
                                schema[table][column].fk.table = newname;
                            }
                        }
                    }
                }
            }
            diff.push(["renameTable", newname, oldname]);
        },
        deleteTable(table) {
            let old = schema[table];
            for (let k in schema[table]) {
                if (k .endsWith("___")) continue;
                self.deleteColumn(table, k);
            }
            diff.push(["createTable", table, schema[table].coords___.x, schema[table].coords___.y]);
            delete schema[table];
        },
        deleteFK(table, column) {
            let fk = schema[table][column].fk;
            delete schema[table][column].fk;
            diff.push(["createFK", table, column, fk.table, fk.column]);
        },
        createFK(table, column, fktable, fkcolumn) {
            if ("fk" in schema[table][column]) {
                self.deleteFK(table, column);
            }
            schema[table][column].fk = { table: fktable, column: fkcolumn };
            diff.push(["deleteFK", table, column]);
        },
        setChecks(table, checks) {
            let ochecks=schema[table].checks___;
            schema[table].checks___=checks;
            diff.push(["setChecks", table, ochecks]);
        }
    }
    return self;
}

if (typeof window!="undefined") { window.editorUCC = editorUCC; }
if (typeof module!="undefined") { module.exports = editorUCC; }