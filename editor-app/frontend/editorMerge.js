(function() {

    const {
        LOCALSETKO, LOCALSETOK, LOCALUNSET, REMOTESETKO, REMOTESETOK, REMOTEUNSET, CONFLICTSETLOCAL, CONFLICTSETREMOTE, CONFLICTUNSET, NEUTRAL,
        CHECKLOCAL, CHECKREMOTE,
        clearRenamedTable, clearSelections, hasUnset, diffSchemas, diffToActions, resolveSchema, coldef, sameFK, renameTable, scoreDiffTables, autoUpdateRemote
    } = window.editorMergeUtils;
    


    function mergeUI(local, remote, ondone) {
        function callback() {
            // clean up local
            for(let table in local) {
                delete local[table].coords___.renamed;
                for(let column in local[table]) {
                    delete local[table][column].fk2;
                }
            }
            ondone.apply(null,arguments);
        }
        let ui = $('<div>');
        let contextOverlay = $('<div class="contextOverlay noselect">');
        let diag = $('<div title="Sync schema with DB"></div>');
        let schemaUI;
        function setMenu(event, menu) {
            let x = 0;
            let y = 0;
            let c = event.currentTarget;
            let r = c.getBoundingClientRect();
            /*        x += r.x;
                    y += r.y;*/
            contextOverlay.empty();
            contextOverlay.css({
                position: 'absolute',
                left: event.offsetX + x,
                top: event.offsetY + y,
                display: "flex",
                flexDirection: "column"
            });
            ui.append(contextOverlay);
            for (let k in menu) {
                if (menu[k] == null) {
                    contextOverlay.append($('<hr>'));
                } else {
                    let m = $('<div>').html(k);
                    m.addClass('menu-entry');
                    contextOverlay.append(m);
                    m.on("click", function (e) {
                        contextOverlay.empty();
                        contextOverlay.remove();
                        menu[k](e);
                        schemaUI.redraw();
                    });
                }
            }
        }
    
        function checkRenameColumn(schema, colors, menu, target, checks, src, dst) {
            // is rename possible (other column exists with same definition but from other source) ?
            if (!(target.table in schema)) return;
            let def = coldef(schema[target.table][target.column]);
            if ("renamed" in schema[target.table][target.column]) {
                menu[`Rename ${target.column} to ${schema[target.table][target.column].renamed.name}`] = () => {
                    let other = schema[target.table][target.column].renamed;
                    delete schema[target.table][target.column].renamed;
                    other.renamed = schema[target.table][target.column];
                    let newCols = {};
                    for (let c in schema[target.table]) {
                        if (c == target.column) {
                            newCols[other.name] = other;
                        } else {
                            newCols[c] = schema[target.table][c];
                        }
                    }
                    schema[target.table] = newCols;
                    colors[target.table][other.name].coords___ = (colors[target.table][target.column].coords___ == LOCALSETOK ? REMOTESETOK : LOCALSETOK);
                    if ("fk" in schema[target.table][other.name]) colors[target.table][other.name].fk.coords___ = colors[target.table][other.name].coords___;
                };
            }
            for (let column in schema[target.table]) {
                if (column .endsWith("___")) continue;
                if ((column in colors[target.table]) && checks.indexOf(colors[target.table][column].coords___) != -1 && coldef(schema[target.table][column]) == def && sameFK(schema[target.table][target.column], schema[target.table][column])) {
                    // this column has the right color and the same definition of this => propose rename
                    menu[`Rename ${target.column} to ${column}`] = () => {
                        schema[target.table][column].renamed = schema[target.table][target.column];
                        colors[target.table][column].coords___ = dst;
                        let newCols = {}; // reinsert into a new object to have the correct order
                        for (let c in schema[target.table]) {
                            if (c == target.column) {
                                newCols[column] = schema[target.table][column];
                            } else if (c != column) {
                                newCols[c] = schema[target.table][c];
                            }
                        }
                        schema[target.table] = newCols;
                        delete schema[target.table].coords___.height;
                        if ("fk" in schema[target.table][column]) colors[target.table][column].fk.coords___ = dst;
                    };
                    menu[`Rename ${column} to ${target.column}`] = () => {
                        schema[target.table][target.column].renamed = schema[target.table][column];
                        colors[target.table][target.column].coords___ = src;
                        let newCols = {}; // reinsert into a new object to have the correct order
                        for (let c in schema[target.table]) {
                            if (c != column) {
                                newCols[c] = schema[target.table][c];
                            }
                        }
                        schema[target.table] = newCols;
                        delete schema[target.table].coords___.height;
                        if ("fk" in schema[target.table][target.column]) colors[target.table][target.column].fk.coords___ = src;
                    };
                }
            }
        }
    
        function almostSameTable(table1, table2) {
            return scoreDiffTables(schema,table1,table2)>0.75;
        }
    
        function checkRenameTable(menu, table, checks, src, dst) {
    
            if (!(table in schema)) return;
            for (let other in schema) {
                if (other == table) continue;
                if (checks.indexOf(colors[other].coords___) != -1 && almostSameTable(table, other)) {
                    menu[`Rename ${table} to ${other}`] = () => {
                        renameTable(local,remote,schema, colors, table, other, schema[table].coords___, dst);
                    };
                    menu[`Rename ${other} to ${table}`] = () => {
                        renameTable(local,remote,schema, colors, other, table, schema[table].coords___, src);
                    };
                }
            }
        }
    
        let sm = {
            select(target, event) {
                contextOverlay.remove();
                if ("fk" in target) {
                    let c = colors[target.table][target.column].fk.coords___;
                    function unsetfk2() {
                        if ("fk2" in schema[target.table][target.column]) {
                            colors[target.table][target.column].fk.fk1 = schema[target.table][target.column].fk;
                            colors[target.table][target.column].fk.fk2 = schema[target.table][target.column].fk2;
                            delete schema[target.table][target.column].fk2;
                            delete schema[target.table][target.column].fk;
                        }
                    }
                    function resetfk2() {
                        if ("fk2" in colors[target.table][target.column].fk) {
                            schema[target.table][target.column].fk2 = colors[target.table][target.column].fk.fk2;
                            delete colors[target.table][target.column].fk.fk2;
                        }
                    }
                    if (c == LOCALUNSET || c == LOCALSETKO || c == LOCALSETOK) {
                        setMenu(event, {
                            "Local schema: accept FK"() {
                                colors[target.table][target.column].fk.coords___ = LOCALSETOK;
                            },
                            "Local schema: reject FK"() {
                                colors[target.table][target.column].fk.coords___ = LOCALSETKO;
                            }
                        });
                    } else if (c == REMOTEUNSET || c == REMOTESETKO || c == REMOTESETOK) {
                        setMenu(event, {
                            "External DB: accept FK"() {
                                colors[target.table][target.column].fk.coords___ = REMOTESETOK;
                            },
                            "External DB: reject FK"() {
                                colors[target.table][target.column].fk.coords___ = REMOTESETKO;
                            }
                        });
                    } else if (c == CONFLICTSETLOCAL || c == CONFLICTSETREMOTE || c == CONFLICTUNSET) {
                        let menu = {};
                        menu[`Local schema: accept FK ${target.table}.${target.column}->${target.fk.table}.${target.fk.column}`] =
                            function () {
                                unsetfk2();
                                colors[target.table][target.column].fk.coords___ = CONFLICTSETLOCAL;
                                schema[target.table][target.column].fk = colors[target.table][target.column].fk.fk1;
                            };
                        let fk2 = schema[target.table][target.column].fk2 || colors[target.table][target.column].fk.fk2;
                        menu[`External DB: accept FK ${target.table}.${target.column}->${fk2.table}.${fk2.column}`] =
                            function () {
                                unsetfk2();
                                colors[target.table][target.column].fk.coords___ = CONFLICTSETREMOTE;
                                schema[target.table][target.column].fk = colors[target.table][target.column].fk.fk2;
                            };
                        setMenu(event, menu);
                    }
                } else if ("column" in target) {
                    let c = colors[target.table][target.column].coords___;
                    if (c == LOCALUNSET || c == LOCALSETKO || c == LOCALSETOK) {
                        let menu = {
                            "Local schema: accept column"() {
                                colors[target.table][target.column].coords___ = LOCALSETOK;
                            },
                            "Local schema: reject column"() {
                                colors[target.table][target.column].coords___ = LOCALSETKO;
                                if ("renamed" in schema[target.table][target.column]) { // reintroduce missing column
                                    let other = schema[target.table][target.column].renamed;
                                    delete schema[target.table][target.column].renamed;
                                    schema[target.table][other.name] = other;
                                    colors[target.table][other.name].coords___ = REMOTEUNSET;
                                    delete schema[target.table].coords___.height;
                                }
                            }
                        }
                        checkRenameColumn(schema, colors, menu, target, [REMOTEUNSET, REMOTESETKO, REMOTESETOK], LOCALSETOK, REMOTESETOK);
                        setMenu(event, menu);
                    } else if (c == REMOTEUNSET || c == REMOTESETKO || c == REMOTESETOK) {
                        let menu = {
                            "External DB: accept column"() {
                                colors[target.table][target.column].coords___ = REMOTESETOK;
                            },
                            "External DB: reject column"() {
                                colors[target.table][target.column].coords___ = REMOTESETKO;
                                if ("renamed" in schema[target.table][target.column]) { // reintroduce missing column
                                    let other = schema[target.table][target.column].renamed;
                                    delete schema[target.table][target.column].renamed;
                                    schema[target.table][other.name] = other;
                                    colors[target.table][other.name].coords___ = LOCALUNSET;
                                    delete schema[target.table].coords___.height;
                                }
                            }
    
                        }
                        checkRenameColumn(schema, colors, menu, target, [LOCALUNSET, LOCALSETKO, LOCALSETOK], REMOTESETOK, LOCALSETOK);
                        setMenu(event, menu);
                    } else if (c == CONFLICTSETLOCAL || c == CONFLICTSETREMOTE || c == CONFLICTUNSET) {
                        let menu = {};
                        menu["Local schema: " + coldef(schema[target.table][target.column])] = () => {
                            colors[target.table][target.column].coords___ = CONFLICTSETLOCAL;
                        }
                        menu["External DB: " + coldef(colors[target.table][target.column])] = () => {
                            colors[target.table][target.column].coords___ = CONFLICTSETREMOTE;
                        }
                        setMenu(event, menu);
                    }
                } else if ("table" in target) {
                    if ("renamed" in schema[target.table].coords___) {
                        let saved = schema[target.table].coords___.renamed;
                        let all = $.extend({}, saved); // figure out other name by removing the other keys
                        delete all.fks123;
                        for (let k in all) {
                            if (k.endsWith("_color123")) { delete all[k] };
                        }
                        delete all[target.table];
                        let other = Object.keys(all)[0];
                        setMenu(event, {
                            [`Rename ${target.table} to ${other}`]: () => {
                                renameTable(target.table, other, schema[target.table].coords___, colors[target.table].coords___ == LOCALSETOK ? REMOTESETOK : LOCALSETOK);
                            },
                            [`Revert renaming`]:()=>{
                                clearRenamedTable(schema,colors,target.table);
                            }
                        });
                    } else if (colors.dummy.conflicts___!==undefined) {
                        setMenu(event, {
                            [`Local schema: accept CHECK`]: () => {
                                colors[target.table].coords___ = LOCALSETOK;
                                //renameTable(target.table, other, schema[target.table].coords___, colors[target.table].coords___ == LOCALSETOK ? REMOTESETOK : LOCALSETOK);
                            },
                            [`External schema: accept CHECK`]:()=>{
                                colors[target.table].coords___ = REMOTESETOK;
                                //clearRenamedTable(schema,colors,target.table);
                            }
                        });
                    } else {
                        let hasLocal = false;
                        let hasRemote = false;
                        for (let column in colors[target.table]) {
                            if (column .endsWith("___")) continue;
                            if (!hasLocal && colors[target.table][column].coords___ == LOCALUNSET || colors[target.table][column].coords___ == LOCALSETKO || colors[target.table][column].coords___ == LOCALSETOK) {
                                hasLocal = true;
                            }
                            if (!hasRemote && colors[target.table][column].coords___ == REMOTEUNSET || colors[target.table][column].coords___ == REMOTESETKO || colors[target.table][column].coords___ == REMOTESETOK) {
                                hasRemote = true;
                            }
    
                        }
                        if (colors[target.table].coords___ == LOCALUNSET || colors[target.table].coords___ == LOCALSETKO || colors[target.table].coords___ == LOCALSETOK) {
                            let menu = {
                                "Local schema: accept table and columns"() {
                                    resolveSchema({ [target.table]: schema[target.table] },
                                        { [target.table]: colors[target.table] },
                                        { [CONFLICTUNSET]: CONFLICTSETLOCAL, [CONFLICTSETREMOTE]: CONFLICTSETLOCAL, [LOCALUNSET]: LOCALSETOK, [LOCALSETKO]: LOCALSETOK });
                                },
                                "Local schema: accept table only"() {
                                    colors[target.table].coords___ = LOCALSETOK;
                                },
                                "Local schema: reject table and columns"() {
                                    resolveSchema({ [target.table]: schema[target.table] },
                                        { [target.table]: colors[target.table] },
                                        { [CONFLICTUNSET]: CONFLICTSETREMOTE, [CONFLICTSETLOCAL]: CONFLICTSETREMOTE, [LOCALUNSET]: LOCALSETKO, [LOCALSETOK]: LOCALSETKO });
                                },
                                "Local schema: reject table only"() {
                                    colors[target.table].coords___ = LOCALSETKO;
                                },
                            };
                            checkRenameTable(menu, target.table, [REMOTEUNSET, REMOTESETKO, REMOTESETOK], LOCALSETOK, REMOTESETOK);
                            setMenu(event, menu);
                        } else if (colors[target.table].coords___ == REMOTEUNSET || colors[target.table].coords___ == REMOTESETKO || colors[target.table].coords___ == REMOTESETOK) {
                            let menu = {
                                "External DB: accept table and columns"() {
                                    resolveSchema({ [target.table]: schema[target.table] },
                                        { [target.table]: colors[target.table] },
                                        { [CONFLICTUNSET]: CONFLICTSETREMOTE, [CONFLICTSETLOCAL]: CONFLICTSETREMOTE, [REMOTEUNSET]: REMOTESETOK, [REMOTESETKO]: REMOTESETOK });
                                },
                                "External DB: accept table only"() {
                                    colors[target.table].coords___ = REMOTESETOK;
                                },
                                "External DB: reject table and columns"() {
                                    resolveSchema({ [target.table]: schema[target.table] },
                                        { [target.table]: colors[target.table] },
                                        { [CONFLICTUNSET]: CONFLICTSETLOCAL, [CONFLICTSETREMOTE]: CONFLICTSETLOCAL, [REMOTEUNSET]: REMOTESETKO, [REMOTESETOK]: REMOTESETKO });
                                },
                                "External DB: reject table only"() {
                                    colors[target.table].coords___ = REMOTESETKO;
                                },
                            };
                            checkRenameTable(menu, target.table, [LOCALUNSET, LOCALSETKO, LOCALSETOK], REMOTESETOK, LOCALSETOK);
                            setMenu(event, menu);
                        } else if (hasRemote || hasLocal) {
                            let menu = {};
                            if (hasLocal) {
                                menu["Local schema: accept all columns"] = () => {
                                    resolveSchema({ [target.table]: schema[target.table] },
                                        { [target.table]: colors[target.table] },
                                        { [CONFLICTUNSET]: CONFLICTSETLOCAL, [CONFLICTSETREMOTE]: CONFLICTSETLOCAL, [LOCALUNSET]: LOCALSETOK, [LOCALSETKO]: LOCALSETOK });
                                };
                                menu["Local schema: reject all columns"] = () => {
                                    resolveSchema({ [target.table]: schema[target.table] },
                                        { [target.table]: colors[target.table] },
                                        { [CONFLICTUNSET]: CONFLICTSETREMOTE, [CONFLICTSETLOCAL]: CONFLICTSETREMOTE, [LOCALUNSET]: LOCALSETKO, [LOCALSETOK]: LOCALSETKO });
                                };
                            }
                            if (hasRemote) {
                                if (hasLocal) menu["sep"] = null;
                                menu["External DB: accept all columns"] = () => {
                                    resolveSchema({ [target.table]: schema[target.table] },
                                        { [target.table]: colors[target.table] },
                                        { [CONFLICTUNSET]: CONFLICTSETREMOTE, [CONFLICTSETLOCAL]: CONFLICTSETREMOTE, [REMOTEUNSET]: REMOTESETOK, [REMOTESETKO]: REMOTESETOK });
                                };
                                menu["External DB: reject all columns"] = () => {
                                    resolveSchema({ [target.table]: schema[target.table] },
                                        { [target.table]: colors[target.table] },
                                        { [CONFLICTUNSET]: CONFLICTSETLOCAL, [CONFLICTSETREMOTE]: CONFLICTSETLOCAL, [REMOTEUNSET]: REMOTESETKO, [REMOTESETOK]: REMOTESETKO });
                                };
                            }
                            setMenu(event, menu);
                        }
                    }
                }
            },
            isSelected(target, event) { return false; },
            color(target) {
                if ("fk" in target) {
                    return colors[target.table][target.column].fk.coords___;
                } else if ("column" in target) {
                    return colors[target.table][target.column].coords___;
                } else if ("table" in target) {
                    return colors[target.table].coords___;
                }
            },
            clear(event) {
                contextOverlay.remove();
                if (event && event.which == 3) {
                    setMenu(event, {
                        "Local schema: accept all"() {
                            resolveSchema(schema, colors,
                                { [CONFLICTUNSET]: CONFLICTSETLOCAL, [CONFLICTSETREMOTE]: CONFLICTSETLOCAL, [LOCALUNSET]: LOCALSETOK, [LOCALSETKO]: LOCALSETOK });
                        },
                        "Local schema: accept undecided"() {
                            resolveSchema(schema, colors,
                                { [CONFLICTUNSET]: CONFLICTSETLOCAL, [LOCALUNSET]: LOCALSETOK });
                        },
                        "Local schema: reject all"() {
                            resolveSchema(schema, colors,
                                { [CONFLICTUNSET]: CONFLICTSETREMOTE, [CONFLICTSETLOCAL]: CONFLICTSETREMOTE, [LOCALUNSET]: LOCALSETKO, [LOCALSETOK]: LOCALSETKO });
                        },
                        "Local schema: reject undecided"() {
                            resolveSchema(schema, colors,
                                { [CONFLICTUNSET]: CONFLICTSETREMOTE, [LOCALUNSET]: LOCALSETKO });
                        },
                        "sep1": null,
                        "External DB: accept all"() {
                            resolveSchema(schema, colors,
                                { [CONFLICTUNSET]: CONFLICTSETREMOTE, [CONFLICTSETLOCAL]: CONFLICTSETREMOTE, [REMOTEUNSET]: REMOTESETOK, [REMOTESETKO]: REMOTESETOK });
                        },
                        "External DB: accept undecided"() {
                            resolveSchema(schema, colors,
                                { [CONFLICTUNSET]: CONFLICTSETREMOTE, [REMOTEUNSET]: REMOTESETOK });
                        },
                        "External DB: reject all"() {
                            resolveSchema(schema, colors,
                                { [CONFLICTUNSET]: CONFLICTSETLOCAL, [CONFLICTSETREMOTE]: CONFLICTSETLOCAL, [REMOTEUNSET]: REMOTESETKO, [REMOTESETOK]: REMOTESETKO });
                        },
                        "External DB: reject undecided"() {
                            resolveSchema(schema, colors,
                                { [CONFLICTUNSET]: CONFLICTSETLOCAL, [REMOTEUNSET]: REMOTESETKO });
                        },
                        "sep2": null,
                        "Clear all selections"() {
                            clearSelections(schema, colors);
                        }
                    });
                }
            }
        }
    
        let legend = $('<div class="legend">');
        legend.append(`<div><span style="color:${LOCALUNSET}">&#x25a0;</span> Present in local schema and absent in external DB (<span style="color:${LOCALSETOK}">&#x25a0;</span> accepted  <span style="color:${LOCALSETKO}">&#x25a0;</span> rejected),
        <span style="color:${REMOTEUNSET}">&#x25a0;</span> Present in external DB and absent in local schema (<span style="color:${REMOTESETOK}">&#x25a0;</span> accepted  <span style="color:${REMOTESETKO}">&#x25a0;</span> rejected),
        <span style="color:${CONFLICTUNSET}">&#x25a0;</span> local schema in conflict with external DB.</div>`);
        diag.append(legend);
        diag.append(ui);
    
        let { schema, colors } = diffSchemas(local, remote);
    
        diag.dialog({
            dialogClass: "no-close custom-dialog",
            modal: true,
            minHeight: 400,
            minWidth: 640,
            width: $('body').parent().width() - 100,
            height: $('body').parent().height() - 100,
            buttons: [{
                "class":"push-left",
                text:"Auto update external DB",
                click(){
                    clearSelections(schema, colors);
                    autoUpdateRemote(local,remote,schema,colors);
                    schemaUI.redraw();
                }
            },{
                text: "Proceed...",
                click() {
                    let remoteActions = diffToActions(schema, colors, LOCALSETOK, REMOTESETKO, CONFLICTSETLOCAL, CHECKLOCAL);
                    let localActions = diffToActions(schema, colors, REMOTESETOK, LOCALSETKO, CONFLICTSETREMOTE, CHECKREMOTE);
    
                    if (hasUnset(schema, colors)) {
                        setTimeout(() => {
                            if (confirm("Some elements have not been decided, do you want to proceed with a partial result?")) {
                                proceed();
                            }
                        }, 1);
                    } else {
                        proceed();
                    }
                    function proceed() {
                        callback(localActions, remoteActions);
                        diag.dialog("close");
                        schemaUI.destroy();
                        diag.remove();
                    }
                }
            }, {
                text: "Cancel",
                click: function () {
                    diag.dialog("close");
                    schemaUI.destroy();
                    diag.remove();
                }
            }],
            create: () => {
                // avoids weird canvas draw issues, by letting the browser the opportunity to cdisplay the canvas first
                setTimeout(() => {
                    let annotations={};
                    for(let t in colors) {
                        for(let c in colors[t]) {
                            if (c=="conflicts___") {
                                if (!(t in annotations)) {
                                    annotations[t]={};
                                }
                                annotations[t].conflicts___=colors[t][c];
                            }
                            if (c.endsWith("___")) continue;
                            if ("conflicts" in colors[t][c]) {
                                if (!(t in annotations)) {
                                    annotations[t]={};
                                }
                                annotations[t][c]=colors[t][c].conflicts;
                            }
                        }
                    }
                    schemaUI = dbSchemaUI({
                        model: schema,
                        aliases: {},
                        root: ui,
                        checkboxes: false,
                        radios: false,
                        colors: true,
                        selectionModel: sm,
                        annotations
                    });
                }, 1);
            }
        }).dialogExtend({
            maximazable: true,
            closable: false,
            dblclick: 'maximize',
        });
    }
    
    if (typeof window!="undefined") window.mergeUI = mergeUI;
    if (typeof module!="undefined") module.exports = mergeUI;

})();

