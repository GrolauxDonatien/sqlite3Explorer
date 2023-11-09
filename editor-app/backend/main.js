const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');

const DEBUG = false;
const APP = __dirname + "/../frontend/editor.html";
const QUERY = __dirname + "/../frontend/query.html";
const CONSOLE = __dirname + "/../frontend/console.html";
const EDITTABLE = __dirname + "/../frontend/table.html";
const EDITTUPLES = __dirname + "/../frontend/screens.html";
const sqlite3 = require("../../common-backend/sqlite3adapter");
const fs = require('fs');
const fspath = require('path');
const LIMIT = 1000;
const VERSION = "1.0.39";
const os = require('os');
require('@electron/remote/main').initialize()

const isMac = os.platform() === "darwin";
const isWindows = os.platform() === "win32";
const isLinux = os.platform() === "linux";

let db = null;
let win;
let currentPath = null;

const template = [
    {
        label: 'File',
        submenu: [
            {
                label: 'New...',
                click() {
                    const options = {
                        type: 'question',
                        buttons: ['Confirm', 'Cancel'],
                        defaultId: 2,
                        title: 'New schema...',
                        message: 'Are you sure you want to start over a new schema?',
                    };
                    let ret = dialog.showMessageBox(null, options);
                    ret.then(({ response }) => {
                        if (response == 0) {
                            win.webContents.send('main', { trigger: "new" });
                        }
                    });
                }
            }, {
                label: 'Load...',
                click() {
                    win.webContents.send('main', { trigger: "initiateLoad" });
                }
            }, {
                label: 'Save',
                click() {
                    win.webContents.send('main', { trigger: "save" });
                }
            }, {
                label: 'Save As...',
                click() {
                    ioAction((path) => {
                        let file = dialog.showSaveDialogSync(win, { defaultPath: path, filters: [{ name: "Database Schema Definition", extensions: ["dsd"] }], properties: ['saveFile'] });
                        if (file != undefined) {
                            win.webContents.send('main', { trigger: "saveas", file: file });
                            return file;
                        }
                    });
                }
            }, { type: "separator" },
            {
                label: "Print...",
                click() {
                    win.webContents.send('main', { trigger: "initiatePrint" });
                }
            }
            , { type: "separator" },
            {
                label: 'Exit',
                role: "quitter",
                click() {
                    process.exit(0);
                }
            }
        ]
    },
    {
        label: "Database",
        submenu: [{
            label: 'Import Schema from SQLite3 DB...',
            click() {
                win.webContents.send('main', { trigger: "initiateImport" });
            }
        }, { type: "separator" },
        {
            label: 'Resync...',
            click() {
                win.webContents.send('main', { trigger: "resync" });
            }
        },
        {
            label: 'Query...',
            click() {
                win.webContents.send('main', { trigger: "querywindow" });
            }
        }, {
            label: 'SQL Console...',
            click() {
                win.webContents.send('main', { trigger: "consolewindow" });
            }
        }, {
            label: 'Edit Tables...',
            click() {
                win.webContents.send('main', { trigger: "initiateEditTables" });
            }
        }, {
            label: 'Edit Tuples...',
            click() {
                win.webContents.send('main', { trigger: "initiateEditTuples" });
            }
        }, { type: "separator" },
        {
            label: 'Sync with another SQLite3 DB...',
            click() {
                ioAction((path) => {
                    let file = dialog.showOpenDialogSync(win, { defaultPath: path, filters: [{ name: "SQLite3 Database", extensions: ["db"] }], properties: ['openFile'] });
                    if (file != undefined) {
                        win.webContents.send('main', { trigger: "sync", file: file[0] });
                        return file[0];
                    }
                });
            }
        }, { type: "separator" }, {
            label: 'Export as new SQLite3 DB...',
            click() {
                ioAction((path) => {
                    let file = dialog.showSaveDialogSync(win, { defaultPath: path, filters: [{ name: "SQLite3 Database", extensions: ["db"] }], properties: ['saveFile'] });
                    if (file != undefined) {
                        win.webContents.send('main', { trigger: "exportdb", file: file });
                        return file;
                    }
                });
            }
        }, {
            label: 'Export as SQL script...',
            click() {
                ioAction((path) => {
                    let file = dialog.showSaveDialogSync(win, { defaultPath: path, filters: [{ name: "SQLite3 SQL Script", extensions: ["sql"] }], properties: ['saveFile'] });
                    if (file != undefined) {
                        win.webContents.send('main', { trigger: "exportsql", file: file });
                        return file;
                    }
                });
            }
        }
        ]
    }, {
        label: 'Edit',
        submenu: [
            {
                label: 'Undo',
                enabled: false,
                click() {
                    win.webContents.send('main', { trigger: "undo" });
                }
            }, {
                label: 'Redo',
                enabled: false,
                click() {
                    win.webContents.send('main', { trigger: "redo" });
                }
            }]
    }, {
        label: 'Help',
        submenu: (DEBUG ? [
            {
                label: 'Dev Tools',
                click() {
                    win.webContents.openDevTools();
                }
            },
            {
                label: 'Reload',
                click() {
                    win.webContents.send('main', { trigger: "reload" });
                }
            }] : []).concat([
                {
                    label: 'About',
                    click() {
                        const options = {
                            type: 'info',
                            buttons: ['Close'],
                            defaultId: 2,
                            title: 'About SQLite3 Explorer',
                            message: 'Developped by Donatien Grolaux under MIT license.\nVersion '+VERSION,
                        };

                        dialog.showMessageBox(null, options, (response, checkboxChecked) => {
                            console.log(response);
                            console.log(checkboxChecked);
                        });
                    }
                }])
    }
]

function ioAction(op) {
    let path = currentPath;
    if (path == "" || path == null) {
        path = app.getPath("documents");
    }
    let out = op(path);
    if (out) {
        path = fspath.dirname(out);
        if (fspath.normalize(path) == fspath.normalize(app.getPath("documents"))) {
            win.webContents.send('main', { trigger: "setDialogPath", path: null });
            currentPath = null;
        } else {
            win.webContents.send('main', { trigger: "setDialogPath", path: path });
            currentPath = path;
        }
    }
};

function createWindow() {
    //return openNewEditTable({ adapter: "sqlite3", file: "Y:/Work/ICHEC/sqlexplorer/misc/chinook.db", table: "invoices" });
    win = new BrowserWindow({
        width: 800,
        height: 600,
        title: "SQLite3 Explorer - " + VERSION,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            nativeWindowOpen: true,
            webSecurity: false,
            enableRemoteModule: true
        }
    })
    require("@electron/remote/main").enable(win.webContents);
    win.loadFile(APP);
    if (DEBUG) win.webContents.openDevTools()
    return win;
}

function openNewQueryWindow(conf) {
    let win = new BrowserWindow({
        width: 800,
        height: 600,
        title: "Query " + conf.file,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            nativeWindowOpen: true,
            webSecurity: false,
            enableRemoteModule: true
        }
    })
    require("@electron/remote/main").enable(win.webContents);
    win.removeMenu();
    win.loadFile(QUERY, { query: conf });
    if (DEBUG) win.webContents.openDevTools()
    return win;
}

function openNewConsoleWindow(conf) {
    let win = new BrowserWindow({
        width: 800,
        height: 600,
        title: "Console " + conf.file,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            nativeWindowOpen: true,
            webSecurity: false,
            enableRemoteModule: true
        }
    })
    require("@electron/remote/main").enable(win.webContents);
    win.removeMenu();
    win.loadFile(CONSOLE, { query: conf });
    if (DEBUG) win.webContents.openDevTools()
    return win;
}

function openNewEditTable(conf) {
    let win = new BrowserWindow({
        width: 800,
        height: 600,
        title: `Edit table ${conf.table} from ${conf.file}`,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            nativeWindowOpen: true,
            webSecurity: false,
            enableRemoteModule: true
        }
    })
    require("@electron/remote/main").enable(win.webContents);
    win.removeMenu();
    win.loadFile(EDITTABLE, { query: conf });
    if (DEBUG) win.webContents.openDevTools()
    return win;
}

function openNewEditTuples(conf) {
    let win = new BrowserWindow({
        width: 800,
        height: 600,
        title: `Edit tuples of ${conf.table} from ${conf.file}`,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            nativeWindowOpen: true,
            webSecurity: false,
            enableRemoteModule: true
        }
    })
    require("@electron/remote/main").enable(win.webContents);
    win.removeMenu();
    win.loadFile(EDITTUPLES, { query: conf });
    if (DEBUG) win.webContents.openDevTools()
    return win;
}

function doLoad(path) {
    if (path == "" || path == null) {
        path = app.getPath("documents");
    }
    let file = dialog.showOpenDialogSync(win, { defaultPath: path, filters: [{ name: "Database Schema Definition", extensions: ["dsd"] }], properties: ['openFile'] });
    if (file != undefined) {
        load(file[0]);
    }
}

function load(file) {
    let path = fspath.dirname(file);
    try {
        if (fspath.normalize(path) == fspath.normalize(app.getPath("documents"))) {
            win.webContents.send('main', { trigger: "setDialogPath", path: null });
        } else {
            win.webContents.send('main', { trigger: "setDialogPath", path: path });
        }
        let rawdata = fs.readFileSync(file);
        let data = JSON.parse(rawdata);
        win.webContents.send('main', { trigger: "load", data, file: file });
        currentPath = path;
    } catch (e) {
        const options = {
            type: 'error',
            buttons: ['Close'],
            defaultId: 2,
            title: 'Load Database Schema Definition...',
            message: 'Error: ' + e.message,
        };
        dialog.showMessageBox(null, options);
    }
}

function doImport(path) {
    if (path == "" || path == null) {
        path = app.getPath("documents");
    }
    let file = dialog.showOpenDialogSync({ defaultPath: path, filters: [{ name: "SQLite3 Database", extensions: ["db"] }], properties: ['openFile'] });
    if (file != undefined) {
        importDB(file[0]);
    }
}

function importDB(file) {
    let path = fspath.dirname(file);
    if (fspath.normalize(path) == fspath.normalize(app.getPath("documents"))) {
        win.webContents.send('main', { trigger: "setDialogPath", path: null });
    } else {
        win.webContents.send('main', { trigger: "setDialogPath", path: path });
    }
    win.webContents.send('main', { trigger: "import", file: file });
    currentPath = path;
}

let menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)

app.whenReady().then(() => {
    win = createWindow();
    win.once('ready-to-show', () => {
        win.show();
        if (process.argv.length > 0) {
            let last = process.argv[process.argv.length - 1];
            if (last.toLocaleLowerCase().endsWith(".dsd")) {
                load(last);
            } else if (last.toLocaleLowerCase().endsWith(".db")) {
                importDB(last);
            }
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
});

function getEngine(adapter) {
    let engine;
    switch (adapter) {
        case "sqlite3":
            engine = sqlite3;
            break;
        default:
            engine = null;
    }
    return engine;
}

let tempsender = null;

function sameColumn(col1, col2) {
    return col1.name == col2.name && col1.internalType == col2.internalType && col1.nullable == col2.nullable && col1.pk == col2.pk && col1.unique == col2.unique && col1.auto == col2.auto;
}

function sameTableSchema(table1, table2) {
    if (table1 == undefined || table2 == undefined) return false;
    for (let k in table1) {
        if (k.endsWith("___")) continue;
        if (!(k in table2)) return false;
        if (!sameColumn(table1[k], table2[k])) return false;
    }
    for (let k in table2) {
        if (!(k in table1)) return false;
    }
    return true;
}

ipcMain.on('asynchronous-message', async (event, arg) => {
    function sendError(err) {
        arg.action = "error";
        arg.error = {
            message: err.message,
            stack: err.stack
        }
        event.sender.send("main", arg);
    }
    try {
        let engine, tmpengine, options, ret, file, query, stat;
        switch (arg.action) {
            case "internalTypeToType":
                if (!arg.adapter && db == null) {
                    arg.action = "connectError";
                    arg.error = "Not connected";
                    event.sender.send("main", arg);
                } else {
                    if (arg.adapter) {
                        let engine = getEngine(arg.adapter);
                        arg.action = "internalTypeToType";
                        arg.type = engine.internalTypeToType(arg.type);
                        event.sender.send("main", arg);
                    } else {
                        arg.action = "internalTypeToType";
                        arg.type = db.internalTypeToType(arg.type);
                        event.sender.send("main", arg);
                    }
                }
                break;
            case "getSchema":
                tmpengine = getEngine(arg.conf.adapter);
                if (tmpengine == null) {
                    arg.action = "connectError";
                    arg.error = "Unsupported DB Engine " + arg.conf.adapter;
                    event.sender.send("main", arg);
                } else {
                    tmpengine.connect(arg.conf).then((e) => {
                        e.createDBModel().then((schemaModel) => {
                            let stat = fs.statSync(arg.conf.file);
                            arg.action = "setSchema";
                            arg.types = e.types;
                            arg.schema = schemaModel;
                            arg.stat = stat;
                            event.sender.send("main", arg);
                            e.disconnect();
                        });
                    }, (err) => {
                        arg.action = "connectError";
                        arg.error = err.message;
                        event.sender.send("main", arg);
                    });
                }
                break;
            case "getAndCheckTableSchema":
                function loop(sender) {
                    if (tempsender != null) {
                        setTimeout(() => { loop(sender) }, 100);
                    } else {
                        tmpengine = getEngine(arg.conf.adapter);
                        if (tmpengine == null) {
                            arg.action = "connectError";
                            arg.error = "Unsupported DB Engine " + arg.conf.adapter;
                            event.sender.send("main", arg);
                        } else {
                            tempsender = { sender: event.sender, callbackid: arg.callbackid };
                            delete arg.action;
                            delete arg.callbackid;
                            arg.getCheckSchema = true;
                            win.webContents.send('main', arg);
                        }
                    }
                }
                loop(event.sender);
                break;
            case "setCheckSchema":
                if (tempsender == null) return;
                tmpengine = getEngine(arg.conf.adapter);
                if (tmpengine == null) {
                    arg.action = "connectError";
                    arg.error = "Unsupported DB Engine " + arg.conf.adapter;
                    event.sender.send("main", arg);
                } else {
                    tmpengine.connect(arg.conf).then((e) => {
                        e.createDBModel().then((schemaModel) => {
                            let stat = fs.statSync(arg.conf.file);
                            arg.action = "setSchema";
                            arg.types = e.types;
                            if (sameTableSchema(arg.schema[arg.conf.table], schemaModel[arg.conf.table])) {
                                arg.schema = schemaModel[arg.conf.table];
                                arg.stat = stat;
                                arg.callbackid = tempsender.callbackid;
                                tempsender.sender.send("main", arg);
                                tempsender = null;
                                e.disconnect();
                            } else {
                                arg.error = "The edited schema is different from the actual DB schema. Please use Database/Resync first.";
                                arg.action = "getAndCheckTableSchema";
                                arg.callbackid = tempsender.callbackid;
                                tempsender.sender.send("main", arg);
                                tempsender = null;
                            }
                        });
                    }, (err) => {
                        arg.action = "connectError";
                        arg.error = err.message;
                        arg.callbackid = tempsender.callbackid;
                        tempsender.sender.send("main", arg);
                        tempsender = null;
                    });
                }
                break;
            case "getTypes":
                let tmpengine2 = getEngine(arg.conf.adapter);
                if (tmpengine2 == null) {
                    throw new Error("Invalid DB engine " + arg.conf.adapter);
                }
                arg.action = "setTypes";
                arg.types = tmpengine2.types;
                event.sender.send("main", arg);
                break;
            case "selectFile":
                arg.file = dialog.showOpenDialogSync(win, { defaultPath: app.getPath("documents"), filters: [{ name: "SQLite3 Database", extensions: ["db"] }], properties: ['openFile'] });
                arg.action = "fileSelected";
                event.sender.send("main", arg);
                break;
            case "selectSaveFile":
                arg.file = dialog.showSaveDialogSync(win, { defaultPath: app.getPath("documents"), filters: [{ name: "SQLite3 Database", extensions: ["db"] }], properties: ['saveFile'] });
                arg.action = "saveFileSelected";
                event.sender.send("main", arg);
                break;
            case "menu":
                if (isMac) break; // dynamic menus don't work on Mac
                function findMenu(list, submenu) {
                    if (list.length == 0) return submenu;
                    for (let j = 0; j < submenu.items.length; j++) {
                        if (submenu.items[j].label.startsWith(list[0])) {
                            if (list.length > 1) {
                                return findMenu(list.slice(1), submenu.items[j].submenu);
                            } else {
                                return submenu.items[j];
                            }
                        }
                    }
                    return null;
                }
                function findTemplate(list, tmpl) {
                    if (list.length == 0) return tmpl;
                    for (let j = 0; j < tmpl.length; j++) {
                        if (tmpl[j].label === undefined) continue;
                        if (tmpl[j].label.startsWith(list[0])) {
                            if (list.length > 1) {
                                return findTemplate(list.slice(1), tmpl[j].submenu);
                            } else {
                                return tmpl[j];
                            }
                        }
                    }
                    return null;
                }
                let submenu = findMenu(arg.menu, menu);
                let templ = findTemplate(arg.menu, template);
                if (submenu != null) {
                    let needsRebuild = false;
                    for (let k in arg) {
                        if (k == "label") needsRebuild = true;
                        if (["action", "menu"].indexOf(k) == -1) {
                            submenu[k] = arg[k];
                            templ[k] = arg[k];
                        }
                    }
                    if (needsRebuild) {
                        menu = Menu.buildFromTemplate(template);
                        win.setMenu(menu);
                        //                        Menu.setApplicationMenu(menu)
                    }
                }
                break;
            case "createDB":
                engine = getEngine(arg.adapter);
                if (engine == null) {
                    arg.action = "connectError";
                    arg.error = "Unsupported DB Engine " + arg.adapter;
                    event.sender.send("main", arg);
                } else {
                    let old = null;
                    try {
                        old = fs.statSync(arg.file);
                    } catch (e) { };
                    if (old != null && old.isFile()) {
                        let back = arg.file;
                        if (back.toUpperCase().endsWith(".DB")) back = back.substring(0, back.length - 3);
                        back += ".back";
                        fs.renameSync(arg.file, back);
                    } else if (old != null && old.isDirectory()) {
                        throw new Error(arg.file + " is not a file; it is a directory.");
                    }
                    engine.createDB(arg.file, arg.sql).then((e) => {
                        arg.action = "dbCreated";
                        event.sender.send("main", arg);
                    }, sendError);
                }
                break;
            case "updateDB":
                engine = getEngine(arg.adapter);
                if (engine == null) {
                    arg.action = "connectError";
                    arg.error = "Unsupported DB Engine " + arg.adapter;
                    event.sender.send("main", arg);
                } else {
                    engine.updateDB(arg.file, arg.sql).then((e) => {
                        arg.action = "dbUpdated";
                        event.sender.send("main", arg);
                    }, sendError);
                }
                break;
            case "rename":
                fs.rename(arg.file, arg.newname, (err) => {
                    if (err) {
                        sendError(err);
                    } else {
                        arg.action = "renamed";
                        event.sender.send("main", arg);
                    }
                });
                break;
            case "copy":
                fs.copyFile(arg.file, arg.newname, (err) => {
                    if (err) {
                        sendError(err);
                    } else {
                        arg.action = "renamed";
                        event.sender.send("main", arg);
                    }
                });
                break;
            case "save":
                fs.writeFile(arg.file, arg.data, (err) => {
                    if (err) {
                        sendError(err);
                    } else {
                        arg.action = "saved";
                        event.sender.send("main", arg);
                    }
                });
                break;
            case "askLoad":
                options = {
                    type: 'question',
                    buttons: ['Confirm', 'Cancel'],
                    defaultId: 2,
                    title: 'New schema...',
                    message: 'Are you sure you want to load another schema?',
                };
                ret = dialog.showMessageBox(null, options);
                ret.then(({ response }) => {
                    if (response == 0) {
                        doLoad(arg.path);
                    }
                });
                break;
            case "doLoad":
                doLoad(arg.path);
                break;
            case "askImport":
                options = {
                    type: 'question',
                    buttons: ['Confirm', 'Cancel'],
                    defaultId: 2,
                    title: 'Import schema from DB...',
                    message: 'Are you sure you want to import another schema?',
                };
                ret = dialog.showMessageBox(null, options);
                ret.then(({ response }) => {
                    if (response == 0) {
                        doImport(arg.path);
                    }
                });
                break;
            case "doImport":
                doImport(arg.path);
                break;
            case "querywindow":
                openNewQueryWindow({ file: arg.file });
                break;
            case "query":
                file = arg.file;
                stat = arg.stat;
                query = arg.query;
                engine = getEngine(arg.adapter);
                if (engine == null) {
                    arg.action = "connectError";
                    arg.error = "Unsupported DB Engine " + arg.adapter;
                    event.sender.send("main", arg);
                } else {
                    if (!fs.existsSync(file)) {
                        arg.error = file + " does not exists anymore";
                        event.sender.send("main", arg);
                        return;
                    }
                    engine.connect({ file: file }).then((e) => {
                        function go() {
                            e.query(query + " LIMIT " + (LIMIT + 1)).then((results) => {
                                arg.results = results;
                                event.sender.send("main", arg);
                                e.disconnect();
                            }, (err) => {
                                arg.error = err.message;
                                event.sender.send("main", arg);
                                e.disconnect();
                            });
                        }
                        delete stat.atime;
                        delete stat.atimeMs;
                        delete stat.ctime;
                        delete stat.ctimeMs;
                        let ostat = fs.statSync(file);
                        delete ostat.atime;
                        delete ostat.atimeMs;
                        delete ostat.ctime;
                        delete ostat.ctimeMs;
                        if (JSON.stringify(stat) != JSON.stringify(ostat)) {
                            // file changed, first get new schema
                            e.createDBModel().then((schemaModel) => {
                                let stat = fs.statSync(file);
                                arg.action = "setSchema";
                                arg.types = e.types;
                                arg.schema = schemaModel;
                                arg.stat = stat;
                                go();
                            });
                        } else {
                            go();
                        }
                    }, (err) => {
                        arg.action = "connectError";
                        arg.error = err.message;
                        event.sender.send("main", arg);
                    });
                }
                break;
            case "exec":
                engine = getEngine(arg.adapter);
                if (engine == null) {
                    arg.action = "connectError";
                    arg.error = "Unsupported DB Engine " + arg.adapter;
                    event.sender.send("main", arg);
                } else {
                    try {
                        let results = await engine.execDB(arg.file, arg.exec, arg.args || []);
                        arg.action = "execResults";
                        arg.results = results;
                        event.sender.send("main", arg);
                    } catch (err) {
                        arg.action = "connectError";
                        arg.error = err.message;
                        event.sender.send("main", arg);
                    }
                }
                break;
            case "batch":
                engine = getEngine(arg.adapter);
                if (engine == null) {
                    arg.action = "connectError";
                    arg.error = "Unsupported DB Engine " + arg.adapter;
                    event.sender.send("main", arg);
                } else {
                    engine.connect({ adapter: arg.adapter, file: arg.file, readwrite: true }).then(async (db) => {
                        try {
                            let results = [];
                            for (let i = 0; i < arg.operations.length; i++) {
                                let op = arg.operations[i];
                                results.push(op);
                                if ("update" in op) {
                                    if (Object.keys(op.update).length==0) {
                                        op.success = false;
                                        op.error = "Nothing to update";
                                    } else {
                                        let sql = `UPDATE ${arg.table} SET `;
                                        let sep = "";
                                        let params = [];
                                        for (let k in op.update) {
                                            sql += sep + k + "=?"
                                            sep = ", ";
                                            params.push(op.update[k]);
                                        }
                                        let where = " WHERE ";
                                        let wparams = [];
                                        sep = "";
                                        for (let k in op.pks) {
                                            where += sep + k + "=?"
                                            sep = " AND ";
                                            params.push(op.pks[k]);
                                            if (k in op.update) {
                                                wparams.push(op.update[k]);
                                            } else {
                                                wparams.push(op.pks[k]);
                                            }
                                        }
                                        try {
                                            let update = db.prepare(sql + where);
                                            let select = db.prepare(`SELECT * FROM ${arg.table}${where}`);
                                            await db.transaction(async () => {
                                                let info = await update.run.apply(update, params);
                                                if (info.changes) {
                                                    op.success = true;
                                                    let row = await select.get.apply(select, wparams);
                                                    op.tuple = row;
                                                } else {
                                                    op.success = false;
                                                    op.error = "This tuple does not exist anymore.";
                                                }
                                            });
                                        } catch (err) {
                                            op.success = false;
                                            op.error = err.message;
                                        }    
                                    }
                                } else if ("delete" in op) {
                                    let sql = `DELETE FROM ${arg.table} WHERE `;
                                    let sep = "";
                                    let params = [];
                                    for (let k in op.delete) {
                                        sql += sep + k + "=?"
                                        sep = " AND ";
                                        params.push(op.delete[k]);
                                    }
                                    try {
                                        let del = db.prepare(sql);
                                        await db.transaction(async () => {
                                            await del.run.apply(del, params);
                                            op.success = true; // as long as there is no exception, the tuple is not there anymore
                                        });
                                    } catch (err) {
                                        op.success = false;
                                        op.error = err.message;
                                    }
                                } else if ("insert" in op) {
                                    let sql;
                                    let params = [];
                                    let where;
                                    let wparams = [];
                                    let sep = "";
                                    if (Object.keys(op.insert).length==0) {
                                        sql=`INSERT INTO ${arg.table} DEFAULT VALUES`;
                                        where="";
                                    } else {
                                        sql = `INSERT INTO ${arg.table} (${Object.keys(op.insert).join(',')}) VALUES (`;
                                        let sep = "";
                                        for (let k in op.insert) {
                                            sql += sep + "?";
                                            sep = ",";
                                            params.push(op.insert[k]);
                                        }
                                        sql += ")";
                                        where=" WHERE ";
                                        sep = "";
                                        for (let k in op.insert) {
                                            where += sep + k + "=?"
                                            sep = " AND ";
                                            wparams.push(op.insert[k]);
                                        }
                                    }
                                    // get back auto generated pks
                                    let getpks = [];
                                    for (let i = 0; i < op.pks.length; i++) {
                                        if (op.pks[i] in op.insert) continue;
                                        getpks.push(`SELECT MAX(${op.pks[i]}) FROM ${arg.table}${where}`);
                                    }
                                    // get back written tuple
                                    let sel = `SELECT * FROM ${arg.table}${where}`;
                                    for (let i = 0; i < op.pks.length; i++) {
                                        if (op.pks[i] in op.insert) continue;
                                        sel += ` ${i>0||where!=""?" AND ":" WHERE "} ${op.pks[i]}=?`;
                                    }
                                    try {
                                        let insert = db.prepare(sql);
                                        let pks = [];
                                        for (let i = 0; i < getpks.length; i++) {
                                            pks[i] = db.prepare(getpks[i]);
                                        }
                                        let select = db.prepare(sel);
                                        await db.transaction(async () => {
                                            let info = await insert.run.apply(insert, params);
                                            if (info.changes>0) {                                                
                                                op.success = true;
                                                let pkvs = [];
                                                for (let i = 0; i < pks.length; i++) {
                                                    let pk = await pks[i].get.apply(pks[i], wparams);
                                                    for (k in pk) {
                                                        pkvs.push(pk[k]);
                                                        break;
                                                    }
                                                }
                                                wparams.push.apply(wparams, pkvs);
                                                let row = await select.get.apply(select, wparams);
                                                op.tuple = row;
                                            } else {
                                                op.success = false;
                                                op.error = "This tuple does not exist anymore.";
                                            }
                                        });
                                    } catch (err) {
                                        op.success = false;
                                        op.error = err.message;
                                    }
                                }
                            }
                            delete arg.operations;
                            arg.results = results;
                            event.sender.send("main", arg);
                        } catch (err) {
                            arg.action = "error";
                            arg.error = err.message;
                            event.sender.send("main", arg);
                        } finally {
                            try {
                                db.disconnect();
                            } catch (_) {}
                        }
                    }, (err) => {
                        arg.action = "connectError";
                        arg.error = "Cannot open DB " + arg.file + ": " + err;
                        event.sender.send("main", arg);
                    });
                }
                break;
            case "consolewindow":
                openNewConsoleWindow({ file: arg.file });
                break;
            case "print":
                win.webContents.print({}, (success, failure) => {
                    if (!success) {
                        arg.error = failure;
                    }
                    event.sender.send("main", arg);
                });
                break;
            case "editTable":
                openNewEditTable({ file: arg.conf.file, table: arg.table });
                break;
            case "editTuples":
                openNewEditTuples({ file: arg.conf.file, table: arg.table });
                break;
        }
    } catch (e) {
        sendError(e);
    }
});

