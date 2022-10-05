(function () {

    /* dependencies of the structure a SQL query :
        SELECT => FROM + GROUP BY + ORDER BY
        FROM =>
        WHERE => FROM
        GROUP BY => FROM
        HAVING => FROM + SELECT
    */

    let dbSchemaUI = window.dbviewer.dbSchemaUI;
    let SYNCDELAY = 250;

    $('body').on('focus', '[contenteditable]', function () {
        const $this = $(this);
        $this.data('before', $this.html());
    }).on('blur keyup paste input', '[contenteditable]', function () {
        const $this = $(this);
        if ($this.data('before') !== $this.html()) {
            $this.data('before', $this.html());
            $this.trigger('change');
        }
    });


    function getTableAliasName(from) {
        return {
            alias: ("alias" in from ? from.alias : from.table),
            table: from.table,
            name: (("alias" in from && from.alias != from.table) ? (from.table + " " + from.alias) : from.table)
        }
    }

    function dbQueryUI({ schemaEl: top, queryEl: bottom, schema, available, model, sql, onchange: globalOnChange }) {

        const FUNCTIONS = {
            "like": "", // simulates where col like 'pattern'
            "in": "", // simulates where col in (a,b,c)
            "xor": "" // simulates where cond1 xor cond2
        }
        let parser;
        if ("parsers" in dbQueryUI) {
            parser = dbQueryUI.parsers;
        } else {
            throw new Error("No parser configured for dbQueryUI.parser");
        }
        let aliases = {};

        top.addClass("queryui");
        top.addClass("top");

        bottom.addClass("queryui");
        bottom.addClass("bottom");

        function getTableIdx(targetTable, avoid) {
            for (let i = 0; i < model.from.length; i += 2) {
                if (i === avoid) continue;
                let name = getTableAliasName(model.from[i]);
                if (targetTable == name.name) {
                    return i;
                }
            }
            return -1;
        }

        let availables = [];
        for (let i = 0; i < available.length; i++) {
            for (let k in available[i]) {
                if (k.indexOf(".") != -1) availables.push(k);
            }
        }

        availables.sort((a, b) => {
            return b.length - a.length;
        });

        function fixOutsideRefCondition(cond) {
            // preprocess cond with availables
            for (let i = 0; i < availables.length; i++) {
                let idx;
                while ((idx = cond.indexOf(availables[i])) != -1) {
                    cond = cond.substring(0, idx) + `___replacer${i}___` + cond.substring(idx + availables[i].length);
                }
            }
            return cond;
        }

        function processCondition(cond, acceptable = schema) {
            let ret = {};
            if (cond.trim() == "") {
                return {
                    subqueries: {},
                    preformat: ""
                }
            }
            try {
                cond = fixOutsideRefCondition(cond);
                let { identifiers, subqueries, preformat } = parser.processCondition(cond);
                ret.subqueries = subqueries;
                ret.preformat = preformat;
                for (let a in identifiers) {
                    if (a === "") {
                        let ok = true;
                        for (let c in identifiers[a]) {
                            if (!identifiers[a][c].startsWith("___replacer")) ok = false;
                        }
                        if (ok) continue;
                    }
                    if (a in acceptable) {
                        for (let c in identifiers[a]) {
                            if (!(c in acceptable[a])) {
                                ret.error = "Invalid column " + identifiers[a][c];
                                break;
                            }
                        }
                        if ("error" in ret) break;
                    } else {
                        ret.error = "Invalid alias " + a;
                        break;
                    }
                }
            } catch (e) {
                ret.error = "Not parseable";
            }
            return ret;
        }

        function isValidGroupBy(sel, tables = schema) {
            function check(tree) {
                if (tree.type == "MemberExpression") {
                    if (tree.computed == true) return false;
                    if (tree.object.type != "Identifier") return false;
                    if (tree.property.type != "Identifier") return false;
                    if (!(tree.object.name in tables)) return false; // not in tables of from
                    if (!(tree.property.name in tables[tree.object.name])) return false; // unknown column
                    return true;
                }
                if ("left" in tree) {
                    if (!check(tree.left)) return false;
                    if ("right" in tree) {
                        if (!check(tree.right)) return false;
                    }
                    return true;
                }
                return false;
            }
            try {
                return check(parser.parseSelect(sel));
            } catch (e) {
                return false;
            }
        }

        function isJoin(cond) {
            function check(t1, c1, t2, c2) {
                return (t1 in schema) && (c1 in schema[t1]) && (t2 in schema) && (c2 in schema[t2])
                    && ("fk" in schema[t1][c1]) && (schema[t1][c1].fk.table == t2) && (schema[t1][c1].fk.column == c2)
                    && schema[t2][c2].pk
            }
            function checkTree(tree) {
                if (tree.type == "BinaryExpression" && tree.operator == "==" && tree.left.type == "MemberExpression" && tree.left.computed == false && tree.right.type == "MemberExpression" && tree.left.computed == false) {
                    let t1 = tree.left.object.name;
                    let c1 = tree.left.property.name;
                    let t2 = tree.right.object.name;
                    let c2 = tree.right.property.name;
                    if (check(t1, c1, t2, c2)) return true;
                    if (check(t2, c2, t1, c1)) return true;
                }
                if (tree.type == "LogicalExpression") {
                    if (checkTree(tree.left)) return true;
                    if (checkTree(tree.right)) return true;
                }
                return false;
            }
            try {
                return checkTree(parser.parseSelect(cond));
            } catch (e) {
                return false;
            }
        }

        function getJoin(from, cond) {
            function checkTarget(t) {
                if (t.alias == from.alias) return null;
                for (let i = 0; i < model.from.length; i++) {
                    let name = getTableAliasName(model.from[i]);
                    if (("alias" in t) && (t.alias == name.alias)) return t;
                    if (!("alias" in t) && (t.table == name.table) && (name.alias == name.table)) return t;
                }
                return null;
            }
            function check(t1, c1, t2, c2) {
                return (t1 in schema) && (c1 in schema[t1]) && (t2 in schema) && (c2 in schema[t2])
                    && ("fk" in schema[t1][c1]) && (schema[t1][c1].fk.table == t2) && (schema[t1][c1].fk.column == c2)
                    && schema[t2][c2].pk
            }
            function checkTree(tree) {
                if (tree.type == "BinaryExpression" && tree.operator == "==" && tree.left.type == "MemberExpression" && tree.left.computed == false && tree.right.type == "MemberExpression" && tree.left.computed == false) {
                    let s1 = tree.left.object.name;
                    let c1 = tree.left.property.name;
                    let s2 = tree.right.object.name;
                    let c2 = tree.right.property.name;
                    if (s1 != from.alias && s2 != from.alias) return null;
                    if (s1 == s2) return null; // nothing to display for self links
                    let t1 = (s1 in aliases) ? aliases[s1].table : s1;
                    let t2 = (s2 in aliases) ? aliases[s2].table : s2;
                    let other;
                    if (s1 == from.alias) {
                        other = { table: t2, column: c1, fkcolumn: c2 };
                        if (t2 != s2) other.alias = s2;
                    } else {
                        other = { table: t1, column: c2, fkcolumn: c1 };
                        if (t1 != s1) other.alias = s1;
                    }
                    if (check(t1, c1, t2, c2)) other.to = (s1 == from.alias);
                    if (check(t2, c2, t1, c1)) other.to = (s1 != from.alias);
                    if ("to" in other) return checkTarget(other);
                }
                if (tree.type == "LogicalExpression") {
                    let t = checkTree(tree.left);
                    if (t !== null) return checkTarget(t);
                    t = checkTree(tree.right);
                    if (t !== null) return checkTarget(t);
                }
                return null;
            }
            try {
                return checkTree(parser.parseSelect(cond));
            } catch (e) {
                return null;
            }
        }

        function addJoin(cond, t1, c1, t2, c2) {
            let sub = {
                type: "BinaryExpression",
                operator: "==",
                left: {
                    type: "MemberExpression",
                    computed: false,
                    object: { type: "Identifier", name: t1 },
                    property: { type: "Identifier", name: c1 }
                },
                right: {
                    type: "MemberExpression",
                    computed: false,
                    object: { type: "Identifier", name: t2 },
                    property: { type: "Identifier", name: c2 }
                }
            };
            let out;
            if (cond.trim() == "") {
                out = sub;
            } else {
                out = {
                    type: "LogicalExpression",
                    operator: "&&",
                    left: { type: "Identifier", name: cond }, // that's cheating, however it avoids the case where cond is not parsable and still produces something that makes sense
                    right: sub
                };
            }
            try {
                return parser.stringifyTree(out);
            } catch (e) {
                return cond; // gives up
            }
        }

        function removeJoin(cond, ot1, oc1, ot2, oc2) {
            function check(t1, c1, t2, c2) {
                return (ot1 == t1 && oc1 == c1 && ot2 == t2 && oc2 == c2) || (ot1 == t2 && oc1 == c2 && ot2 == t1 && oc2 == c1);
            }
            let tree = parser.parseWhere(cond);
            function checkDirectTree(tree) {
                if (tree.type == "BinaryExpression" && tree.operator == "==" && tree.left.type == "MemberExpression" && tree.left.computed == false && tree.right.type == "MemberExpression" && tree.left.computed == false) {
                    let t1 = tree.left.object.name;
                    let c1 = tree.left.property.name;
                    let t2 = tree.right.object.name;
                    let c2 = tree.right.property.name;
                    if (check(t1, c1, t2, c2)) return true;
                    if (check(t2, c2, t1, c1)) return true;
                }
                return false;
            }
            function checkIndirectTree(o) {
                if (checkDirectTree(o.tree)) {
                    o.tree = "";
                }
                if (o.tree.type == "LogicalExpression") {
                    let s = { tree: o.tree.left };
                    checkIndirectTree(s);
                    if (s.tree == "") {
                        o.tree = o.tree.right;
                        checkIndirectTree(o);
                        return;
                    } else {
                        o.tree.left = s.tree;
                    }
                    s = { tree: o.tree.right };
                    checkIndirectTree(s);
                    if (s.tree == "") {
                        o.tree = o.tree.left;
                        return;
                    } else {
                        o.tree.right = s.tree;
                    }
                }
            }
            let o = { tree: tree };
            checkIndirectTree(o);
            try {
                return parser.stringifyTree(o.tree);
            } catch (e) {
                return cond;
            }
        }

        const SELECTFUNCTIONS = ["AVG", "SUM", "COUNT", "MIN", "MAX"];

        function selectStringToObject(s) {
            let ret = { real: s };
            s = s.trim();
            let asname;
            let fnname;
            let idx = s.lastIndexOf('"');
            // sql parser does not support " " for AS part
            if (idx == s.length - 1) { // maybe finishes by AS "...."
                s = s.substring(0, s.length - 1);
                idx = s.lastIndexOf('"');
                asname = s.substring(idx + 1); // capture alias
                s = s.substring(0, idx - 1).trim();
                if (s.toLowerCase().endsWith(" as")) { // remove optionnal AS
                    s = s.substring(0, s.length - 3).trim();
                }
            } else {
                idx = s.toLowerCase().lastIndexOf(" as ");
                if (idx != -1) {
                    asname = s.substring(idx + 4);
                    if (asname.indexOf(" ") != -1) { // cannot work with this
                        asname = undefined;
                    } else {
                        s = s.substring(0, idx).trim();
                    }
                }
            }
            idx = s.indexOf("(");
            if (idx != -1 && s.endsWith(")")) { // process function
                fnname = s.substring(0, idx).trim().toUpperCase();
                s = s.substring(idx + 1, s.length - 1);
                if (s.toLowerCase().startsWith("distinct ")) { // aggregate functions may contain distinct here
                    ret.distinct = true;
                    s = s.substring(9).trim();
                }
            }
            s = s.split(".");
            if (s.length == 2) {
                if (s[0] in schema && s[1] in schema[s[0]]) {
                    ret.table = s[0];
                    ret.alias = ret.table;
                    ret.column = s[1];
                } else if (s[0] in aliases && s[1] in schema[aliases[s[0]].table]) {
                    ret.alias = s[0];
                    ret.table = aliases[s[0]].table;
                    ret.column = s[1];
                } else {
                    ret.error = "Invalid reference " + s.join(".");
                }
            } else if (s.length == 1 && s[0] == "*") {
                ret.asterisk = true;
            } else {
                ret.error = "Invalid reference " + s.join(".");
            }
            if (!("table" in ret)) return ret;
            if (asname !== undefined) ret.as = asname;
            if (fnname !== undefined) {
                ret.fn = fnname;
                if (SELECTFUNCTIONS.indexOf(fnname) == -1) {
                    ret.error = "Invalid function " + fnname;
                }
            }
            return ret;
        }

        let dragStart = null;

        function append({ "class": clss = null, movable = false, parent, value, key, hasError = false, errorTooltip = null, onChange, onDelete, onChangeOrder, autocomplete, editable = false, deletable = false, autoopen = true, subqueries = null, preformat = "" }) {
            let ac = null;
            let binds = [];
            let span, mspan;
            if (movable) {
                mspan = $('<span class="movable" draggable="true">');
                span = $('<span class="inputspan">');
                mspan.append(span);
                mspan.on('dragstart', function (evt) {
                    dragStart = parent.find('.movable').index(mspan);
                    span.addClass('dragging');
                });
                mspan.on('dragend', function (evt) {
                    parent.find('.dragover-left').removeClass('dragover-left');
                    parent.find('.dragover-right').removeClass('dragover-right');
                    span.removeClass('dragging');
                    dragStart = null;
                });
                mspan.on('dragover', function (evt) {
                    parent.find('.dragover-left').removeClass('dragover-left');
                    parent.find('.dragover-right').removeClass('dragover-right');
                    if (dragStart == null) return;
                    let srcIndex = dragStart;
                    let tgtIndex = parent.find('.movable').index(evt.currentTarget);
                    if (srcIndex > tgtIndex) {
                        $(evt.currentTarget).addClass('dragover-left');
                    } else if (srcIndex < tgtIndex) {
                        $(evt.currentTarget).addClass('dragover-right');
                    }
                    evt.preventDefault(); // default behavior is to prevent drop
                });
                mspan.on('drop', function (evt) {
                    parent.find('.dragover-left').removeClass('dragover-left');
                    parent.find('.dragover-right').removeClass('dragover-right');
                    parent.find('.dragging').removeClass('dragging');
                    if (dragStart == null) return;
                    let srcIndex = dragStart;
                    dragStart = null;
                    let tgtIndex = parent.find('.movable').index(evt.currentTarget);
                    if (onChangeOrder) onChangeOrder(srcIndex, (srcIndex < tgtIndex) ? tgtIndex + 1 : tgtIndex);
                });
            } else {
                span = $('<span class="inputspan">');
            }
            if (subqueries !== null) {
                function flatten(string, queries) {
                    let ret = [string];
                    for (let query in queries) {
                        for (let i = ret.length - 1; i >= 0; i--) {
                            if (!(typeof ret[i] == "string")) continue;
                            let s = ret[i].split(query);
                            if (s.length > 1) {
                                let submodel = parser.parse(queries[query]);
                                ret.splice(i, 1, s[0]);
                                for (let j = 1; j < s.length; j++) {
                                    ret.splice(i + (j * 2) - 1, 0, submodel);
                                    ret.splice(i + (j * 2), 0, s[j]);
                                }
                            }
                        }
                    }
                    return ret;
                }
                try {
                    let flat = flatten(preformat, subqueries);
                    let dummy = $('<span>');
                    for (let i = 0; i < flat.length; i++) {
                        if (typeof flat[i] == "string") {
                            span.append(dummy.text(flat[i]).html());
                        } else {
                            dbQueryButton({
                                root: span, schema: schema, available: [], model: flat[i], onchange: function () {
                                    span.trigger('blur');
                                }
                            });
                        }
                    }
                    value[key] = span.text(); // update value according to reformat made by dbQueryButton
                } catch (e) { // falls back to normal mode
                    subqueries = null;
                    preformat = "";
                    span.text(value[key]);
                }
            } else {
                span.text(value[key]);
            }
            let onblur = null;
            parent.append(movable ? mspan : span);
            function setEditable() {
                span.attr('contenteditable', 'true');
                let old = value[key];
                if (autocomplete) {
                    if (typeof autocomplete == "function") { // calc autocomplete when needed
                        let calcauto = function () {
                            ac = $.formeditor.autocomplete(span, autocomplete(), { autoopen: autoopen, triggerchange: false });
                            span.off('focus', calcauto);
                            span.trigger('focus');
                        }
                        span.on('focus', calcauto);
                    } else {
                        ac = $.formeditor.autocomplete(span, autocomplete, { autoopen: autoopen, triggerchange: false });
                    }
                }
                if (onChange || onDelete || globalOnChange) {
                    onblur = function (e) {
                        if (span.text() != old || old == "") {
                            old = span.text();
                            value[key] = old;
                            if (span.text() == "" && onDelete) {
                                onDelete(e);
                            } else if (onChange) {
                                onChange(e);
                            }
                            if (globalOnChange) { globalOnChange(e, model); }
                        }
                    }
                    span.on('blur', onblur);
                    binds.push({
                        target: span,
                        event: 'blur',
                        handler: onblur
                    });
                }
            }
            if (editable) {
                setEditable();
            } else {
                let makeEditable = function () {
                    setEditable();
                    span.off('click', makeEditable);
                    span.focus();
                }
                span.on('click', makeEditable);
            }
            if (hasError) {
                span.addClass('error');
                if (errorTooltip != null) {
                    span.attr('title', errorTooltip);
                }
            }
            if (clss !== null) {
                span.addClass(clss);
            }
            if (deletable) {
                let button = $('<button class="remove">&#739;</button>');
                parent.append(button);
                if (onDelete || globalOnChange) button.click(function (e) {
                    span.text("");
                    if (onblur != null) {
                        onblur(e);
                    } else {
                        value[key] = "";
                        onDelete(e)
                    }
                    if (globalOnChange) { globalOnChange(e, model); }
                });
                binds.push({
                    target: button,
                    event: 'click',
                    handler: onDelete
                });
            }
            return {
                destroy: function () {
                    for (let i = 0; i < binds.length; i++) {
                        binds[i].target.off(binds[i].event, binds[i].handler);
                    }
                    if (ac !== null) ac.destroy();
                }
            }
        }

        function areJoined(table1, column1, table2, column2) {
            let idx1 = getTableIdx(table1);
            if (idx1 == -1) return false;
            let idx2 = getTableIdx(table2, idx1);
            if (idx2 == -1) return false;
            let i = Math.max(idx1, idx2) - 1;
            let join = model.from[i];
            if (Object.keys(join).length == 0) return false; // no condition between these two
            let cond = join[Object.keys(join)[0]];
            if (cond.indexOf(table1 + "." + column1) != -1 && cond.indexOf(table2 + "." + column2) != -1
                && isJoin(cond)) return true;
            return false;
        }

        let sm = (function () {


            let self = {
                select(target, event) {
                    if ("alias" in target) {
                        if ("fk" in target) {
                            let tgt = getTableAliasName(target);
                            let tgtfk = getTableAliasName(target.fk);
                            let idx1 = getTableIdx(tgt.name);
                            let idx2 = getTableIdx(tgtfk.name);
                            let idx = Math.max(idx1, idx2) - 1;
                            let join = model.from[idx];
                            let keys = Object.keys(join);
                            if (keys.length > 0) {
                                let cond = join[keys[0]];
                                let ncond = removeJoin(cond, target.alias, target.column, getTableAliasName(target.fk).alias, target.fk.column);
                                if (cond == ncond) return;
                                if (ncond == "") {
                                    model.from[idx] = {};
                                } else {
                                    model.from[idx][keys[0]] = ncond;
                                }
                                assertAliases();
                                renderFrom();
                                renderWhere();
                                renderGroupBy();
                                renderSelect();
                                renderHaving();
                                renderOrderBy();
                                if (globalOnChange) globalOnChange(event, model);
                            }
                        } else if ("column" in target) {
                            let k = target.alias + "." + target.column;
                            let idx = model.select.indexOf(k);
                            if (idx == -1) {
                                if (!self.isSelected({ alias: target.alias, table: target.table })) self.select({ alias: target.alias, table: target.table });
                                model.select.push(k);
                            } else {
                                model.select.splice(idx, 1);
                            }
                            renderFrom();
                            renderWhere();
                            renderGroupBy();
                            renderSelect();
                            renderHaving();
                            renderOrderBy();
                            if (globalOnChange) globalOnChange(event, model);
                        } else if ("table" in target) {
                            let idx = getTableIdx(target.table + " " + target.alias);
                            if (idx != -1) { // table in it, remove it
                                if (idx > 0) {
                                    model.from.splice(idx - 1, 2); // also remove following condition
                                } else {
                                    model.from.splice(0, 2);
                                }
                                assertAliases();
                            } else {
                                if (model.from.length != 0) {
                                    model.from.push({});
                                }
                                model.from.push({ alias: target.alias, table: target.table });
                            }
                            renderFrom();
                            renderWhere();
                            renderGroupBy();
                            renderSelect();
                            renderHaving();
                            renderOrderBy();
                            if (globalOnChange) globalOnChange(event, model);
                        }
                    } else if ("fk" in target) {
                        if ("alias" in target.fk) {
                            let tgt = getTableAliasName(target);
                            let tgtfk = getTableAliasName(target.fk);
                            let idx1 = getTableIdx(tgt.name);
                            let idx2 = getTableIdx(tgtfk.name);
                            let idx = Math.max(idx1, idx2) - 1;
                            let join = model.from[idx];
                            let keys = Object.keys(join);
                            if (keys.length > 0) {
                                let cond = join[keys[0]];
                                let ncond = removeJoin(cond, target.table, target.column, target.fk.alias, target.fk.column);
                                if (cond == ncond) return;
                                if (ncond == "") {
                                    model.from[idx] = {};
                                } else {
                                    model.from[idx][keys[0]] = ncond;
                                }
                                assertAliases();
                                renderFrom();
                            }
                        } else {
                            if (!self.isSelected({ table: target.table })) self.select({ table: target.table });
                            if (!self.isSelected({ table: target.fk.table })) self.select({ table: target.fk.table });
                            let idx1 = getTableIdx(getTableAliasName(target).name);
                            let idx2 = getTableIdx(getTableAliasName(target.fk).name);
                            let idx = Math.max(idx1, idx2) - 1;
                            let join = model.from[idx];
                            let keys = Object.keys(join);
                            let cond = (keys.length == 0 ? "" : join[keys[0]]);
                            if (cond.indexOf(target.table + "." + target.column) != -1 && cond.indexOf(target.fk.table + "." + target.fk.column) != -1
                                && isJoin(cond)) {
                                // remove this join condition
                                if (keys.length > 0) {
                                    let ncond = removeJoin(cond, target.table, target.column, target.fk.table, target.fk.column);
                                    if (ncond == "") {
                                        model.from[idx] = {};
                                    } else {
                                        model.from[idx][keys[0]] = ncond;
                                    }
                                }
                            } else {
                                if (keys.length == 0) keys = ["inner"];
                                model.from[idx][keys[0]] = addJoin(cond, target.table, target.column, target.fk.table, target.fk.column);
                            }
                        }
                        renderFrom();
                        renderWhere();
                        renderGroupBy();
                        renderSelect();
                        renderHaving();
                        renderOrderBy();
                        if (globalOnChange) globalOnChange(event, model);
                    } else if ("column" in target) {
                        let k = target.table + "." + target.column;
                        let idx = model.select.indexOf(k);
                        if (idx == -1) {
                            if (!self.isSelected({ table: target.table })) self.select({ table: target.table });
                            model.select.push(k);
                        } else {
                            model.select.splice(idx, 1);
                        }
                        renderFrom();
                        renderWhere();
                        renderGroupBy();
                        renderSelect();
                        renderHaving();
                        renderOrderBy();
                        if (globalOnChange) globalOnChange(event, model);
                    } else if ("table" in target) {
                        let idx = getTableIdx(target.table);
                        if (idx != -1) { // table in it, remove it
                            if (idx > 0) {
                                model.from.splice(idx - 1, 2); // also remove following condition
                            } else {
                                model.from.splice(0, 2);
                            }
                        } else {
                            if (model.from.length != 0) {
                                model.from.push({});
                            }
                            model.from.push({ table: target.table });
                        }
                        renderFrom();
                        renderWhere();
                        renderGroupBy();
                        renderSelect();
                        renderHaving();
                        renderOrderBy();
                        if (globalOnChange) globalOnChange(event, model);
                    }
                },
                isSelected(target) {
                    if ("alias" in target) {
                        if ("fk" in target) {
                            return true; // alias fk are displayed only when selected
                        } else if ("column" in target) {
                            for (let i = 0; i < model.select.length; i++) {
                                let o = selectStringToObject(model.select[i]);
                                if (o.alias == target.alias && o.column == target.column && o.fn == undefined) return true;
                            }
                            return false;
                        } else if ("table" in target) {
                            return getTableIdx(target.table + " " + target.alias) != -1;
                        }
                    } else if ("fk" in target) {
                        if ("alias" in target.fk) return true;
                        return areJoined(target.table, target.column, target.fk.table, target.fk.column);
                    } else if ("column" in target) {
                        for (let i = 0; i < model.select.length; i++) {
                            let o = selectStringToObject(model.select[i]);
                            if (o.alias == target.table && o.column == target.column && o.fn == undefined) return true;
                        }
                        return false;
                    } else if ("table" in target) {
                        return getTableIdx(target.table) != -1;
                    }
                    return false;
                },
                clear() {
                }
            }
            return self;
        })();

        let focusInfo = null;

        function saveFocus(el) {
            let f = el.find(':focus');
            if (f.length > 0) {
                focusInfo = { el: el[0], index: f.index() };
            }
        }

        function restoreFocus(el) {
            if (focusInfo === null) return;
            if (focusInfo.el === el[0]) {
                el.children().eq(focusInfo.index).focus();
                focusInfo = null;
            }
        }

        /* SELECT section */

        let select = $('<div>');
        select.olds = [];
        function renderSelect() {
            saveFocus(select);
            for (let i = 0; i < select.olds.length; i++) {
                select.olds[i].destroy();
            }
            select.olds.splice(0, select.olds.length);
            select.empty();
            select.append('SELECT ');
            let distinct = $('<select><option value=""></option><option value="DISTINCT"></option></select>');
            distinct.val(model.distinct ? "DISTINCT" : "");
            function refreshDistinct(long) {
                distinct.children().each(function (i, e) {
                    $(e).text(long ? e.value : "");
                });
            }
            distinct.val(model.distinct ? "DISTINCT" : "");
            select.append(distinct);
            distinct.on('change', function () {
                model.distinct = (distinct.val() != "");
            });
            distinct.on('focus', function () {
                refreshDistinct(true);
            });
            distinct.on('blur', function () {
                refreshDistinct(model.distinct);
            })
            refreshDistinct(model.distinct);
            select.append(' ');
            let columns = {};
            let tables = { "*": "" };
            for (let i = 0; i < model.from.length; i++) {
                let name = getTableAliasName(model.from[i]);
                if (name.table in schema) {
                    tables[name.alias + ".*"] = "";
                    for (let k in schema[name.table]) {
                        if (k == "coords___") continue;
                        columns[name.alias + "." + k] = "";
                    }
                }
            }
            function aggregate(fct, obj = {}) {
                let sep = (fct.endsWith(" ") ? "" : "(");
                for (let k in columns) {
                    obj[fct + sep + k + ")"] = "";
                }
                return obj;
            }
            let auto;
            if (!("groupby" in model) || model.groupby.length == 0) {
                auto = [tables, columns, aggregate("COUNT", { "COUNT(*)": "" }), aggregate("COUNT(DISTINCT ", { "COUNT(DISTINCT *)": "" }), aggregate("MIN"), aggregate("MAX"), aggregate("AVG"), aggregate("SUM")];
            } else {
                let groupby = {};
                for (let i = 0; i < model.groupby.length; i++) {
                    groupby[model.groupby[i]] = "";
                }
                auto = [groupby, aggregate("COUNT", { "COUNT(*)": "" }), aggregate("COUNT(DISTINCT ", { "COUNT(DISTINCT *)": "" }), aggregate("MIN"), aggregate("MAX"), aggregate("AVG"), aggregate("SUM")];
            }
            for (let i = 0; i < model.select.length; i++) {
                if (i > 0) select.append(', ');
                let c = model.select[i].trim().split(".");
                let found = false;
                let tables = {};
                for (let i = 0; i < model.from.length; i += 2) {
                    let name = getTableAliasName(model.from[i]);
                    if (name.table in schema) {
                        tables[name.alias] = schema[name.table];
                        if (!found && c.length == 2 && c[0] == name.alias) found = (c[1] in schema[name.table]);
                    }
                }
                function checkError(i) {
                    if (model.select[i].trim() != "" && model.select[i].trim() != "*") {
                        function check(tree) {
                            switch (tree.type) {
                                case "MemberExpression":
                                    if (tree.object.type != "Identifier") {
                                        return { hasError: true, message: "Invalid " + parsers.stringifyTree(tree) };
                                    }
                                    if (tree.property.type != "Identifier") {
                                        return { hasError: true, message: "Invalid " + parsers.stringifyTree(tree) };
                                    };
                                    if (!(tree.object.name in tables)) {
                                        return { hasError: true, message: "Unknown " + parsers.stringifyTree(tree) };
                                    };
                                    if (tree.property.name == "*") return { hasError: false };
                                    if (tree.property.name in tables[tree.object.name]) {
                                        return { hasError: false };
                                    } else {
                                        return { hasError: true, message: "Unknown " + parsers.stringifyTree(tree) };
                                    }
                                case "CallExpression":
                                    for (let i = 0; i < tree.arguments.length; i++) {
                                        let c = check(tree.arguments[i]);
                                        if (c.hasError) return c;
                                    }
                                    return { hasError: false };
                                case "Identifier":
                                    if (tree.name == "EVERYTHING") {
                                        return { hasError: false };
                                    } else {
                                        return { hasError: true, message: "Unknown " + parsers.stringifyTree(tree) };
                                    }
                                case "Literal":
                                    return { hasError: false };
                                default:
                                    if ("left" in tree && "right" in tree) {
                                        let c = check(tree.left);
                                        if (c.hasError) return c;
                                        c = check(tree.right)
                                        if (c.hasError) return c;
                                        return { hasError: false };
                                    }
                                    return { hasError: true, message: "Unknown " + parsers.stringifyTree(tree) }; // don't know what to do with this => that's an error
                            }
                        }
                        let tree;
                        try {
                            tree = window.parsers.parseSelect(model.select[i]);
                        } catch (e) {
                            return { hasError: true, message: e.message };
                        }
                        return check(tree);
                    }
                    return { hasError: false };
                }
                let err = checkError(i);
                select.olds.push(append({
                    parent: select, value: model.select, key: i,
                    movable: true,
                    hasError: err.hasError,
                    errorTooltip: err.message,
                    onChange: function (e) {
                        let all = parsers.parse("SELECT " + model.select.join(',')).select;
                        if (all.length == model.select.length) {
                            // length unchanged, we update the UI so as to keep the inputs in place
                            // this avoids losing the focus and pissing off the user
                            select.find('span.inputspan').each((j, el) => {
                                el = $(el);
                                model.select[j] = all[j];
                                el.val(all[j]);
                                let err = checkError(j);
                                el.removeClass("error");
                                if (err.hasError) el.addClass("error");
                                el.attr('title', err.message);
                            });
                        } else {
                            // trash previous selects and rebuild the UI from all
                            // side effect: if the user clicked on the + button, now it is destroyed and another one takes its place
                            //   as a result, the click event of the deleted button is not triggered, which is cumbersome
                            model.select.splice(0, model.select.length);
                            model.select.push.apply(model.select, all);
                            renderSelect();
                        }
                        renderHaving();
                        renderOrderBy();
                        schemaUI.redraw();
                    },
                    onDelete: function () {
                        model.select.splice(i, 1);
                        schemaUI.redraw();
                        renderSelect();
                        renderHaving();
                        renderOrderBy();
                    },
                    onChangeOrder: function (src, tgt) {
                        if (src == tgt) return;
                        if (src < tgt) {
                            let save = model.select[src];
                            for (let i = src; i < tgt - 1; i++) {
                                model.select[i] = model.select[i + 1];
                            }
                            model.select[tgt - 1] = save;
                        } else {
                            let save = model.select[src];
                            for (let i = src; i > tgt; i--) {
                                model.select[i] = model.select[i - 1];
                            }
                            model.select[tgt] = save;
                        }
                        renderSelect();
                    },
                    autocomplete: auto,
                    editable: err || !found,
                    deletable: true
                }));
            }
            select.append(' ');
            select.append('<button class="add">+</button>');
            restoreFocus(select);
        }
        select.on('click', 'button.add', function (e) {
            model.select.push('');
            renderSelect();
        });
        renderSelect();
        bottom.append(select);

        /* FROM section */

        let from = $('<div>');
        from.olds = [];
        function renderFrom() {
            saveFocus(from);
            let available = Object.keys(schema);
            for (let i = 0; i < available.length; i++) {
                available[i] = { [available[i]]: "" };
            }
            available = [available];
            for (let i = 0; i < from.olds.length; i++) {
                from.olds[i].destroy();
            }
            from.olds.splice(0, from.olds.length);

            function appendFrom(idx) {
                let edit = getTableAliasName(model.from[idx]);
                from.olds.push(append({
                    parent: from, value: edit, key: "name",
                    hasError: edit.table != "" && !(edit.table in schema),
                    editable: !(edit.table in schema),
                    deletable: true,
                    autocomplete: function () {
                        let tables = {};
                        for (let k in schema) {
                            tables[k] = "";
                        }
                        return [tables];
                    },
                    onChange(e) {
                        // all froms to string
                        let all = edit.name.trim().replace(/\s{2,}/g, ' ').split(',');
                        function set(from, i) {
                            let s = from.trim().split(" ");
                            if (s.length == 0) { // do nothing
                            } else if (s.length == 1) {
                                model.from[i] = { table: s[0] };
                            } else {
                                let alias = s.splice(s.length - 1, 1);
                                model.from[i] = { table: s.join(" "), alias: alias[0] };
                            }
                        }
                        set(all[0], idx);
                        for (let i = 1; i < all.length; i++) {
                            model.from.splice(idx + (i * 2) - 1, 0, {});
                            model.from.splice(idx + (i * 2), 0, {});
                            set(all[i], idx + (i * 2));
                        }
                        assertAliases();
                        renderFrom();
                        renderWhere();
                        renderGroupBy();
                        renderSelect();
                        renderHaving();
                        renderOrderBy();
                        schemaUI.redraw();
                    },
                    onDelete() {
                        if (model.from.length == 1) {
                            model.from.splice(0, 1);
                        } else if (idx > 0) {
                            model.from.splice(idx - 1, 2);
                        } else {
                            model.from.splice(0, 2);
                        }
                        assertAliases();
                        renderFrom();
                        renderWhere();
                        renderGroupBy();
                        renderSelect();
                        renderHaving();
                        renderOrderBy();
                        schemaUI.redraw();
                    }
                }));
            }
            from.empty();
            from.append('FROM ');
            if (model.from.length == 0) {
                from.append('<button class="add" disabled>Click on the tables in the schema to select them</button>');
                return;
            }
            appendFrom(0);
            for (let i = 1; i < model.from.length; i += 2) {
                let joinSelect = $('<select><option value="inner">INNER JOIN</option><option value="left">LEFT JOIN</option><option value="right">RIGHT JOIN</option><option value="full">FULL JOIN</option><option value="product">,</option></select>')
                joinSelect.attr('data-idx', i);
                let key = Object.keys(model.from[i])[0] || "product";
                joinSelect.val(key);
                from.append('<br>');
                from.append(joinSelect);
                from.append(' ');
                appendFrom(i + 1);
                if (key != "product") {
                    let validTables = {};
                    for (let j = 0; j <= i + 1; j += 2) {
                        let name = getTableAliasName(model.from[j]);
                        if (name.table in schema) {
                            validTables[name.alias] = schema[name.table]
                        }
                    }
                    let onInfo;
                    if (model.from[i][key] != null) {
                        onInfo = processCondition(model.from[i][key], validTables);
                        from.append(" ON ");
                        let o = {
                            class: "condition",
                            parent: from, value: model.from[i], key,
                            hasError: model.from[i][key] != "" && ("error" in onInfo),
                            errorTooltip: onInfo.error,
                            editable: true,
                            deletable: true,
                            autocomplete: function () {
                                let columns = {};
                                for (let t in validTables) {
                                    for (let c in validTables[t]) {
                                        if (c == "coords___") continue;
                                        columns[t + "." + c] = "";
                                    }
                                }
                                return [columns];
                            },
                            onChange() {
                                assertAliases();
                                renderFrom();
                                renderGroupBy();
                                renderSelect();
                                renderOrderBy();
                                renderHaving();
                                schemaUI.redraw();
                            },
                            onDelete() {
                                model.from[i] = {};
                                assertAliases();
                                renderFrom();
                                renderGroupBy();
                                renderSelect();
                                renderOrderBy();
                                renderHaving();
                                schemaUI.redraw();
                            }
                        }
                        if ("subqueries" in onInfo && Object.keys(onInfo.subqueries).length != 0) { // with subquery
                            o.subqueries = onInfo.subqueries;
                            o.preformat = onInfo.preformat;
                        }
                        from.olds.push(append(o));
                    }
                }
            }
            restoreFocus(from);
        }
        from.on('change', 'select', function (e) {
            let select = $(e.currentTarget);
            let v = select.val();
            let i = parseInt(select.attr('data-idx'));
            let old = Object.keys(model.from[i]).length > 0 ? model.from[i][Object.keys(model.from[i])[0]] : "";
            model.from[i] = {};
            if (v != "product") {
                model.from[i][v] = old;
            }
            renderFrom();
        });
        bottom.append(from);
        renderFrom();

        /* WHERE section */

        let where = $('<div>');
        where.olds = [];
        let autoWhere = [];
        let tables = {};
        function showWhere() {
            where.empty();
            where.append('WHERE ');
            let whereInfo = processCondition(model.where, tables);
            let o = {
                class: "condition",
                parent: where,
                value: model,
                key: "where",
                hasError: model.where != "" && ("error" in whereInfo),
                errorTooltip: whereInfo.error,
                editable: true,
                deletable: true,
                autocomplete: autoWhere,
                autoopen: false,
                onChange: renderWhere,
                onDelete: renderWhere
            };
            if ("subqueries" in whereInfo && Object.keys(whereInfo.subqueries).length != 0) { // with subquery
                o.subqueries = whereInfo.subqueries;
                o.preformat = whereInfo.preformat;
            }
            where.olds.push(append(o));
        }

        function renderWhere() {
            saveFocus(where);
            for (let i = 0; i < where.olds.length; i++) {
                where.olds[i].destroy();
            }
            where.olds.splice(0, where.olds.length);
            where.empty();
            tables = {};
            let columns = {};
            for (let i = 0; i < model.from.length; i += 2) {
                let name = getTableAliasName(model.from[i]);
                if (name.table in schema) {
                    tables[name.alias] = schema[name.table];
                    for (let k in schema[name.table]) {
                        if (k == "coords___") continue;
                        columns[name.alias + "." + k] = "";
                    }
                }
            }
            function aggregate(fct, obj = {}) {
                for (let k in columns) {
                    obj[fct + "(" + k + ")"] = "";
                }
                return obj;
            }
            let auto = [{ "=": "equals", "<>": "differs", "AND": "", "OR": "", "NOT": "", "IS NULL": "", "IS NOT NULL": "" }, columns, aggregate("COUNT", { "COUNT(*)": "" }), aggregate("MIN"), aggregate("MAX"), aggregate("AVG"), aggregate("SUM")];
            autoWhere = [];
            autoWhere.push.apply(autoWhere, available);
            autoWhere.push.apply(autoWhere, auto);
            if (!("where" in model) || model.where.trim() == "") {
                where.html('<button class="add">Add WHERE condition</button>');
            } else {
                showWhere();
            }
            restoreFocus(where);
        }
        where.on('click', 'button.add', function (e) {
            showWhere();
        });
        bottom.append(where);
        renderWhere();

        /* GROUP BY section */

        let groupby = $('<div>');
        let having = $('<div>');
        groupby.olds = [];
        function renderGroupBy() {
            saveFocus(groupby);
            for (let i = 0; i < groupby.olds.length; i++) {
                groupby.olds[i].destroy();
            }
            groupby.olds.splice(0, groupby.olds.length);
            groupby.empty();
            if (model.groupby.length == 0) {
                groupby.append('<button class="add">Add GROUP BY section</button>');
                having.css('display', 'none');
            } else {
                groupby.append('GROUP BY ');
                let tables = {};
                for (let i = 0; i < model.from.length; i++) {
                    let name = getTableAliasName(model.from[i]);
                    if (name.table in schema) {
                        tables[name.alias] = schema[name.table];
                    }
                }

                for (let i = 0; i < model.groupby.length; i++) {
                    if (i > 0) groupby.append(', ');
                    let c = model.groupby[i].trim().split(".");
                    groupby.olds.push(append({
                        parent: groupby, value: model.groupby, key: i,
                        hasError: model.groupby[i] != "" && !isValidGroupBy(model.groupby[i], tables),
                        onChange: function (e) {
                            schemaUI.redraw();
                            let span = $(e.currentTarget);
                            span.removeClass('error');
                            if (!isValidGroupBy(model.groupby[i], tables)) span.addClass('error');
                            renderSelect();
                            renderOrderBy();
                        },
                        onDelete: function () {
                            model.groupby.splice(i, 1);
                            schemaUI.redraw();
                            renderGroupBy();
                            renderSelect();
                            renderOrderBy();
                        },
                        autocomplete: function () {
                            let columns = {};
                            for (let i = 0; i < model.from.length; i++) {
                                let name = getTableAliasName(model.from[i]);
                                if (name.table in schema) {
                                    for (let k in schema[name.table]) {
                                        if (k == "coords___") continue;
                                        columns[name.alias + "." + k] = "";
                                    }
                                }
                            }
                            return [columns];
                        },
                        editable: !(c.length == 2 && (c[0] in schema) && (c[1] in schema[c[0]])),
                        deletable: true
                    }));
                }
                groupby.append(' ');
                groupby.append('<button class="add">+</button>');
                having.css('display', 'inherit');
            }
            restoreFocus(groupby);
        }
        groupby.on('click', 'button.add', function (e) {
            model.groupby.push('');
            renderGroupBy();
        });
        renderGroupBy();
        bottom.append(groupby);

        /* HAVING section */

        having.olds = [];
        let autoHaving = [];
        function showHaving() {
            having.empty();
            having.append('HAVING ');
            tables = {};
            for (let i = 0; i < model.from.length; i += 2) {
                let name = getTableAliasName(model.from[i]);
                if (name.table in schema) {
                    tables[name.alias] = schema[name.table];
                }
            }
            let havingInfo = processCondition(model.having, tables);
            let o = {
                class: "condition",
                parent: having, value: model, key: 'having',
                hasError: model.having != "" && ("error" in havingInfo),
                errorTooltip: havingInfo.error,
                editable: true,
                deletable: true,
                autocomplete: function () {
                    let columns = {};
                    for (let i = 0; i < model.from.length; i += 2) {
                        let name = getTableAliasName(model.from[i]);
                        if (name.table in schema) {
                            for (let k in schema[name.table]) {
                                if (k == "coords___") continue;
                                columns[name.alias + "." + k] = "";
                            }
                        }
                    }
                    function aggregate(fct, obj = {}) {
                        let sep = (fct.endsWith(" ") ? "" : "(");
                        for (let k in columns) {
                            obj[fct + sep + k + ")"] = "";
                        }
                        return obj;
                    }
                    let select = {};
                    for (let i = 0; i < model.select.length; i++) {
                        select[model.select[i]] = "";
                    }
                    let auto = [select, aggregate("COUNT", { "COUNT(*)": "" }), aggregate("COUNT(DISTINCT ", { "COUNT(DISTINCT *)": "" }), aggregate("MIN"), aggregate("MAX"), aggregate("AVG"), aggregate("SUM")];
                    autoHaving = [];
                    autoHaving.push.apply(autoHaving, available);
                    autoHaving.push.apply(autoHaving, auto);
                    return autoHaving;
                },
                onChange() {
                    renderHaving();
                },
                onDelete() {
                    renderHaving();
                }
            };
            if ("subqueries" in havingInfo && Object.keys(havingInfo.subqueries).length != 0) { // with subquery
                o.subqueries = havingInfo.subqueries;
                o.preformat = havingInfo.preformat;
            }
            having.olds.push(append(o));
        }
        function renderHaving() {
            for (let i = 0; i < having.olds.length; i++) {
                having.olds[i].destroy();
            }
            having.olds.splice(0, having.olds.length);
            having.empty();

            if (!("having" in model) || model.having.trim() == "") {
                having.html('<button class="add">Add HAVING condition</button>');
            } else {
                showHaving();
            }
        }
        having.on('click', 'button.add', function (e) {
            showHaving();
        });
        bottom.append(having);
        renderHaving();

        /* ORDER BY section */

        let orderby = $('<div>');
        orderby.olds = [];
        function renderOrderBy() {
            saveFocus(orderby);
            for (let i = 0; i < orderby.olds.length; i++) {
                orderby.olds[i].destroy();
            }
            orderby.olds.splice(0, orderby.olds.length);
            orderby.empty();
            if (model.orderby.length == 0) {
                orderby.append('<button class="add">Add ORDER BY section</button>');
            } else {
                orderby.append('ORDER BY ');
                let columns = {};
                let addAll = false;
                for (let i = 0; i < model.select.length; i++) {
                    if (model.select[i].trim() == "*") {
                        addAll = true;
                        continue;
                    }
                    columns[model.select[i] + " ASC"] = "";
                    columns[model.select[i] + " DESC"] = "";
                }
                if (addAll) {
                    for (let i = 0; i < model.from.length; i += 2) {
                        if ("alias" in model.from) {
                            for (let c in schema[model.from[i].table]) {
                                columns[model.from[i].alias + "." + c + " ASC"] = "";
                                columns[model.from[i].alias + "." + c + " DESC"] = "";
                            }
                        } else {
                            for (let c in schema[model.from[i].table]) {
                                columns[model.from[i].table + "." + c + " ASC"] = "";
                                columns[model.from[i].table + "." + c + " DESC"] = "";
                            }
                        }
                    }
                }
                let auto = [{ "ASC": "Ascending", "DESC": "Descending" }, columns];

                for (let i = 0; i < model.orderby.length; i++) {
                    if (i > 0) orderby.append(', ');
                    let c = model.orderby[i].trim().split(".");
                    orderby.olds.push(append({
                        parent: orderby, value: model.orderby, key: i,
                        hasError: model.orderby[i] != "" && !(model.orderby[i] in columns),
                        onChange: function (e) {
                            let span = $(e.currentTarget);
                            span.removeClass('error');
                            if (!(model.orderby[i] in columns)) span.addClass('error');
                        },
                        onDelete: function () {
                            model.orderby.splice(i, 1);
                            renderOrderBy();
                        },
                        autocomplete: auto,
                        editable: !(c.length == 2 && (c[0] in schema) && (c[1] in schema[c[0]])),
                        deletable: true
                    }));
                }
                orderby.append(' ');
                orderby.append('<button class="add">+</button>');
            }
            restoreFocus(orderby);
        }
        orderby.on('click', 'button.add', function (e) {
            model.orderby.push('');
            renderOrderBy();
        });
        renderOrderBy();
        bottom.append(orderby);

        function assertAliases() {
            let naliases = {};
            for (let i = 0; i < model.from.length; i += 2) {
                let name = getTableAliasName(model.from[i]);
                if (name.alias != name.table) {
                    naliases[name.alias] = {
                        table: name.table,
                        alias: name.alias,
                        toFK: [], fromFK: []
                    };
                }
            }
            for (let k in naliases) {
                let alias = naliases[k];
                for (let i = 1; i < model.from.length; i += 2) {
                    let join = model.from[i];
                    if (Object.keys(join).length == 0) continue; // no condition between these two
                    let cond = join[Object.keys(join)[0]];
                    let other = getJoin(alias, cond);
                    if (other != null) {
                        if (other.alias == undefined || other.alias == other.table) {
                            if (other.to) {
                                alias.toFK.push({ table: other.table, column: other.column, fkcolumn: other.fkcolumn });
                            } else {
                                alias.fromFK.push({ table: other.table, column: other.column, fkcolumn: other.fkcolumn });
                            }
                        } else {
                            if (other.to) {
                                alias.toFK.push({ table: other.table, column: other.column, alias: other.alias, fkcolumn: other.fkcolumn, alias: other.alias });
                            } else {
                                alias.fromFK.push({ table: other.table, column: other.column, alias: other.alias, fkcolumn: other.fkcolumn, alias: other.alias });
                            }
                        }
                    }
                }
            }
            // sync aliases and naliases
            for (let k in aliases) {
                if (!(k in naliases)) delete aliases[k];
            }
            for (let k in naliases) {
                if (!(k in aliases)) {
                    aliases[k] = naliases[k];
                } else {
                    $.extend(aliases[k], naliases[k]); // overwrites leaving coords___ in place
                }
            }
        }

        let schemaUI = dbSchemaUI({ model: schema, aliases, root: top, checkboxes: true, selectionModel: sm });

        return {
            refresh() {
                assertAliases();
                renderSelect();
                renderFrom();
                renderWhere();
                renderGroupBy();
                renderHaving();
                renderOrderBy();
                schemaUI.redraw();
            },
            schemaUI,
            destroy() {
                top.removeClass("queryui");
                top.removeClass("top");
                top.empty();
                schemaUI.destroy();
                bottom.removeClass("queryui");
                bottom.removeClass("bottom");
            }
        }
    }

    function htmlify(model) {
        let span = $("<span>");
        function toHTML(t) {
            span.text(t);
            return span.html();
        }
        let txt;
        let sep = " ";
        txt = "SELECT";
        if (model.distinct === true) sep = " DISTINCT ";
        for (let i = 0; i < model.select.length; i++) {
            txt += sep + model.select[i];
            sep = ", ";
        }
        if ("from" in model && model.from.length > 0) {

            function toString(from) {
                return toHTML(getTableAliasName(from).name);
            }

            txt += " <br>FROM " + toString(model.from[0]);
            let i = 1;
            while (i < model.from.length) {
                if ("inner" in model.from[i]) {
                    txt += " <br>INNER JOIN " + toString(model.from[i + 1]) + " ON " + toHTML(model.from[i].inner);
                } else if ("left" in model.from[i]) {
                    txt += " <br>LEFT JOIN " + toString(model.from[i + 1]) + " ON " + toHTML(model.from[i].left);
                } else if ("right" in model.from[i]) {
                    txt += " <br>RIGHT JOIN " + toString(model.from[i + 1]) + " ON " + toHTML(model.from[i].right);
                } else if ("full" in model.from[i]) {
                    txt += " <br>FULL JOIN " + toString(model.from[i + 1]) + " ON " + toHTML(model.from[i].full);
                } else {
                    txt += ", " + toString(model.from[i + 1]);
                }
                i += 2;
            }
        }
        if ("where" in model && model.where.trim() != "") {
            txt += " <br>WHERE " + toHTML(model.where);
        }
        if ("groupby" in model && model.groupby.length > 0) {
            txt += " <br>GROUP BY ";
            sep = "";
            for (let i = 0; i < model.groupby.length; i++) {
                txt += sep + toHTML(model.groupby[i]);
                sep = ",";
            }
            if ("having" in model && model.having.trim() != "") {
                txt += " <br>HAVING " + toHTML(model.having);
            }
        }
        if ("orderby" in model && model.orderby.length > 0) {
            txt += " <br>ORDER BY ";
            sep = "";
            for (let i = 0; i < model.orderby.length; i++) {
                txt += sep + toHTML(model.orderby[i]);
                sep = ",";
            }
        }
        return txt;
    }

    function stringify(model, lineSeparator = " ") {
        let span = $('<span>');
        span.html(htmlify(model).split('<br>').join(lineSeparator));
        return span.text();
    }

    function dbQueryDialog({ schema, available, model: inmodel, sql, onchange, db = null, title = "Edit Query..." }) {

        let availables = [];
        for (let i = 0; i < available.length; i++) {
            for (let k in available[i]) {
                if (k.indexOf(".") != -1) availables.push(k);
            }
        }

        availables.sort((a, b) => {
            return b.length - a.length;
        });

        function fixOutsideRefCondition(cond) {
            // preprocess cond with availables
            for (let i = 0; i < availables.length; i++) {
                let idx;
                while ((idx = cond.indexOf(availables[i])) != -1) {
                    cond = cond.substring(0, idx) + `___replacer${i}___` + cond.substring(idx + availables[i].length);
                }
            }
            return cond;
        }

        function unfixOutsideRefCondition(cond) {
            for (let i = 0; i < availables.length; i++) {
                let idx;
                let s = `___replacer${i}___`;
                while ((idx = cond.indexOf(s)) != -1) {
                    cond = cond.substring(0, idx) + availables[i] + cond.substring(idx + s.length);
                }
            }
            return cond;
        }

        /*
        * model parameter is prevalent: if model parameter is not provided (undefined), then sql one is used instead
        * further, if model parameter is provided, then it is kept in sync with edited model when user clicks ok
        * finally, onchange callback is provided the last valid model + current SQL (only the latter is garanteed correct)
        */
        if (inmodel === undefined) {
            if (sql === undefined || sql.trim() == "") {
                inmodel = createQuery();
                sql = undefined;
            } else {
                try {
                    inmodel = window.parsers.disAmbiguateSelect(window.parsers.parse(fixOutsideRefCondition(sql)), schema);
                    inmodel.where = unfixOutsideRefCondition(inmodel.where);
                    sql = undefined; // no need to remember sql, it is now in the model
                } catch (e) {
                    inmodel = createQuery();
                }
            }
        } else {
            // override sql parameter when a model a provided
            sql = undefined;
        }
        let syncModelToText = false;
        let syncTimer = null;

        let model = $.extend({}, inmodel);
        let diag = $('<div>').attr('title', title);
        diag.addClass('dbquery-dialog');
        let panel = $('<div>');
        let ul = $('<ul>');
        panel.append(ul);
        ul.append($('<li><a href="#tab-diag-builder">Query Builder</a></li>'));
        ul.append($('<li><a href="#tab-diag-free">Freeform</a></li>'));
        let top = $('<div id="tab-diag-builder">');
        let freediv = $('<div id="tab-diag-free">');
        let free = $('<textarea rows="5" style="width:100%">');
        panel.append(top);
        panel.append(freediv);
        freediv.append(free);
        let bottom = $('<div id="tab-diag-schema">');
        let error = $('<div class="error">');
        bottom.append(error);
        error.css('display', 'none');
        diag.append(panel);
        panel.tabs();
        if (db == null) {
            diag.append(bottom);
        } else {
            function display(results) {
                let table = $('<table>');
                $('#tab-diag-results').empty();
                bottomcontainer.tabs('option', 'active', 1);
                $('#tab-diag-results').append(table);
                let thead = $('<thead>');
                table.append(thead);
                let tr = $("<tr>");
                thead.append(tr);
                tr.append($('<th>'));
                let fields = [];
                let formats = [];
                for (let i = 0; i < results.fields.length; i++) {
                    let f = results.fields[i];
                    fields.push(f.name);
                    formats.push(f.format);
                    let th = $('<th>').text(f.name);
                    th.append('<br>');
                    th.append($('<span class="typeinfo">').text(f.dataType));
                    tr.append(th);
                }
                let tbody = $('<tbody>');
                table.append(tbody);
                for (let i = 0; i < results.rows.length; i++) {
                    let tr = $("<tr>");
                    tr.append($('<td class="number">').text(i + 1));
                    for (let j = 0; j < fields.length; j++) {
                        let td = $("<td>");
                        switch (formats[j].type) {
                            case "datetime":
                                td.addClass('date').text(new Date(results.rows[i][j]).toLocaleString());
                                break;
                            case "time":
                                td.addClass('date').text(new Date(results.rows[i][j]).toLocaleTimeString());
                                break;
                            case "date":
                                td.addClass('date').text(new Date(results.rows[i][j]).toLocaleDateString());
                                break;
                            case "number":
                                td.addClass("number"); // don't break and leak into default
                            default:
                                td.text(results.rows[i][j]);
                        }
                        tr.append(td)
                    }
                    tbody.append(tr);
                }
                if (results.limited === true) {
                    let tr = $("<tr>");
                    let td = $('<th colspan="' + (results.fields.length + 1) + '">').text("More tuples not displayed.");
                    tr.append(td);
                    tbody.append(tr);
                }
                jsonresults.empty();
                jsonresults.append($('<pre>').text(JSON.stringify(results.rows, null, 4)));
            }

            let bottomul = $('<ul>');
            bottomul.append($('<li><a href="#tab-diag-schema">Schema</a></li>'));
            bottomul.append($('<li><a href="#tab-diag-results">Results</a></li>'));
            bottomul.append($('<li><a href="#tab-diag-json-results">JSON Results</a></li>'));
            let bottomcontainer = $('<div>');
            let results = $('<div id="tab-diag-results">');
            let jsonresults = $('<div id="tab-diag-json-results">');
            diag.append(bottomcontainer);
            bottomcontainer.append(bottomul);
            let run = $('<button class="runquery">Run</button>');
            run.on('click', () => {
                let sql;
                if (syncModelToText) {
                    try {
                        sql = stringify(window.parsers.disAmbiguateSelect(window.parsers.parse(free.val()), schema), "\n");
                    } catch (e) {
                        sql = free.val();
                    }
                } else {
                    sql = stringify(model, "\n");
                }
                db(sql, display);
            })
            bottomcontainer.append(run);
            bottomcontainer.append(bottom);
            bottomcontainer.append(results);
            bottomcontainer.append(jsonresults);
            bottomcontainer.tabs();
        }

        free.on('keyup', function () {
            if (syncModelToText) {
                if (syncTimer != null) {
                    clearTimeout(syncTimer);
                    syncTimer = null;
                }
                syncTimer = setTimeout(function () {
                    syncTimer = null;
                    debugger;
                    error.css('display', 'none');
                    if (syncModelToText) {
                        try {
                            let newModel = window.parsers.disAmbiguateSelect(window.parsers.parse(free.val()), schema);
                            for (let k in model) delete model[k];
                            for (let k in newModel) model[k] = newModel[k];
                            ui.refresh();
                        } catch (e) {
                            error.css('display', 'flex');
                        }
                    }
                }, SYNCDELAY); // small delay before trying to sync
            }
        });

        panel.on('tabsactivate', function (event, ui) {
            switch (ui.newTab.children().eq(0).attr('href')) {
                case "#tab-diag-free":
                    syncModelToText = true;
                    error.css('display', 'none');
                    free.val(stringify(model, "\n"));
                    break;
                case "#tab-diag-builder":
                    syncModelToText = false;
                    error.css('display', 'none');
                    let content = free.val();
                    try {
                        let newModel = window.parsers.disAmbiguateSelect(window.parsers.parse(content), schema);
                        $.extend(model, newModel);
                        ui.refresh();
                    } catch (e) {
                        // ignore
                    }
                    break;
            }
        });


        let ui = dbQueryUI({
            schemaEl: bottom, queryEl: top, schema, available, model, sql,
            onchange: function (e, m) {
                if (syncModelToText) {
                    free.val(stringify(m, "\n"));
                }
            }
        });
        diag.dialog({
            dialogClass: "no-close noselect",
            modal: true,
            minHeight: 360,
            minWidth: 640,
            width: $('body').parent().width() - 100,
            height: $('body').parent().height() - 100,
            buttons: [{
                text: "Ok",
                click: function () {
                    diag.dialog("close");
                    diag.remove();
                    if (onchange) {
                        let sql;
                        let insync;
                        if (syncModelToText) {
                            try {
                                let newModel = window.parsers.disAmbiguateSelect(window.parsers.parse(free.val()), schema);
                                for (let k in model) delete model[k];
                                for (let k in newModel) model[k] = newModel[k];
                                sql = stringify(model, "\n");
                                insync = true;
                            } catch (e) {
                                sql = free.val();
                                insync = false;
                            }
                        } else {
                            // sync inmodel to model
                            for (let k in inmodel) { delete inmodel[k] };
                            for (let k in model) inmodel[k] = model[k];
                            sql = stringify(model, "\n");
                            insync = true;
                        }
                        onchange(inmodel, sql, insync);
                    }
                    ui.destroy();
                }
            }, {
                text: "Cancel",
                click: function () {
                    diag.dialog("close");
                    diag.remove();
                }
            }]
        }).dialogExtend({
            "maximizable": true,
            "dblclick": "maximize",
            "icons": { "maximize": "ui-icon-arrow-4-diag" },
            "closable": false
        });

        if (sql !== undefined) { // switch to freeform is SQL cannot be turned into model
            $('a[href="#tab-diag-free"]').click();
            $('#tab-diag-free textarea').val(sql).trigger('keyup');
        }
    }

    function dbQueryButton({ root, schema, available, model, onchange }) {
        let but = $('<button style="text-align:left">');
        root.append(but);

        function renderButton() {
            if (model.from.length == 0) {
                but.text("Edit query");
            } else {
                but.html(htmlify(model));
            }
        }
        renderButton();

        but.click(function () {
            dbQueryDialog({
                schema, available, model, onchange: function () {
                    renderButton();
                    if (onchange) onchange(model);
                }
            });
        });
    }

    function createQuery() {
        return {
            select: [],
            distinct: false,
            from: [],
            where: "",
            groupby: [],
            having: "",
            orderby: []
        }
    }

    window.dbquery = { dbQueryButton, dbQueryDialog, dbQueryUI, createQuery, stringify, getTableAliasName };

})();
