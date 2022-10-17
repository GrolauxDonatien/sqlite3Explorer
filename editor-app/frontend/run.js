let { defaults, dbSchemaUI, editUCC, proposeSQL, mergeUI,
    error, message, types, schema, ucc, contextOverlay, updateSchema, schemaToSql } = $.SQLEditor;
let conf = $.SQLEditor.config;
const DSDMAGICK = "1.0_LKJH70987HOIUYHO";

$.SQLEditor.internalTypeToType = function (type, callback) {
    ipcAjax({ action: "internalTypeToType", type, adapter: conf.adapter }, (response) => {
        callback(response.type);
    }, (err) => {
        error(err);
    });
}

$.SQLEditor.menuModel = function (target, menu) {
    if ("fk" in target) {

    } else if ("table" in target) {
        if (conf.file) {
            menu["sep3"] = null;
            menu[`Edit content of table ${target.table}...`] = () => {
                ipcAjax({ action: "getSchema", conf }, (response) => {
                    if (target.table in response.schema) {
                        ipcAjax({ action: "editTable", conf, table: target.table });
                    } else {
                        message(`There is no table ${target.table} in ${conf.file}`);
                    }
                });
            }
        }
    } else {

    }
}

$.SQLEditor.setUndoRedoState = function(state) {
    if ("undo" in state) {
        ipcAjax({ action: "menu", menu: ["Edit", "Undo"], enabled: state.undo });
    }
    if ("redo" in state) {
        ipcAjax({ action: "menu", menu: ["Edit", "Redo"], enabled: state.redo });
    }
}

function setDBMenu() {
    if (conf.file == null) {
        ipcAjax({ action: "menu", menu: ["Database", "Resync"], enabled: false, label: "Resync..." });
        ipcAjax({ action: "menu", menu: ["Database", "Query"], enabled: false, label: "Query..." });
        ipcAjax({ action: "menu", menu: ["Database", "SQL Console"], enabled: false, label: "SQL Console..." });
        ipcAjax({ action: "menu", menu: ["Database", "Edit Tables"], enabled: false, label: "Edit Tables..." });
    } else {
        let short = conf.file.replace(/\\/g, "/");
        let idx = short.lastIndexOf("/");
        if (idx != -1) short = short.substring(idx + 1);
        ipcAjax({ action: "menu", menu: ["Database", "Resync"], enabled: true, label: "Resync with " + short + "..." });
        ipcAjax({ action: "menu", menu: ["Database", "Query"], enabled: true, label: "Query " + short + "..." });
        ipcAjax({ action: "menu", menu: ["Database", "SQL Console"], enabled: true, label: "SQL Console " + short + "..." });
        ipcAjax({ action: "menu", menu: ["Database", "Edit Tables"], enabled: true, label: "Edit Tables of " + short + "..." });
    }
}

ipcAjax({ action: "getTypes", conf: { adapter: "sqlite3" } }, (response) => {
    for (let k in response.types) {
        types[k] = response.types[k];
        for (let k2 in types[k]) {
            for (let i = 0; i < types[k][k2].length; i++) {
                defaults[types[k][k2][i]] = (k == "text" ? `""` : "0");
            }
        }
    }
});


$('#loading').css('display', 'none');
$('#sqleditor').css('display', 'block');
setDBMenu();
ipcAjax({ action: "menu", menu: ["File", "Save"], enabled: false });

$.SQLEditor.init($('#tab-schema'));

function sync(file) {
    contextOverlay.remove();
    $('#loading').css('display', 'flex');
    ipcAjax({ action: "getSchema", conf: { adapter: "sqlite3", file: file } }, (response) => {
        $('#loading').css('display', 'none');
        mergeUI(schema, response.schema, (la, ra) => {
            ucc.diff(() => {
                ucc.apply(la);
                conf.schemaUI.redraw();
            });
            let dbsql = updateSchema(response.schema, ra);
            dbsql.file = file;
            proposeSQL(dbsql, function (arg, close) {
                let back;
                switch (arg.action) {
                    case "new":
                        ipcAjax({ action: "selectSaveFile" }, ({ file }) => {
                            if (file !== undefined) {
                                ipcAjax({ action: "createDB", file: file, sql: arg.create.sql, adapter: "sqlite3" }, () => {
                                    message("File " + arg.file + " created successfully.");
                                    conf.file = arg.file;
                                    setDBMenu();
                                    close();
                                }, (e) => {
                                    error(e.message);
                                });
                            }
                        });
                        break;
                    case "create":
                        back = arg.file;
                        if (back.toUpperCase().endsWith(".DB")) back = back.substring(0, back.length - 3);
                        back += ".back";
                        ipcAjax({ action: "createDB", file: arg.file, sql: arg.create.sql, adapter: "sqlite3" }, () => {
                            message("File " + arg.file + " created successfully.");
                            conf.file = arg.file;
                            setDBMenu();
                            close();
                        }, (e) => {
                            error(e.message);
                        });
                        break;
                    case "update":
                        if (arg.update.sql.length == 0) {
                            conf.file = arg.file;
                            close();
                            setDBMenu();
                            return;
                        }
                        back = arg.file;
                        if (back.toUpperCase().endsWith(".DB")) back = back.substring(0, back.length - 3);
                        back += ".back";
                        ipcAjax({ action: "copy", file: arg.file, newname: back }, () => {
                            ipcAjax({ action: "updateDB", file: arg.file, sql: arg.update.sql, adapter: "sqlite3" }, () => {
                                message("File " + arg.file + " update successfully.");
                                conf.file = arg.file;
                                setDBMenu();
                                close();
                            }, (e) => {
                                error(e.message);
                            });
                        }, (e) => {
                            error(e.message);
                        });
                        break;
                }
            });

        });
    });
}


ipcAjax.callbacks.new = () => {
    contextOverlay.remove();
    for (let k in schema) delete schema[k];
    ucc.reset();
    conf.schemaUI.redraw();
    conf.file = null;
    conf.dsd = null;
    document.title = "SQLite3 Explorer";
    setDBMenu();
    ipcAjax({ action: "menu", menu: ["File", "Save"], enabled: false });
}

ipcAjax.callbacks.undo = () => {
    contextOverlay.remove();
    ucc.undo();
    conf.schemaUI.redraw();
}

ipcAjax.callbacks.redo = () => {
    contextOverlay.remove();
    ucc.redo();
    conf.schemaUI.redraw();
}

ipcAjax.callbacks.import = ({ file }) => {
    contextOverlay.remove();
    $('#loading').css('display', 'flex');
    ipcAjax({ action: "getSchema", conf: { adapter: "sqlite3", file: file } }, (response) => {
        for (let k in schema) delete schema[k];
        for (let k in response.schema) schema[k] = response.schema[k];
        ucc.reset();
        conf.schemaUI.redraw();
        conf.file = file;
        setDBMenu();
        $('#loading').css('display', 'none');
    });
}

ipcAjax.callbacks.resync = () => {
    if (conf.file!=null) {
        sync(conf.file);
    } else {
        alertNoFile();
    }
}

ipcAjax.callbacks.sync = ({ file }) => {
    sync(file);
}

ipcAjax.callbacks.load = ({ data, file }) => {
    if ("___dsdmagic123___" in data && data["___dsdmagic123___"] == DSDMAGICK) {
        delete data["___dsdmagic123___"];
        for (let k in schema) {
            delete schema[k];
        }
        for (let k in data) {
            schema[k] = data[k];
        }
        ucc.reset();
        conf.dsd = file;
        conf.file = null;
        document.title = "SQLite3 Explorer - " + file;
        ipcAjax({ action: "menu", menu: ["File", "Save"], enabled: true });
        setDBMenu();
        conf.schemaUI.redraw();
    } else {
        error(`${file} contains invalid data for this application.`);
    }
}

function save(file) {
    let data = { "___dsdmagic123___": DSDMAGICK };
    for (let k in schema) {
        data[k] = schema[k];
    }
    ipcAjax({ action: "save", file: file, data: JSON.stringify(data) }, () => {
        message(`${file} saved successfully.`);
        conf.dsd = file;
        document.title = "SQLite3 Explorer - " + file;
        ipcAjax({ action: "menu", menu: ["File", "Save"], enabled: true });
    });
}

function alertNoFile() {
    alert("You need to import a Database first.");
}

ipcAjax.callbacks.saveas = ({ file }) => {
    save(file);
}

ipcAjax.callbacks.save = () => {
    save(conf.dsd);
}

ipcAjax.callbacks.setDialogPath= ({path})=>{
    if (path=="" || path==null) {
        localStorage.removeItem("dialogPath");
    } else {
        localStorage.setItem("dialogPath", path);
    }
};

ipcAjax.callbacks.initiateLoad = () => {
    if (Object.keys(schema).length > 0) {
        ipcAjax({ action: "askLoad", path:localStorage.getItem("dialogPath") });
    } else {
        ipcAjax({ action: "doLoad", path:localStorage.getItem("dialogPath") });
    }
}

ipcAjax.callbacks.initiateImport = () => {
    if (Object.keys(schema).length > 0) {
        ipcAjax({ action: "askImport", path:localStorage.getItem("dialogPath") });
    } else {
        ipcAjax({ action: "doImport", path:localStorage.getItem("dialogPath") });
    }
}

ipcAjax.callbacks.exportdb = ({ file }) => {
    let out = schemaToSql(schema);
    ipcAjax({ action: "createDB", adapter: 'sqlite3', sql: out.sql, file }, () => {
        if (out.warnings.length > 0) {
            error(file + " written successfully with the following warnings:\n" + out.warnings.join('\n'));
        } else {
            message(file + " written successfully.");
        }
        conf.file = file;
        setDBMenu();
    });
}

ipcAjax.callbacks.exportsql = ({ file }) => {
    let out = schemaToSql(schema);
    ipcAjax({ action: "save", data: out.sql, file }, () => {
        if (out.warnings.length > 0) {
            error(file + " written successfully with the following warnings:\n" + out.warnings.join('\n'));
        } else {
            message(file + " written successfully.");
        }
    });
}

ipcAjax.callbacks.querywindow = () => {
    if (conf.file != null) {
        ipcAjax({
            action: "querywindow", "file": conf.file
        });
    } else {
        alertNoFile();
    }
};

ipcAjax.callbacks.consolewindow = () => {
    if (conf.file != null) {
        ipcAjax({
            action: "consolewindow", "file": conf.file
        });
    } else {
        alertNoFile();
    }
};

ipcAjax.callbacks.reload = () => {
    location.reload();
};

ipcAjax.callbacks.initiatePrint = () => {
    $('#print').css('display', 'block');
    let schemaUI = dbSchemaUI({
        model: schema,
        aliases: {},
        root: $('#print'),
        checkboxes: false,
        radios: false,
        colors: false,
        selectionModel: {
            select() { },
            isSelected() { return false },
            color() { },
            clear() { }
        },
        ondrawn() {
            ipcAjax({ action: "print" }, () => {
                schemaUI.destroy();
                $('#print').empty();
                $('#print').css('display', 'none');
            }, (err) => {
                schemaUI.destroy();
                $('#print').empty();
                $('#print').css('display', 'none');
                error(err);
            });
        }
    });
};

ipcAjax.callbacks.initiateEditTables = () => {
    if (conf.file==null) {
        alertNoFile();
        return;
    }
    ipcAjax({ action: "getSchema", conf }, (response) => {
        let tables = Object.keys(response.schema);
        if (tables.length == 0) {
            message(`There are no tables in ${conf.file}`);
            return;
        }
        let select = $('<select>');
        for (let i = 0; i < tables.length; i++) {
            let option = $('<option>');
            option.attr("value", tables[i]);
            option.text(tables[i]);
            select.append(option);
        }
        let diag = $(`<div title="Edit table from ${conf.file}"></div>`);
        diag.append('Select a table: ');
        diag.append(select);
        diag.dialog({
            dialogClass: "no-close custom-dialog",
            modal: true,
            buttons: [{
                text: "Edit...",
                click() {
                    ipcAjax({ action: "editTable", conf, table: select.val() });
                    diag.dialog("close");
                    diag.remove();
                }
            }, {
                text: "Cancel",
                click: function () {
                    diag.dialog("close");
                    diag.remove();
                }
            }]
        });
    }, (msg) => { error(msg); });
};

