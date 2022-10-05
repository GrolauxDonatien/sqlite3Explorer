(function () { // create own lexical scope

    function instance(root) {

        let { distance, queryTypes, toBezier, getBezierXY, isObject } = root;

        const MINJUNCTIONDISTANCE = 20;

        function queryModelToString(m) {

            function toString(what) {
                if (isObject(what)) {
                    if ("display" in what) {
                        return what.display + (what.sort ? (" " + what.sort) : "");
                    } else if ("column" in what) {
                        let t = what.table.trim().split(" ");
                        return `${t[t.length - 1]}.${what.column}${what.sort ? (" " + what.sort) : ""}`;
                    } else if ("table" in what) {
                        return what.table;
                    } else if ("type" in what) {
                        let out = [];
                        processQuery(out, what);
                        return '(' + out.join('') + ')' + (what.alias ? ` ${what.alias}` : "");
                    } else {
                        return `??${JSON.stringify(what)}??`;
                    }
                } else {
                    return what;
                }
            }

            let condTypes = ["AND", "OR", "IS", "IS NOT", "IS NULL", "IS NOT NULL", "EXISTS", "NOT EXISTS", "IN", "NOT IN", "=ANY", "=ALL", "FOR ALL", "LIKE", "NOT LIKE", "REGEXP", "NOT REGEXP", "SOUNDS LIKE", "NOT SOUNDS LIKE", "=", "<>", "<", ">", "<=", ">="];
            function toCond(m, root = true) {
                let out = [];
                if (isObject(m) && m.type && condTypes.indexOf(m.type) != -1) {
                    if (m.type == "AND" || m.type == "OR") out.push('(');
                    if ("left" in m) {
                        out.push(toCond(m.left, false));
                    }
                    out.push(" " + m.type + " ");
                    if ("right" in m) {
                        out.push(toCond(m.right, false));
                    }
                    if (m.type == "AND" || m.type == "OR") out.push(')');
                } else if (m.type == "NOT") {
                    out.push("NOT (");
                    out.push(toCond(m.right, true));
                    out.push(')');
                } else {
                    out.push(toString(m));
                }
                if (root && out.length > 2 && out[0] == "(" && out[out.length - 1] == ")") {
                    out.splice(0, 1);
                    out.splice(out.length - 1, 1);
                }
                return out.join('');
            }
            function processSelect(out, m) {
                out.push("SELECT ");
                if (m.distinct === true) out.push("DISTINCT ");
                let temp = [];
                for (let i = 0; i < m.select.length; i++) {
                    temp.push(toString(m.select[i]));
                }
                out.push(temp.join(','));
                if ("from" in m && m.from.length > 0) {
                    out.push("\nFROM ");
                    for (let i = 0; i < m.from.length; i++) {
                        let what = m.from[i];
                        let tableString = toString(what);
                        if ("inner" in what) {
                            out.push(" INNER JOIN " + tableString + " ON " + toCond(what.inner) + "\n");
                        } else if ("louter" in what) {
                            out.push(" LEFT OUTER JOIN " + tableString + " ON " + toCond(what.louter) + "\n");
                        } else if ("fouter" in what) {
                            out.push(" FULL OUTER JOIN " + tableString + " ON " + toCond(what.fouter) + "\n");
                        } else if ("router" in what) {
                            out.push(" RIGHT OUTER JOIN " + tableString + " ON " + toCond(what.router) + "\n");
                        } else {
                            if (i > 0) {
                                out.push(", " + tableString);
                            } else {
                                out.push(tableString);
                            }
                        }
                    }
                }
                if ("where" in m) {
                    if (!out[out.length - 1].endsWith("\n")) out.push('\n');
                    out.push("WHERE ");
                    out.push(toCond(m.where));
                }
                if ("groupBy" in m) {
                    if (!out[out.length - 1].endsWith("\n")) out.push('\n');
                    out.push("GROUP BY ");
                    let temp = [];
                    for (let i = 0; i < m.groupBy.length; i++) {
                        temp.push(toString(m.groupBy[i]));
                    }
                    out.push(temp.join(', '));
                }
                if ("having" in m) {
                    if (!out[out.length - 1].endsWith("\n")) out.push('\n');
                    out.push("HAVING ");
                    out.push(toCond(m.having));
                }
                if ("orderBy" in m) {
                    if (!out[out.length - 1].endsWith("\n")) out.push('\n');
                    out.push("ORDER BY ");
                    let temp = [];
                    for (let i = 0; i < m.orderBy.length; i++) {
                        temp.push(toString(m.orderBy[i]));
                    }
                    out.push(temp.join(', '));
                }
            }
            function processQuery(out, m) {
                switch (m.type) {
                    case "SELECT":
                        processSelect(out, m);
                        break;
                    case "EXCEPT":
                    case "INTERSECT":
                    case "UNION":
                    case "UNION ALL":
                        out.push("(");
                        processQuery(out, m.left);
                        out.push(") ");
                        out.push(m.type);
                        out.push(" (");
                        processQuery(out, m.right);
                        out.push(")");
                        break;
                    default:
                        throw new Error(m)
                }
            }

            let out = [];
            processQuery(out, m);
            return out.join("");
        }


        function queryASTToQueryModel(t) {

            let warnings = [];

            function processTableReferences(what, tableInfo) {
                let tables = [];
                function flatten(what) {
                    if ("left" in what) {
                        flatten(what.left); // go deep left first
                        let idx = tables.length;
                        flatten(what.right);
                        if (what.type == "InnerCrossJoinTable") {
                            tables[idx].join = 'inner';
                        } else if (what.type == "LeftRightJoinTable" && what.leftRight.toLowerCase() == "left") {
                            tables[idx].join = 'louter';
                        } else if (what.type == "LeftRightJoinTable" && what.leftRight.toLowerCase() == "right") {
                            tables[idx].join = 'router';
                        } else {
                            tables[idx].join = 'fouter';
                        }
                        if ("condition" in what && what.condition != null) {
                            tables[idx].condition = what.condition.value;
                        }
                    } else {
                        tables.push(what);
                    }
                }
                for (let i = 0; i < what.length; i++) {
                    flatten(what[i].value);
                }

                let idx = warnings.length;
                // tables contain a sorted array of TableFactors
                for (let i = 0; i < tables.length; i++) {
                    let f = {};
                    if ('join' in tables[i]) {
                        f.join = tables[i].join;
                        f.condition = tables[i].condition;
                    }
                    if (tables[i].value.type == "SubQuery") { // from subquery
                        let sub = processQuery(tables[i].value.value);
                        if (tables[i].alias !== null) {
                            sub.alias = process(tables[i].alias, tableInfo);
                        }
                        Object.assign(f, sub);
                        if ("alias" in sub) {
                            tableInfo[sub.alias] = Object.assign({ table: sub.alias }, sub);
                        }
                    } else { // normal table reference
                        let table = process(tables[i].value, tableInfo);
                        if (tables[i].alias == null) {
                            f.table = table;
                            f.alias = table;
                            tableInfo[table] = f;
                        } else {
                            let alias = process(tables[i].alias, tableInfo);
                            f.table = table + " " + alias;
                            f.realTable = table;
                            f.alias = alias;
                            tableInfo[alias] = f;
                        }
                    }
                    tables[i] = f;
                }
                warnings.splice(idx); // remote ambiguous reference warnings since they are not needed here
                // append join conditions
                for (let i = 0; i < tables.length; i++) {
                    let f = tables[i];
                    if ("join" in f) {
                        f[f.join] = processCondition(f.condition, tableInfo);
                        delete f.join;
                        delete f.condition;
                    }
                }
                return tables;
            }

            function processCondition(cond, tableInfo) {
                if (cond == null) return {};
                if ("operator" in cond) {
                    let r = {};
                    r.type = cond.operator.toUpperCase();
                    if ("subQueryOpt" in cond) {
                        r.type += cond.subQueryOpt.toUpperCase();
                    }
                    if ("left" in cond) {
                        r.left = processCondition(cond.left, tableInfo);
                    }
                    if ("right" in cond) {
                        r.right = processCondition(cond.right, tableInfo);
                    }
                    return r;
                } else {
                    return process(cond, tableInfo);
                }
            }

            function clean(name) {
                name = name.trim();
                if ((name.startsWith("'") && name.endsWith("'")) || (name.startsWith('"') && name.endsWith('"')) || (name.startsWith("[") && name.endsWith("]"))) {
                    return name.substring(1, name.substring.length - 1);
                } else {
                    return name;
                }
            }

            function processIdentifier(id, tableInfo, alias) {
                id = id.trim();
                if (id.startsWith("'") && id.endsWith("'")) return id; // just a string
                if (id.startsWith('"') && id.endsWith('"')) return id; // just a string
                if (id.startsWith("[") && id.endsWith("]")) return id; // just a string
                if (!(isNaN(parseFloat(id)))) return id; // just a number
                let split = id.split(".");
                if (split.length == 2) { // explicit target
                    let tgt = clean(split[0]);
                    if (tgt in tableInfo) {
                        if (alias) {
                            return {
                                table: tableInfo[tgt].table,
                                column: split[1],
                                display: id + " AS '" + alias + "'",
                                alias
                            };
                        } else {
                            return {
                                table: tableInfo[tgt].table,
                                column: split[1],
                                display: id
                            };
                        }
                    } else {
                        warnings.push("Ambiguous reference " + id);
                        return id;
                    }
                } else {
                    if (id != '*') warnings.push("Ambiguous reference " + id);
                    return id;
                }
            }

            function process(what, tableInfo) {
                if (what === undefined || what === null) return what;
                let temp;
                switch (what.type) {
                    case "Identifier":
                        return processIdentifier(what.value, tableInfo, what.hasAs === true ? what.alias : undefined);
                    case "Number":
                        return parseFloat(what.value);
                    case "String":
                        return what.value;
                    case "Boolean":
                        return what.value == "TRUE";
                    case "Null":
                        return null;
                    case "TableFactor":
                        let table = process(what.value, tableInfo);
                        if (what.alias == null) {
                            let t = {
                                table: table
                            }
                            tableInfo[t.table] = t;
                            return t;
                        } else {
                            let alias = process(def.alias, tableInfo);
                            let t = {
                                table: table + " " + alias,
                                realTable: table,
                                alias: alias
                            };
                            tableInfo[t.alias] = t;
                            return t;
                        }

                    case "TableReferences":
                        return processTableReferences(what.value, tableInfo);
                    case "SubQuery":
                        if (what.hasExists === true) {
                            return {
                                type: 'EXISTS',
                                right: processQuery(what.value, tableInfo)
                            }
                        } else {
                            return processQuery(what.value, tableInfo);
                        }
                    case "NotExpression":
                        if (what.value.type == "SubQuery" && what.value.hasExists === true) {
                            return {
                                type: 'NOT EXISTS',
                                right: processQuery(what.value.value, tableInfo)
                            }
                        } else {
                            return {
                                type: 'NOT',
                                right: process(what.value, tableInfo)
                            }
                        }
                    case "InSubQueryPredicate":
                        return {
                            type: (what.hasNot && what.hasNot.toUpperCase() == "NOT") ? "NOT IN" : "IN",
                            left: process(what.left, tableInfo),
                            right: process(what.right, tableInfo)
                        }
                    case "IsNullBooleanPrimary":
                        return {
                            type: (what.hasNot && what.hasNot.toUpperCase() == "NOT") ? "IS NOT NULL" : "IS NULL",
                            left: process(what.value, tableInfo)
                        }
                    case "Select":
                        return processSelect(what, tableInfo);
                    case "FunctionCall":
                    case "BitExpression":
                    case "CaseWhen":
                        temp = window.sqlParser.parse("SELECT *");
                        if (what.name) what.name = what.name.toUpperCase();
                        temp.value.selectItems.value[0] = what;
                        temp = window.sqlParser.stringify(temp).substring(8);
                        if (what.name && ["MIN", "MAX", "COUNT", "AVG", "SUM"].indexOf(what.name) != -1 && what.params.length == 1 && what.params[0].type == "Identifier") {
                            // aggregate function, we can process them as virtual columns of their tables
                            let id = processIdentifier(what.params[0].value, tableInfo, what.hasAs === true ? what.alias : undefined);
                            if (isObject(id) && id.table) {
                                id.short = what.name + "(" + id.column + ")";
                                id.column = temp;
                                id.display = temp;
                                return id;
                            }
                        }
                        return temp;
                    case "SimpleExprParentheses":
                        return process(what.value, tableInfo);
                    case "ExpressionList":
                        return process(what.value[0], tableInfo);
                    case "InExpressionListPredicate":
                        temp = window.sqlParser.parse("SELECT * FROM DUMMY WHERE DUMMY.id IN (1)");
                        temp.value.where = what;
                        let inlist = window.sqlParser.stringify(temp).substring(39);
                        return {
                            type: (what.hasNot && what.hasNot.toUpperCase() == "NOT") ? "NOT IN" : "IN",
                            left: process(what.left, tableInfo),
                            right: inlist.substring(1, inlist.length - 2)
                        };
                    case "OrExpression":
                    case "XORExpression":
                    case "AndExpression":
                    case "ComparisonBooleanPrimary":
                        return processCondition(what, tableInfo);
                    case "IsExpression":
                        what.operator = (what.hasNot && what.hasNot.toUpperCase() == "NOT") ? "IS NOT" : "IS";
                        return processCondition(what, tableInfo);
                    case "RegexpPredicate":
                        what.operator = (what.hasNot && what.hasNot.toUpperCase() == "NOT") ? "NOT REGEXP" : "REGEXP";
                        return processCondition(what, tableInfo);
                    case "LikePredicate":
                        return {
                            type: (what.hasNot && what.hasNot.toUpperCase() == "NOT") ? "NOT LIKE" : "LIKE",
                            left: process(what.left, tableInfo),
                            right: process(what.right, tableInfo)
                        }
                    case "SoundsLikePredicate":
                        return {
                            type: (what.hasNot && what.hasNot.toUpperCase() == "NOT") ? "NOT SOUNDS LIKE" : "SOUNDS LIKE",
                            left: process(what.left, tableInfo),
                            right: process(what.right, tableInfo)
                        }
                    default:
                        warnings.push("Unknown type " + what.type + " for " + JSON.stringify(what));
                        debugger;
                }
            }

            function processGroupByOrderBy(what, selects, tableInfo) {
                if (what.type == "Number") {
                    let i = parseInt(what.value);
                    if (!(isNaN(i)) && ((i - 1) in selects)) {
                        if (isObject(selects[i - 1])) {
                            return Object.assign({}, selects[i - 1]);
                        } else {
                            return selects[i - 1];
                        }
                    }
                }
                return process(what, tableInfo);
            }

            function processSelect(q, tableInfo) {
                let ret = { type: "SELECT" }
                if (q.distinctOpt && q.distinctOpt.toUpperCase() == "DISTINCT") ret.distinct = true;
                ret.from = process(q.from, tableInfo) || [];
                if (q.selectItems && q.selectItems.type == "SelectExpr") {
                    let v = q.selectItems.value;
                    ret.select = [];
                    for (let i = 0; i < v.length; i++) {
                        ret.select.push(process(v[i], tableInfo));
                    }
                }
                if (q.where) ret.where = processCondition(q.where, tableInfo);
                if (q.groupBy && q.groupBy.value && q.groupBy.value.length > 0) {
                    let v = q.groupBy.value;
                    ret.groupBy = [];
                    for (let i = 0; i < v.length; i++) {
                        let o = processGroupByOrderBy(v[i].value, ret.select, tableInfo);
                        ret.groupBy.push(o);
                    }
                }
                if (q.having) ret.having = processCondition(q.having, tableInfo);
                if (q.orderBy && q.orderBy.value && q.orderBy.value.length > 0) {
                    let v = q.orderBy.value;
                    ret.orderBy = [];
                    for (let i = 0; i < v.length; i++) {
                        let o = processGroupByOrderBy(v[i].value, ret.select, tableInfo);
                        let s = (v[i].sortOpt && v[i].sortOpt.toUpperCase() == "DESC") ? "DESC" : "ASC";
                        if (isObject(o)) {
                            o.sort = s;
                        } else {
                            o = {
                                display: o,
                                sort: s
                            }
                        }
                        ret.orderBy.push(o);
                    }
                }
                return ret;
            }

            function processQuery(q, tableInfo) {
                if (q.type == "Select") {
                    return processSelect(q, Object.assign({}, tableInfo));
                } else if (q.type == "SelectParenthesized") {
                    return processQuery(q.value, tableInfo);
                } else {
                    let ret = {
                        type: q.type.toUpperCase()
                    }
                    if ("left" in q) {
                        ret.left = processQuery(q.left, {});
                    }
                    if ("right" in q) {
                        ret.right = processQuery(q.right, {});
                    }
                    return ret;
                }
            }

            return {
                results: processQuery(t.value, {}),
                warnings
            }
        }
        let mirror = {
            "AND": "OR",
            "OR": "AND",
            "=": "<>",
            "<>": "=",
            ">=": "<",
            ">": "<=",
            "<=": ">",
            "<": ">=",
            "IN": "NOT IN",
            "NOT IN": "IN",
            "LIKE": "NOT LIKE",
            "NOT LIKE": "LIKE",
            "SOUNDS LIKE": "NOT SOUNDS LIKE",
            "NOT SOUNDS LIKE": "SOUNDS LIKE",
            "IS": "IS NOT",
            "IS NOT": "IS",
            "EXISTS": "NOT EXISTS",
            "NOT EXISTS": "EXISTS",
            "REGEXP": "NOT REGEXP",
            "NOT REGEXP": "REGEXP",
            "=ALL": "<>ALL",
            "=ANY": "<>ANY",
            "<>ALL": "=ALL",
            "<>ANY": "=ANY"
        }


        function processConditionsOfQuery(query, process) {
            function processSelect(query) {
                if (query.where) process(query.where, processQuery);
                if (query.having) process(query.having, processQuery);
                if (query.from) for (let i = 0; i < query.from.length; i++) {
                    if ("inner" in query.from[i]) process(query.from[i].inner, processQuery);
                    if ("louter" in query.from[i]) process(query.from[i].louter, processQuery);
                    if ("router" in query.from[i]) process(query.from[i].router, processQuery);
                    if ("fouter" in query.from[i]) process(query.from[i].fouter, processQuery);
                }
            }
            function processQuery(query) {
                if (queryTypes[query.type] === true) {
                    processSelect(query);
                } else if (queryTypes[query.type] === false) {
                    processQuery(query.left);
                    processQuery(query.left);
                }
            }
            processQuery(query);
        }

        function removeNotExpressions(query) {
            function negateCond(cond) {
                if (!isObject(cond)) return cond;
                if (!("type" in cond)) return cond;
                if (cond.type in queryTypes) return cond; // do not negate sub-query, it is the operator linking the sub-query that must be negated, not the sub-query itself
                if (cond.type in mirror) {
                    let left, right;
                    if (cond.left) left = negateCond(cond.left) || false;
                    if (cond.right) right = negateCond(cond.right) || false;
                    if (left !== false && right !== false) {
                        return {
                            type: mirror[cond.type],
                            left, right
                        }
                    }
                } else {
                    return cond;
                }
            }

            processConditionsOfQuery(query, function processCond(cond, processQuery) {
                if (isObject(cond)) {
                    if (!"type" in cond) { return; }
                    if (cond.type == "NOT") {
                        let neg = negateCond(cond.right);
                        if (neg) { // success !
                            for (let k in cond) delete cond[k]; // remove NOT content
                            Object.assign(cond, neg); // set cond to it's negative version
                        }
                    } else if (cond.type in queryTypes) {
                        processQuery(cond);
                    } else {
                        if ("left" in cond) processCond(cond.left, processQuery);
                        if ("right" in cond) processCond(cond.right, processQuery);
                    }
                }
            });
            return query;
        }

        function notExistsToForAll(model, strict = true) {
            function negateCond(cond) {
                if (!isObject(cond)) return cond;
                if (!("type" in cond)) return cond;
                if (cond.type in queryTypes) return notExistsToForAll(cond); // do not negate sub-query, it is the operator linking the sub-query that must be negated, not the sub-query itself
                if (cond.type in mirror) {
                    if (cond.left && cond.right) {
                        let left = negateCond(cond.left);
                        let right = negateCond(cond.right);
                        if (left && right) {
                            return {
                                type: mirror[cond.type],
                                left, right
                            }
                        }
                    } else if (cond.right) {
                        let right = negateCond(cond.right);
                        if (right) {
                            return {
                                type: mirror[cond.type],
                                right
                            }
                        }
                    } else {
                        let left = negateCond(cond.left);
                        if (left) {
                            return {
                                type: mirror[cond.type],
                                left
                            }
                        }
                    }
                }
            }

            function negate(query) {
                // NOT EXISTS is replaced by FOR ALL with inner conditions inversed
                if (query.type !== "SELECT") return; // if not a subquery, it is a set operation which we don't know how to negate
                if (!strict && ("having" in query)) { // selects the same groups (keep where as is), but negate the condition of having
                    let neg = negateCond(query.having);
                    if (neg) {
                        query.having = neg;
                    } else {
                        return; // failed to negate condition
                    }
                    return query;
                }
                if (strict) {
                    // in strict mode, only double NOT EXISTS are converted into FOR ALL/EXISTS
                    function check(cond) {
                        if (cond.type == "NOT EXISTS") return true;
                        if (cond.type == "AND") {
                            if (check(cond.left)) return true;
                            if (check(cond.right)) return true;
                        }
                        return false;
                    }
                    if (!check(query.where)) return;
                }
                let neg = negateCond(query.where);
                if (neg) {
                    query.where = neg;
                } else {
                    return; // failed to negate condition
                }
                return query;
            }
            function process(sub) {
                if (!isObject(sub)) return;
                if (sub.type == "NOT EXISTS") {
                    let neg = negate(sub.right);
                    if (neg !== undefined) {
                        sub.type = "FOR ALL";
                        sub.right = neg;
                    }
                } else {
                    if ("left" in sub) process(sub.left);
                    if ("right" in sub) process(sub.right);
                }
            }
            let out = JSON.parse(JSON.stringify(model));
            if (out.select) for (let i = 0; i < out.select.length; i++) process(out.select[i]);
            if (out.from) for (let i = 0; i < out.from.length; i++) process(out.from[i]);
            if (out.where) process(out.where);
            if (out.groupBy) for (let i = 0; i < out.groupBy.length; i++) process(out.groupBy[i]);
            if (out.having) process(out.having);
            return out;
        }

        const PI2 = Math.PI * 2;
        const PI = Math.PI;
        const HALFPI = Math.PI / 2.0;
        let PAD = 5;

        function drawRectAround(ctx, x, y, width, height, colors) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x - PAD, y - PAD, width + PAD + PAD, height + PAD + PAD);
            for (let i = 0; i < colors.length; i++) {
                ctx.strokeStyle = colors[i];
                ctx.setLineDash([5, (colors.length - 1) * 7.0 + 2]);
                ctx.lineDashOffset = i * 7.0;
                ctx.stroke();
            }
            ctx.restore();
        }

        function drawLineAround(ctx, x1, y1, x2, y2, colors) {
            ctx.save();
            let a = Math.atan2(y2 - y1, x2 - x1);
            let dx = Math.cos(a + HALFPI) * PAD;
            let dy = Math.sin(a + HALFPI) * PAD;
            let dots = [x1 + dx, y1 + dy, x2 + dx, y2 + dy, x2 - dx, y2 - dy, x1 - dx, y1 - dy];
            let b = dotsToBezier(dots, 0.5);
            ctx.beginPath();
            drawBezier(ctx, dotsToBezier(dots, 0.5));
            for (let i = 0; i < colors.length; i++) {
                ctx.strokeStyle = colors[i];
                ctx.setLineDash([5, (colors.length - 1) * 7.0 + 2]);
                ctx.lineDashOffset = i * 7.0;
                ctx.stroke();
            }
            ctx.restore();
        }

        // https://colorhunt.co/palettes/dark

        let colorsPalette = ["#00FF00", "#0000FF", "#FF0000", "#79018C", "#04293A", "#254263", "#461111", "#C84B31", "#064663", "#A13333", "#4C0070", "#ECDBBA", "#ECB365", "#B3541E", "#160040"];

        /*
        * if there were only ANDs or ORs, just displaying all conditions would be enough
        * however, mixing ANDs and ORs we need a visual feedback so that interchanging them does not yield the same output
        * the strategy is to identify groups of ORs together: (A OR B) AND (C OR D)
        * => there are two groups. The first group is (A OR B), i.e. the OR AST node is the root for this group. This group is 
        *    composed of two elements, A/B. Same principle for the second group.
        *  When displayed, each element of a group has a function that returns a set of points defining its convex hull
        *    for each element of a subgroup, we display a border around, and connect this border recursively with the closest element not yet connected
        *    and for each group, we recursively connect the closest subgroups with a line (different than subgroup connections)
        * BUT, a condition could be part of several layered disjunctions: ((((A OR B) AND C) OR D) AND E) OR F
        *    here A is part of OR B, OR D, and OR F => what to do ? 
        *       - simplest: just ignore and let common element be connected several times
        *        - color code each group, using a dash around rectangle with the different possible colors
        * BUT, a column could be part of several conditions in different groups (a.col1=1 OR B) AND (a.col1=2 OR C)
        *    the column should be displayed several times in the table, once per group, and ensure targeting the column takes the group into account
        * */

        function getGroupsColors(ast) {
            let groups = [];
            let idx = 0;
            function processCond(cond, currentGroup) {
                if (!isObject(cond)) return;
                if (cond.type == "SELECT") {
                    // subselect=>run its own coloring
                    processSelect(cond);
                } else if (cond.type != currentGroup.type && (cond.type == "AND" || cond.type == "OR")) {
                    // new sub-group
                    let newGroup = { type: cond.type, colors: currentGroup.colors.slice(0, currentGroup.length), leaves: [], branches: [] };
                    let newCol = colorsPalette[idx];
                    idx = (idx + 1) % colorsPalette.length;
                    newGroup.colors.push(newCol);
                    groups.push(newGroup);
                    let gid = groups.length;
                    // process cond once again, this time using its newGroup
                    processCond(cond, newGroup);
                    while (gid < groups.length) {
                        newGroup.branches.push(groups[gid]);
                        gid++;
                    }
                } else if (cond.type) {
                    // add to current group
                    if (currentGroup.colors.length > 0) {
                        if ("coords" in cond) {
                            currentGroup.leaves.push(cond.coords);
                        }
                        cond.group = currentGroup;
                    }
                    if (cond.left) processCond(cond.left, currentGroup);
                    if (cond.right) processCond(cond.right, currentGroup);
                }
            }

            function processSelect(query) {
                processCond(query.where || {}, { type: "AND", colors: [] });
                for (let i = 0; i < query.from.length; i++) {
                    if ("inner" in query.from[i]) processCond(query.from[i].inner, { type: "AND", colors: [], leaves: [] });
                    if ("louter" in query.from[i]) processCond(query.from[i].louter, { type: "AND", colors: [], leaves: [] });
                    if ("router" in query.from[i]) processCond(query.from[i].router, { type: "AND", colors: [], leaves: [] });
                    if ("fouter" in query.from[i]) processCond(query.from[i].fouter, { type: "AND", colors: [], leaves: [] });
                }
                processCond(query.having || {}, { type: "AND", colors: [] });
            }

            function processQuery(query) {
                switch (query.type) {
                    case "SELECT":
                        processSelect(query);
                        break;
                    case "UNION":
                    case "UNION ALL":
                    case "EXCEPT":
                    case "INTERSECT":
                        processQuery(query.left);
                        processQuery(query.right);
                        break;

                }
            }
            processQuery(ast);
            return groups;
        }

        function drawGroups(ctx, groups, lineSmoothness) {

            ctx.lineWidth = 1;

            function drawLeaf(coords, colors, group) {
                let o = coords(group);
                if (!o) return;
                if ("width" in o) {
                    drawRectAround(ctx, o.x, o.y, o.width, o.height, colors)
                } else {
                    if (o.dx1 || o.dy1 || o.dx2 || o.dy2) {
                        let coords = toBezier(o, lineSmoothness);
                        ctx.save();
                        ctx.beginPath();
                        let a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
                        let dx = Math.sin(a) * PAD;
                        let dy = Math.cos(a) * PAD;
//                        let diff=1+5*Math.min(Math.abs(o.x1-o.x2),Math.abs(o.y1-o.y2))/distance({x:o.x1,y:o.y1},{x:o.x2,y:o.y2});
                        ctx.moveTo(o.x1 + dx, o.y1 + dy);
                        ctx.bezierCurveTo(coords[0] + dx, coords[1] + dy, coords[2] + dx, coords[3] + dy, coords[4] + dx, coords[5] + dy);
                        ctx.moveTo(o.x1 - dx, o.y1 - dy);
                        ctx.bezierCurveTo(coords[0] - dx, coords[1] - dy, coords[2] - dx, coords[3] - dy, coords[4] - dx, coords[5] - dy);
                        for (let i = 0; i < colors.length; i++) {
                            ctx.strokeStyle = colors[i];
                            ctx.setLineDash([5, (colors.length - 1) * 7.0 + 2]);
                            ctx.lineDashOffset = i * 7.0;
                            ctx.stroke();
                        }
                        ctx.restore();
                    } else {
                        drawLineAround(ctx, o.x1, o.y1, o.x2, o.y2, colors);
                    }
                }
            }

            function getRepresentatives(group, tryhard = false) {
                let representatives = [];
                for (let i = 0; i < group.leaves.length; i++) {
                    let o = group.leaves[i](group);
                    if (!o) { return; }
                    if ("width" in o) {
                        representatives.push({
                            x: o.x + o.width / 2,
                            y: o.y + o.width / 2,
                            item: o
                        });
                    } else if (o.dx1 || o.dy1 || o.dx2 || o.dy2) {
                        let coords = toBezier(o, lineSmoothness);
                        let c = getBezierXY(0.5, o.x1, o.y1, coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
                        representatives.push({
                            x: c.x,
                            y: c.y,
                            item: o
                        });
                    } else {
                        representatives.push({
                            x: (o.x1 + o.x2) / 2,
                            y: (o.y1 + o.y2) / 2,
                            item: o
                        });
                    }
                }
                if (!tryhard) return representatives;
                // add branches too
                for (let i = 0; i < group.branches.length; i++) {
                    let subs = getRepresentatives(group.branches[i], true);
                    representatives.push.apply(representatives, subs);
                }
                return representatives;
            }

            let nope = [];

            function drawGroup(ctx, group) {
                let representatives = getRepresentatives(group, true);
                // for this, the representatives are now the leaves of this group, and the leaves of the sub-group (or recursively one of its sub-sub-group)
                if (!representatives) return;
                /*
                                if (representatives.length == 0) {
                                    // there are no direct leaves to represent this group; we'll simplify by finding a branch with representatives
                                    representatives = getRepresentatives(group, true);
                                }*/
                for (let i = 0; i < group.leaves.length; i++) {
                    let o = group.leaves[i];
                    drawLeaf(o, group.colors, group);
                }
                function connectItems(item1, item2, nope) {
                    function dots(item) {
                        if ("width" in item) {
                            return [item.x + item.width / 2, item.y - PAD,
                            item.x + item.width + PAD, item.y + item.height / 2,
                            item.x + item.width / 2, item.y + item.height + PAD,
                            item.x - PAD, item.y + item.height / 2];
                        } else if (item.dx1 || item.dy1 || item.dx2 || item.dy2) {
                            let coords = toBezier(item, lineSmoothness);
                            let c = getBezierXY(0.5, item.x1, item.y1, coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
                            let a = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
                            let dx = Math.cos(a + HALFPI) * PAD;
                            let dy = Math.sin(a + HALFPI) * PAD;
                            if (Math.abs(item.x1 - item.x2) > Math.abs(item.y1 - item.y2)) {
                                return [c.x, c.y + dy, c.x, c.y - dy];
                            } else {
                                return [c.x + dx, c.y, c.x - dx, c.y];
                            }
                        } else {
                            let a = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
                            let dx = Math.cos(a + HALFPI) * PAD;
                            let dy = Math.sin(a + HALFPI) * PAD;
                            if (Math.abs(item.x1 - item.x2) > Math.abs(item.y1 - item.y2)) {
                                return [(item.x1 + item.x2) / 2, (item.y1 + item.y2) / 2 + dy, (item.x1 + item.x2) / 2, (item.y1 + item.y2) / 2 - dy];
                            } else {
                                return [(item.x1 + item.x2) / 2 + dx, (item.y1 + item.y2) / 2, (item.x1 + item.x2) / 2 - dx, (item.y1 + item.y2) / 2];
                            }
                            //                           return [item.x1 + dx, item.y1 + dy, item.x2 + dx, item.y2 + dy, item.x2 - dx, item.y2 - dy, item.x1 - dx, item.y1 - dy];
                        }
                    }
                    item1 = dots(item1);
                    item2 = dots(item2);
                    let src = 0;
                    let dst = 0;
                    let d = Number.MAX_VALUE;
                    // first attempt=take minimal that is higher than threshold
                    function inNope(pt1, pt2) {
                        for (let i = 0; i < nope.length; i += 2) {
                            if ((distance(pt1, nope[i]) + distance(pt2, nope[i + 1]) < 2)) return true;
                            if ((distance(pt2, nope[i]) + distance(pt1, nope[i + 1]) < 2)) return true;
                        }
                        return false;
                    }
                    for (let i = 0; i < item1.length; i += 2) {
                        for (let j = 0; j < item2.length; j += 2) {
                            let dd = distance({ x: item1[i], y: item1[i + 1] }, { x: item2[j], y: item2[j + 1] });
                            if (dd > MINJUNCTIONDISTANCE && dd < d && !inNope({ x: item1[i], y: item1[i + 1] }, { x: item2[j], y: item2[j + 1] })) {
                                src = i;
                                dst = j;
                                d = dd;
                            }
                        }
                    }
                    if (d === Number.MAX_VALUE) {
                        // second attempt=take absolute maximal
                        d = -1;
                        for (let i = 0; i < item1.length; i += 2) {
                            for (let j = 0; j < item2.length; j += 2) {
                                let dd = distance({ x: item1[i], y: item1[i + 1] }, { x: item2[j], y: item2[j + 1] });
                                if (dd > d && !inNope({ x: item1[i], y: item1[i + 1] }, { x: item2[j], y: item2[j + 1] })) {
                                    src = i;
                                    dst = j;
                                    d = dd;
                                }
                            }
                        }
                    }
                    ctx.beginPath();
                    ctx.moveTo(item1[src], item1[src + 1]);
                    ctx.lineTo(item2[dst], item2[dst + 1]);
                    nope.push({ x: item1[src], y: item1[src + 1] });
                    nope.push({ x: item2[dst], y: item2[dst + 1] });
                    ctx.strokeStyle = group.colors[group.colors.length - 1];
                    ctx.lineWidth = 3;
                    if (group.type == "AND") {
                        ctx.setLineDash([]);
                    } else {
                        ctx.setLineDash([4, 3]);
                    }
                    ctx.stroke();
                    ctx.lineWidth = 1;
                }
                let temp = representatives.slice(0);
                while (temp.length > 1) {
                    let cur = temp[0];
                    let best = temp[1];
                    let bestd = distance(cur, best);
                    let idx = 1;
                    for (let j = 2; j < temp.length; j++) {
                        let thisd = distance(cur, temp[j]);
                        if (thisd < bestd) {
                            best = temp[j];
                            bestd = thisd;
                            idx = j;
                        }
                    }
                    temp.splice(idx, 1);
                    connectItems(cur.item, best.item, nope);
                }
            }

            for (let i = 0; i < groups.length; i++) {
                drawGroup(ctx, groups[i]);
            }
        }


        root.queryModelToString = queryModelToString;
        root.queryASTToQueryModel = queryASTToQueryModel;
        root.removeNotExpressions = removeNotExpressions;
        root.notExistsToForAll = notExistsToForAll;
        root.getGroupsColors = getGroupsColors;
        root.drawGroups = drawGroups;

        return root;
    }

    if (typeof window != "undefined") {
        instance(window);
    }

    if (typeof module != "undefined" && module.exports) {
        module.exports = instance(require('./utils.js'));
    }

})();
