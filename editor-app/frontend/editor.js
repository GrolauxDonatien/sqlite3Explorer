$.SQLEditor = {};
(() => {
    let dbSchemaUI = window.dbviewer.dbSchemaUI;
    window.parsers.setSQLParser(window.sqlParser);
    const validChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
    const updateSchema = window.editorMergeUtils.updateSchema;
    const schemaToSql = window.editorMergeUtils.schemaToSql;

    $.SQLEditor.internalTypeToType = (type, callback) => { callback(type); };
    $.SQLEditor.menuModel = (menu) => { return menu; };
    $.SQLEditor.setUndoRedoState = (state) => { }

    let conf = {
        "adapter": "sqlite3",
        "file": null,
        pady: -8,
        padx: 0
    };
    let schema = {}, types = {};

    let ucc = null;

    ucc = editorUCC(schema);
    ucc.reset();

    let contextOverlay = $('<div class="contextOverlay noselect">');

    function intToString(s) {
        s = s + "";
        let ret = [];
        for (let i = 0; i < s.length; i++) {
            ret.push(String.fromCharCode(parseInt(s[i]) + 96));
        }
        return ret.join('');
    }

    function resetContextOverlay() {
        if (contextOverlay.attr('contenteditable') == "true") {
            let e = $.Event('keydown');
            e.key = "Enter";
            contextOverlay.trigger(e);
        }
        contextOverlay.empty();
        contextOverlay.remove();
        contextOverlay.removeAttr("style");
        contextOverlay.removeAttr("contenteditable");
        contextOverlay.off('keydown');
    }

    function positionContextOverlay(event) {
        let r = event.currentTarget.getBoundingClientRect();
        contextOverlay.css({
            position: 'absolute',
            left: event.offsetX + r.x,
            top: event.offsetY + r.y-8
        });
    }

    function setMenu(menu) {
        conf.root.append(contextOverlay);
        contextOverlay.css({
            display: "flex",
            flexDirection: "column"
        });
        for (let k in menu) {
            if (menu[k] == null) {
                contextOverlay.append($('<hr>'));
            } else {
                let m = $('<div>').html(k);
                m.addClass('menu-entry');
                contextOverlay.append(m);
                m.on("click", function (e) {
                    resetContextOverlay();
                    menu[k](e);
                });
            }
        }
    }

    function setEditName(name, callback) {
        conf.root.append(contextOverlay);
        contextOverlay.css({
            fontFamily: "sans-serif",
            fontSize: "14px",
            padding: "3px"
        });
        contextOverlay.text(name);
        contextOverlay.attr("contenteditable", "true");
        contextOverlay.focus();
        let selection = window.getSelection();
        let range = document.createRange();
        range.selectNodeContents(contextOverlay[0]);
        selection.removeAllRanges();
        selection.addRange(range);
        contextOverlay.on('keydown', (event) => {
            if (event.key == "Escape") {
                contextOverlay.removeAttr("contenteditable");
                resetContextOverlay();
                event.preventDefault();
                event.stopPropagation();
            } else if (event.key == "Enter") {
                let n = contextOverlay.text().replace(/\n/g, "");
                contextOverlay.removeAttr("contenteditable");
                resetContextOverlay();
                if (n.trim() != "") {
                    callback(n.trim());
                }
                event.preventDefault();
                event.stopPropagation();
            } else if (event.key.length == 1 && validChars.indexOf(event.key) == -1) {
                warning("Invalid key (letters and _ only)");
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }

    function editColumn(table, column, def, callback) {
        let diag = $(`<div title="${column == "" ? "Add" : "Edit"} column"></div>`);
        let tbl = $('<table>');
        let tbody = $('<tbody>');
        tbl.append(tbody);
        let tr = $('<tr>');
        tr.append('<td><label>Name:</label></td>');
        let name = $('<input>');
        name.val(def.name);
        tr.append($('<td>').append(name));
        name.focus();
        name.on('keydown', (event) => {
            if (event.key.length == 1 && validChars.indexOf(event.key) == -1) {
                warning("Invalid key (letters and _ only)");
                event.preventDefault();
                event.stopPropagation();
            }
        });
        tbody.append(tr);
        tr = $('<tr>');
        tr.append('<td><label>Type:</label></td>');
        let type = $('<select>');
        tr.append($('<td>').append(type));
        tbody.append(tr);
        let opts = [];
        for (let k in types) {
            for (let n in types[k]) {
                for (let i = 0; i < types[k][n].length; i++) {
                    opts.push({ t: types[k][n][i], n });
                }
            }
        }
        opts.sort((a, b) => { return a.t.localeCompare(b.t); });
        for (let i = 0; i < opts.length; i++) {
            let opt = $(`<option value="${opts[i].t}" data-args="${opts[i].n}">`);
            opt.text(opts[i].t);
            type.append(opt);
        }
        let pk = $('<input type="checkbox">');
        let auto = $('<input type="checkbox">');
        let notnull = $('<input type="checkbox">');
        type.on('change', function () {
            let n = parseInt(type.find(':selected').attr('data-args'));
            if (isNaN(n)) n = 0;
            type.parent().contents().filter((i, el) => i != 0).remove();
            let boundKeys = Object.keys(def.bounds);
            for (let i = 0; i < n; i++) {
                if (i == 0) {
                    type.parent().append('(');
                } else {
                    type.parent().append(',');
                }
                let input = $('<input class="coldefnumber" type="number" minimum="0">');
                if (def.type == type.val()) {
                    input.val(def.bounds[boundKeys[i]]);
                } else {
                    input.val(0);
                }
                type.parent().append(input);
                if (i == n - 1) type.parent().append(')');
            }
            auto.prop('checked', type.val() == "integer" && pk.prop('checked'));
            if (pk.prop('checked')) notnull.prop('checked');
        });
        type.val(def.type);
        type.trigger('change');
        tr = $('<tr>');
        tr.append('<td><label>Primary Key:</label></td>');
        pk.prop('checked', def.pk);
        tr.append($('<td>').append(pk));
        tbody.append(tr);
        tr = $('<tr>');
        tr.append('<td><label>Unique:</label></td>');
        let unique = $('<input type="checkbox">');
        unique.prop('checked', def.unique);
        tr.append($('<td>').append(unique));
        tbody.append(tr);
        tr = $('<tr>');
        tr.append('<td><label>Not null:</label></td>');
        notnull.prop('checked', !def.nullable);
        tr.append($('<td>').append(notnull));
        tbody.append(tr);
        tr = $('<tr>');
        tr.append('<td><label>Auto generated:</label></td>');
        auto.prop('checked', def.auto);
        tr.append($('<td>').append(auto));
        tbody.append(tr);

        diag.append(tbl);

        auto.prop('disabled', true);
        pk.on('change', () => {
            if (pk.prop('checked')) {
                unique.prop('checked', true);
                unique.prop('disabled', true);
                auto.prop('checked', type.val() == 'integer');
                notnull.prop('checked', true);
                notnull.prop('disabled', true);
            } else {
                unique.prop('disabled', false);
                notnull.prop('disabled', false);
                auto.prop('checked', false);
            }
        });

        pk.trigger('change');

        function add(onadded) {
            if (name.val().trim() == "") {
                warning("Name is mandatory");
                return;
            }
            let str = type.val();
            let sub = type.parent().contents().filter((i, el) => i != 0);
            sub.each((i, el) => str += (i % 2 == 0 ? $(el).text() : $(el).val()));

            $.SQLEditor.internalTypeToType(str, (s) => {
                s.name = name.val();
                s.nullable = !notnull.prop('checked');
                s.auto = auto.prop('checked');
                s.pk = pk.prop('checked');
                s.unique = unique.prop('checked');
                if ("fk" in def) s.fk = def.fk;
                if (onadded) onadded();
                callback(s);
            });

        }

        diag.dialog({
            dialogClass: "no-close",
            modal: true,
            minHeight: 120,
            maxHeight: 600,
            minWidth: 640,
            buttons: [{
                text: "Ok",
                click: function () {
                    add(() => {
                        diag.dialog("close");
                        diag.remove();
                    });
                }
            }, {
                text: "Ok & Add another column...",
                click: function () {
                    add(() => {
                        diag.dialog("close");
                        diag.remove();
                        editColumn(table, column, def, callback);
                    });
                }
            }, {
                text: "Cancel",
                click: function () {
                    diag.dialog("close");
                    diag.remove();
                }
            }]
        });
    }

    function addColumn(table) {
        function callback(def) {
            if (def.name in schema[table]) {
                error(`Column ${def.name} already exists.`);
                editColumn(table, def.name, def, callback);
            } else {
                ucc.diff(() => {
                    ucc.addColumn(table, def);
                })
                conf.schemaUI.redraw();
            }
        }
        editColumn(table, "", {
            "name": "",
            "nullable": false,
            "auto": false,
            "pk": false,
            "unique": false,
            "internalType": "INTEGER",
            "type": "integer",
            "bounds": {},
            "format": "number"
        }, callback);
    }

    let sm = function (ucc) {
        let selected = {};

        let self = {
            select(target, event) {
                resetContextOverlay();
                selected = target;
                if (event.which == 1 && !("column" in target) && ("table" in target)) {
                    if (target.table in schema) { // sanity check
                        // rename table
                        let r = event.currentTarget.getBoundingClientRect();
                        contextOverlay.css({
                            position: 'absolute',
                            left: schema[target.table].coords___.x - 1 + r.x + conf.padx,
                            top: schema[target.table].coords___.y - 1 + r.y + conf.pady,
                            width: schema[target.table].coords___.width - 8,
                            height: conf.schemaUI.textHeight
                        });
                        setEditName(target.table, (rename) => {
                            try {
                                ucc.diff(
                                    () => {
                                        ucc.renameTable(target.table, rename);
                                    }
                                );
                            } catch (e) {
                                error(e.message);
                            }
                            selected = {};
                            conf.schemaUI.redraw();
                        });
                    }
                } else if (event.which == 1 && !("fk" in target) && ("column" in target)) {
                    if ((target.table in schema) && (target.column in schema[target.table])) { // sanity check
                        // rename column
                        let r = event.currentTarget.getBoundingClientRect();
                        let t = schema[target.table].coords___.columns[target.column];
                        contextOverlay.css({
                            position: 'absolute',
                            left: t.x - 1 + r.x + conf.schemaUI.textHeight * 3 - 4,
                            top: t.y - 9 + r.y,
                            width: schema[target.table].coords___.width - 4 - conf.schemaUI.textHeight * 3,
                            height: conf.schemaUI.textHeight
                        });
                        setEditName(target.column, (rename) => {
                            try {
                                ucc.diff(
                                    () => {
                                        ucc.renameColumn(target.table, target.column, rename);
                                    }
                                );
                            } catch (e) {
                                error(e.message);
                            }
                            selected = {};
                            conf.schemaUI.redraw();
                        });
                    }
                } else if (event.which == 3) {
                    positionContextOverlay(event);
                    if ("fk" in target) {
                        if ((target.table in schema) && (target.column in schema[target.table]) && (target.fk.table in schema) && (target.fk.column in schema[target.fk.table])) { // sanity check
                            let menu = {
                                [`Delete FK <i>${target.table}.${target.column}</i>&#128486;&#9135;&nbsp;<i>${target.fk.table}.${target.fk.column}</i>...`]: () => {
                                    resetContextOverlay();
                                    setTimeout(() => {
                                        if (confirm(`Delete FK ${target.table}.${target.column}=>${target.fk.table}.${target.fk.column} ?`)) {
                                            try {
                                                ucc.diff(() => {
                                                    ucc.deleteFK(target.table, target.column);
                                                })
                                            } catch (e) {
                                                error(e.message);
                                            }
                                            conf.schemaUI.redraw();
                                        }
                                    }, 1);
                                }
                            };
                            $.SQLEditor.menuModel(target, menu);
                            setMenu(menu);
                        }
                    } else if ("column" in target) {
                        if ((target.table in schema) && (target.column in schema[target.table])) { // sanity check
                            function editCallback(def) {
                                try {
                                    ucc.diff(() => {
                                        ucc.editColumn(target.table, target.column, def);
                                    });
                                } catch (e) {
                                    error(e.message);
                                    editColumn(target.table, target.column, def, editCallback);
                                    return;
                                }
                                selected = {};
                                conf.schemaUI.redraw();
                            }
                            let menu = {
                                [`Rename column <i>${target.column}</i>...`]: () => {
                                    event.which = 1;
                                    self.select(target, event);
                                },
                                [`Edit column <i>${target.column}</i>...`]: () => {
                                    selected = {};
                                    editColumn(target.table, target.column, schema[target.table][target.column], editCallback);
                                }, [`Delete column ${target.column}...`]: () => {
                                    setTimeout(() => {
                                        if (confirm(`Delete column ${target.table}.${target.column} ?`)) {
                                            try {
                                                ucc.diff(() => {
                                                    ucc.deleteColumn(target.table, target.column);
                                                })
                                            } catch (e) {
                                                error(e.message);
                                            }
                                            conf.schemaUI.redraw();
                                        }
                                    }, 1);
                                }, "sep1": null,
                                [`Rename table <i>${target.table}</i>...`]: () => {
                                    event.which = 1;
                                    delete target.column;
                                    self.select(target, event);
                                },
                                [`Delete table <i>${target.table}</i>...`]: () => {
                                    setTimeout(() => {
                                        if (confirm(`Delete table ${target.table} ?`)) {
                                            try {
                                                ucc.diff(() => {
                                                    ucc.deleteTable(target.table);
                                                });
                                            } catch (e) {
                                                error(e.message);
                                            }
                                            conf.schemaUI.redraw();
                                        }
                                    }, 1);
                                },
                                "sep2": null,
                                [`Add column...`]: () => {
                                    selected = {};
                                    addColumn(target.table);
                                }
                            };
                            $.SQLEditor.menuModel(target, menu);
                            setMenu(menu);
                        }
                    } else if ("table" in target) {
                        if (target.table in schema) { // sanity check
                            let menu = {
                                [`Rename table <i>${target.table}</i>...`]: () => {
                                    event.which = 1;
                                    self.select(target, event);
                                },
                                [`Delete table <i>${target.table}</i>...`]: () => {
                                    setTimeout(() => {
                                        if (confirm(`Delete table ${target.table} ?`)) {
                                            try {
                                                ucc.diff(() => {
                                                    ucc.deleteTable(target.table);
                                                });
                                            } catch (e) { error(e.message); }
                                            conf.schemaUI.redraw();
                                        }
                                    }, 1);
                                },
                                "sep": null,
                                ["Add column..."]: () => {
                                    selected = {};
                                    addColumn(target.table);
                                }
                            };
                            $.SQLEditor.menuModel(target, menu);
                            setMenu(menu);
                        }
                    }
                } 
            },
            isSelected(target) {
                return Object.equals(selected, target);
            },
            clear(event) {
                resetContextOverlay();
                selected = {};
                if (event == null) return;
                if (event.which == 3) {
                    positionContextOverlay(event);
                    let menu = {
                        "Add table...": () => {
                            let str = "newtable";
                            let c = 0;
                            while (str in schema) {
                                c++;
                                str = "newtable_" + intToString(c);
                            }
                            try {
                                ucc.diff(() => {
                                    ucc.createTable(str, event.offsetX, event.offsetY);
                                })
                            } catch (e) {
                                error(e.message);
                            }
                            conf.schemaUI.redraw();
                            event.which = 1;
                            self.select({
                                "table": str
                            }, event);
                        },
                        "Reposition all tables": () => {
                            for (let k in schema) {
                                delete schema[k].coords___;
                            }
                            conf.schemaUI.redraw();
                        },
                        "sep1": null,
                        [`<span class="${ucc.hasUndo() ? "" : "inactive"}">Undo</span>`]: () => {
                            try {
                                ucc.undo();
                            } catch (e) {
                                error(e.message);
                            }
                            conf.schemaUI.redraw();
                        },
                        [`<span class="${ucc.hasRedo() ? "" : "inactive"}">Redo</span>`]: () => {
                            try {
                                ucc.redo();
                            } catch (e) {
                                error(e.message);
                            }
                            conf.schemaUI.redraw();
                        }
                    };
                    $.SQLEditor.menuModel({}, menu);
                    setMenu(menu);
                }
            },
            fk(src, tgt) {
                if (!("column" in tgt) && ("fk" in schema[src.table][src.column])) {
                    setTimeout(() => {
                        if (confirm(`Delete FK ${src.table}.${src.column}=>${schema[src.table][src.column].fk.table}.${schema[src.table][src.column].fk.column} ?`)) {
                            try {
                                ucc.diff((() => {
                                    ucc.deleteFK(src.table, src.column);
                                }));
                            } catch (e) {
                                error(e.message);
                            }
                            conf.schemaUI.redraw();
                        }
                    }, 1);
                } else if ("column" in tgt) {
                    if (schema[src.table][src.column].type != schema[tgt.table][tgt.column].type) {
                        error(`Incompatible types ${schema[src.table][src.column].type}<>${schema[tgt.table][tgt.column].type}`);
                        return;
                    }
                    if ("fk" in schema[src.table][src.column]) {
                        if (!confirm(`Replace FK ${src.table}.${src.column}=>${schema[src.table][src.column].fk.table}.${schema[src.table][src.column].fk.column} ?`)) {
                            return;
                        }
                        try {
                            ucc.diff(() => {
                                ucc.deleteFK(src.table, src.column);
                                ucc.createFK(src.table, src.column, tgt.table, tgt.column);
                            })
                        } catch (e) { error(e.message); }
                    } else {
                        try {
                            ucc.diff(() => {
                                ucc.createFK(src.table, src.column, tgt.table, tgt.column);
                            })
                        } catch (e) { error(e.message); }
                    }
                    conf.schemaUI.redraw();
                }
            }
        }
        return self;
    }

    let defaults = window.editorMergeUtils.defaults;

    function proposeSQL(info, callback) {
        let diag = $('<div title="Updates to the DB" class="proposeSQL"></div>');
        if (info.error) {
            diag.append($('<div class="error">There where errors when processing the SQL: the result will be unpredictable.</div>'));
        }
        if (info.destructive) {
            diag.append($('<div class="error">The SQL operations are destuctive and you may lose data from tables and/or columns.</div>'));
        }
        let action = $('<select>');
        diag.append($('<div>Action: </div>').append(action));
        let warns = $('<textarea class="warnings">');
        warns.prop('disabled', true);
        diag.append($('<div class="error" style="display:none">Warning messages.</div>'));
        diag.append(warns);
        diag.append($('<div>Generated SQL</div>'));
        let sql = $('<textarea class="sql">');
        sql.prop('disabled', true);
        diag.append(sql);

        action.append($('<option value="update">').text("Update " + info.file));
        action.append($('<option value="create">').text("Recreate from scratch " + info.file));
        action.append($('<option value="new">').text("Create new DB with this schema..."));

        function display(what) {
            if (what.warnings.length > 0) {
                warns.attr('rows', Math.min(10, what.warnings.length));
                warns.val(what.warnings.join('\n'));
                warns.css('display', 'block');
            } else {
                warns.css('display', 'none');
            }
            if (what.sql.length == 0) {
                sql.attr('rows', 1);
                sql.text("The DB schema is already up to date.");
            } else {
                sql.attr('rows', Math.min(20, what.sql.split('\n').length));
                sql.text(what.sql);
            }
        }

        action.on('change', () => {
            switch (action.val()) {
                case "update":
                    display(info.update);
                    break;
                case "create":
                case "new":
                    display(info.create);
                    break;
            }
        });

        action.trigger('change');

        diag.dialog({
            dialogClass: "no-close",
            modal: true,
            minHeight: 400,
            minWidth: 640,
            width: 1024,
            buttons: [{
                text: "Apply action...",
                click() {
                    info.action = action.val();
                    callback(info, () => {
                        diag.dialog("close");
                        diag.remove();
                    });
                }
            }, {
                text: "Cancel",
                click: function () {
                    diag.dialog("close");
                    diag.remove();
                }
            }]
        });
    }

    function message(msg) {
        toastr.options = {
            "allowHtml": true,
            "closeButton": true,
            "debug": true,
            "newestOnTop": false,
            "positionClass": "toast-bottom-right",
            "preventDuplicates": false,
            "onclick": null,
            "showDuration": "300",
            "hideDuration": "2000",
            "timeOut": "2000",
            "extendedTimeOut": "0",
            "showEasing": "swing",
            "hideEasing": "linear",
            "showMethod": "fadeIn",
            "hideMethod": "fadeOut",
            "tapToDismiss": false
        }
        toastr["info"](`${msg}`, "Information");
    }

    function error(msg) {
        toastr.options = {
            "allowHtml": true,
            "closeButton": true,
            "debug": true,
            "newestOnTop": false,
            "positionClass": "toast-bottom-right",
            "preventDuplicates": false,
            "onclick": null,
            "showDuration": "300",
            "hideDuration": "2000",
            "timeOut": "0",
            "extendedTimeOut": "0",
            "showEasing": "swing",
            "hideEasing": "linear",
            "showMethod": "fadeIn",
            "hideMethod": "fadeOut",
            "tapToDismiss": false
        }
        toastr["error"](`${msg}`, "Error");
    }

    function warning(msg) {
        toastr.options = {
            "allowHtml": true,
            "closeButton": true,
            "debug": true,
            "newestOnTop": false,
            "positionClass": "toast-bottom-right",
            "preventDuplicates": true,
            "onclick": null,
            "showDuration": "300",
            "hideDuration": "2000",
            "timeOut": "1000",
            "extendedTimeOut": "0",
            "showEasing": "swing",
            "hideEasing": "linear",
            "showMethod": "fadeIn",
            "hideMethod": "fadeOut",
            "tapToDismiss": false
        }
        toastr["error"](`${msg}`, "Warning");
    }

    $.SQLEditor.init = (el) => {
        el.addClass("sql-root");
        let schemaUI = dbSchemaUI({
            model: schema,
            aliases: {},
            root: el,
            checkboxes: false,
            radios: true,
            selectionModel: sm(ucc),
            emptymessage: "Right-click or Shift+Left-click on this area to start adding a table"
        });
        conf.root = el;
        conf.schemaUI = schemaUI;
    }
    $.SQLEditor.message = message;
    $.SQLEditor.error = error;
    $.SQLEditor.warning = warning;
    $.SQLEditor.editorUCC = editorUCC;
    $.SQLEditor.dbSchemaUI = dbSchemaUI;
    $.SQLEditor.defaults = defaults;
    $.SQLEditor.config = conf;
    $.SQLEditor.proposeSQL = proposeSQL;
    $.SQLEditor.mergeUI = window.mergeUI;
    $.SQLEditor.schema = schema;
    $.SQLEditor.types = types;
    $.SQLEditor.ucc = ucc;
    $.SQLEditor.editorSelectionModel = sm;
    $.SQLEditor.contextOverlay = contextOverlay;
    $.SQLEditor.updateSchema = updateSchema;
    $.SQLEditor.schemaToSql = schemaToSql;
})();
