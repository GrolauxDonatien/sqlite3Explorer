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
        contextOverlay.removeAttr('data-table');
        contextOverlay.removeAttr('data-column');
        contextOverlay.removeAttr('data-clientx');
        contextOverlay.removeAttr('data-clienty');
        contextOverlay.off('keydown');
    }

    function positionContextOverlay(event) {
        let r = (event.currentTarget || event.target).getBoundingClientRect();
        contextOverlay.css({
            position: 'absolute',
            left: event.offsetX + r.x,
            top: event.offsetY + r.y - 8
        });
    }

    function toNumber(s) {
        return parseFloat(s.substring(0, s.length - 2))
    }

    function ontablemove(event) {
        let table = contextOverlay.attr('data-table');
        if (event.table == table) {
            contextOverlay.css({
                left: toNumber(contextOverlay.css('left')) + event.tx - event.ox,
                top: toNumber(contextOverlay.css('top')) + event.ty - event.oy,
            })
        }
    }

    function ontablescroll() {
        let table = contextOverlay.attr('data-table');
        if (table) {
            let r = contextOverlay.parent().find('canvas')[0].getBoundingClientRect();
            contextOverlay.css({
                left: toNumber(contextOverlay.css('left')) + r.x - parseFloat(contextOverlay.attr('data-clientx')),
                top: toNumber(contextOverlay.css('top')) + r.y - parseFloat(contextOverlay.attr('data-clienty'))
            })
            contextOverlay.attr('data-clientx', r.x);
            contextOverlay.attr('data-clienty', r.y);
        }
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

    function editStructure(table) {
        function keydown(event) {
            if (event.key.length == 1 && validChars.indexOf(event.key) == -1) {
                warning("Invalid key (letters and _ only)");
                event.preventDefault();
                event.stopPropagation();
            }
        }
        let diag = $(`<div title="Edit structure of ${table}"></div>`);
        let p1 = $('<div><b><label for="tblname">Name:</label></b><input type="text" id="tblname"><span class="error"></span><button style="float:right">Drop Table...</button></div>');
        diag.append(p1);

        p1.find('button').on('click', async () => {
            if (confirm("Do you want to delete " + table + " ?")) {
                ucc.diff(() => {
                    ucc.deleteTable(table);
                    conf.schemaUI.redraw();
                    diag.dialog("close");
                    diag.remove();
                });
            };
        });
        p1.find('input').on('keydown', keydown);
        p1.find('input').val(table);
        diag.append('<hr>');
        let p2 = $('<div><b>Columns definitions</b><br></div>');
        diag.append(p2);
        let tbl2 = $('<table>');
        p2.append(tbl2);
        diag.append('<hr>');
        let p3 = $('<div><b>CHECK constraints</b><br></div>');
        diag.append(p3);
        let tbl3 = $('<table>');
        p3.append(tbl3);
        let opts = [];
        for (let k in types) {
            for (let n in types[k]) {
                for (let i = 0; i < types[k][n].length; i++) {
                    opts.push({ t: types[k][n][i], n: parseInt(n) });
                }
            }
        }
        opts.sort((a, b) => { return a.t.localeCompare(b.t); });

        function renderType(row) {
            let html = [];
            html.push('<select>');
            let bounds = {};
            let n = 0;
            for (let i = 0; i < opts.length; i++) {
                if (opts[i].t == row.type) {
                    html.push(`<option value="${opts[i].t}" data-args="${opts[i].n}" selected>${mispaf.escape(opts[i].t)}</option>`);
                    bounds = row.bounds;
                    n = opts[i].n;
                } else {
                    html.push(`<option value="${opts[i].t}" data-args="${opts[i].n}">${mispaf.escape(opts[i].t)}</option>`);
                }
            }
            html.push('</select>');
            let boundKeys = Object.keys(bounds);
            for (let i = 0; i < n; i++) {
                if (i == 0) {
                    html.push('(');
                } else {
                    html.push(',');
                }
                html.push(`<input class="coldefnumber" type="number" minimum="0" value="${bounds[boundKeys[i]]}">`);
                if (i == n - 1) html.push(')');
            }
            return html.join('');
        }

        let columns = [];
        for (let k in schema[table]) {
            if (k.endsWith("___")) continue;
            columns.push(JSON.parse(JSON.stringify(schema[table][k])));
        }

        let checks = JSON.parse(JSON.stringify(schema[table].checks___ || []));

        function bindType(event, row) {
            let tr = $(event.target.parentElement.parentElement);
            let str = tr.find('select').val();
            let n = parseInt(tr.find('select :selected').attr('data-args'));
            if (isNaN(n)) n = 0;
            let inputs = tr.find('input[type="number"]');
            if (n > 0) {
                for (let i = 0; i < n; i++) {
                    if (i == 0) {
                        str += "(";
                    } else {
                        str += ",";
                    }
                    str += (inputs[i] == undefined || inputs[i].value == "") ? 0 : inputs[i].value;
                }
                str += ")";
            }
            $.SQLEditor.internalTypeToType(str, (s) => {
                let checks = tr.find('input[type="checkbox"]');
                s.nullable = !checks[2].checked;
                s.auto = checks[3].checked;
                s.name = row.name;
                s.pk = checks[0].checked;
                s.unique = checks[1].checked;
                if ("fk" in row) s.fk = row.fk;
                for (let k in row) {
                    delete row[k];
                }
                for (let k in s) {
                    row[k] = s[k];
                }
                tr.find('td:nth(1)').html(renderType(row));
                tr.find('select, input').on('change', (event) => bindType(event, row));
            });
        }

        let t1 = smartTable({
            root: tbl2[0],
            columns: [
                {
                    title: "Name",
                    width: '100%',
                    render(row) {
                        return row.name;
                    },
                    onedit(el, row, val) {
                        row.name = val;
                    },
                    onevent: {
                        render:(event)=>{
                            $(event.target).find('input').on('keydown', keydown);
                        }
                    }
                },
                {
                    title: "Type",
                    render(row) {
                        return renderType(row);
                    },
                    onevent: {
                        'change:select': bindType,
                        'change:input': bindType
                    }
                },
                {
                    title: "PK",
                    tooltip: "PRIMARY KEY constraint",
                    render(row) {
                        return `<input title="PRIMARY KEY constraint" type="checkbox" ${row.pk ? "checked" : ""}>`;
                    },
                    onevent: {
                        'change:input'(event, row) {
                            let checks = $(event.target.parentElement.parentElement).find('input[type="checkbox"]');
                            row.pk = event.target.checked;
                            if (row.pk && row.type == "integer") {
                                checks[1].checked = true;
                                checks[1].disabled = true;
                                row.unique = true;
                                checks[2].checked = true;
                                checks[2].disabled = true;
                                row.nullable = false;
                                checks[3].checked = true;
                                row.auto = true;
                            } else {
                                checks[1].disabled = false;
                                checks[2].disabled = false;
                                checks[3].checked = false;
                                row.auto = false;
                            }
                        }
                    }
                },
                {
                    title: "UQ",
                    tooltip: "UNIQUE constraint",
                    render(row) {
                        return `<input title="UNIQUE constraint" type="checkbox" ${row.unique ? "checked" : ""} ${(row.type == "integer" && row.pk == true) ? "disabled" : ""}>`;
                    },
                    onevent: {
                        'change:input'(event, row) {
                            row.unique = event.target.checked;
                        }
                    }
                },
                {
                    title: "NN",
                    tooltip: 'NOT NULL constraint',
                    render(row) {
                        return `<input title="NOT NULL constraint" type="checkbox" ${row.nullable ? "" : "checked"} ${(row.type == "integer" && row.pk == true) ? "disabled" : ""}>`;
                    },
                    onevent: {
                        'change:input'(event, row) {
                            row.nullable = !event.target.checked;
                        }
                    }
                },
                {
                    title: "Auto",
                    tooltip: "Values are automatically generated",
                    render(row) {
                        return `<input title="Values are automatically generated" type="checkbox" disabled ${row.auto ? "checked" : ""}>`;
                    }
                },
                {
                    title: "",
                    render(row) {
                        return `<button class="icon" data-name="${mispaf.escape(row.name)}">&#128465;</button>`;
                    },
                    onevent: {
                        'click:button'(event, row) {
                            t1.removeRow(row);
                        }
                    }
                }
            ],
            onadd() {
                t1.appendRow({
                    auto: false,
                    bounds: {},
                    format: "number",
                    internalType: "integer",
                    name: '',
                    nullable: true,
                    pk: false,
                    type: 'integer',
                    unique: false
                });
                tbl2.find('tbody tr:last>td:first')[0].focus();
            }
        })

        tbl2.on('keydown', (event) => {
            if (event.target.parentElement.tagName == "TR" && event.target.parentElement.children[0] == event.target) {
                keydown(event);
            }
        });

        let t2 = smartTable({
            root: tbl3[0],
            columns: [{
                title: 'Condition',
                width: '100%',
                render(row) {
                    return mispaf.escape(row);
                },
                onedit(el, row, val) {
                    t2.get()[t2.get().indexOf(row)] = val;
                }
            },
            {
                title: "",
                render(row) {
                    return '<button class="icon">&#128465;</button>';
                },
                onevent: {
                    'click:button'(event, row) {
                        t2.removeRow(row);
                    }
                }
            }],
            onadd() {
                t2.appendRow("");
                tbl3.find('tbody tr:last>td:first')[0].focus();
            }
        })

        diag.dialog({
            dialogClass: "no-close",
            modal: true,
            minHeight: 120,
            maxHeight: 600,
            minWidth: 640,
            buttons: [{
                text: "Ok",
                click: function () {
                    let name = p1.find('input').val().trim();
                    if (name == "") {
                        warning("Missing a name for this column");
                        return;
                    }
                    let cols = {};
                    columns = t1.get();
                    for (let i = 0; i < columns.length; i++) {
                        columns[i].name=columns[i].name.trim(); // just in case
                        if (columns[i].name in cols) {
                            warning(`${columns[i].name} is defined several times.`);
                            return;
                        }
                        if (columns[i].name == "") {
                            warning(`A column has no name (Arya Stark).`);
                            return;
                        }
                        cols[columns[i].name] = true;
                    }
                    function check(tree) {
                        if (tree.type == "Identifier" && !(tree.name in cols)) {
                            warning(`Unknown identifier ${tree.name} in CHECK`);
                            return;
                        }
                        if ("left" in tree) check(tree.left);
                        if ("right" in tree) check(tree.right);
                    }
                    checks = t2.get();
                    for (let i = 0; i < checks.length; i++) {
                        try {
                            if (checks[i].trim() == "") {
                                warning("Empty CHECK constraint.");
                                return;
                            }
                            let tree = window.parsers.parseWhere(checks[i]);
                            check(tree);
                        } catch (e) {
                            warning("Syntax error in CHECK: " + checks[i]);
                            return
                        }
                    }
                    ucc.diff(() => {
                        if (table != name) {
                            ucc.renameTable(table, name);
                        }

                        let onames = [];
                        tbl2.find('tbody [data-name]').each((i, el) => { onames.push(el.getAttribute('data-name')) });
                        // rename columns ?
                        for (let i = 0; i < columns.length; i++) {
                            if (onames[i] != '' && columns[i].name != onames[i]) {
                                ucc.renameColumn(name, onames[i], columns[i].name);
                            }
                        }
                        let cols = {};
                        for (let i = 0; i < columns.length; i++) cols[columns[i].name] = columns[i];
                        for (let k in schema[name]) {
                            if (k.endsWith('___')) continue;
                            if (k in cols) {
                                if (!deepEqual(schema[name][k], cols[k])) {
                                    ucc.editColumn(name, k, cols[k]);
                                }
                            } else {
                                ucc.deleteColumn(name, k);
                            }
                        }
                        for (let k in cols) {
                            if (!(k in schema[name])) {
                                ucc.addColumn(name, cols[k]);
                            }
                        }
                        if (!(deepEqual(schema[name].checks___ || [], checks))) {
                            ucc.setChecks(name, checks);
                        }
                        delete schema[name].coords___.width;
                        delete schema[name].coords___.height;
                        conf.schemaUI.redraw();
                    });
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


        t1.set(columns);

        t2.set(checks);
    }


    function mutate(o) {
        return $.extend({}, o);
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
                        let r = (event.currentTarget || event.target).getBoundingClientRect();
                        contextOverlay.css({
                            position: 'absolute',
                            left: schema[target.table].coords___.x - 1 + r.x + conf.padx,
                            top: schema[target.table].coords___.y - 1 + r.y + conf.pady,
                            width: schema[target.table].coords___.width - 8,
                            height: conf.schemaUI.textHeight
                        });
                        contextOverlay.attr('data-table', target.table);
                        contextOverlay.attr('data-clientx', r.x);
                        contextOverlay.attr('data-clienty', r.y);
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
                        let r = (event.currentTarget || event.target).getBoundingClientRect();
                        let t = schema[target.table].coords___.columns[target.column];
                        contextOverlay.css({
                            position: 'absolute',
                            left: t.x - 1 + r.x + conf.schemaUI.textHeight * 3 - 4,
                            top: t.y - 9 + r.y,
                            width: schema[target.table].coords___.width - 4 - conf.schemaUI.textHeight * 3,
                            height: conf.schemaUI.textHeight
                        });
                        contextOverlay.attr('data-table', target.table);
                        contextOverlay.attr('data-column', target.column);
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
                    } else if ("table" in target) {
                        if (target.table in schema) { // sanity check
                            let menu = {
                                [`Change structure of <i>${target.table}</i>...`]: () => {
                                    editStructure(target.table);
                                    selected = {};
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
                            event = mutate(event);
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
            emptymessage: "Right-click or Shift+Left-click on this area to start adding a table",
            ontablemove
        });
        conf.root = el;
        conf.schemaUI = schemaUI;
        el.on('scroll', ontablescroll);
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
