(function () { // create own lexical scope

    const UTF8UpArrow = String.fromCharCode(parseInt("21BE", 16));
    const UTF8DownArrow = String.fromCharCode(parseInt("21C3", 16));

    function instance(root) {

        const {
            getClosest, distance, getAround, dotsToBezier, removeNotExpressions, queryModelToString, queryTypes, getBezierXY, drawGroups, toBezier, isObject
        } = root;

        const HALFPI = Math.PI / 2;
        const THREEQUARTERPI = HALFPI + Math.PI;

        function queryModelToPhysModel(model, config = {}) {

            /* process config object
            * making sure it is fulfilled completely with all the defaults
            */

            config.straightLines = config.straightLines || false; // should lines connecting columns & tables be straight or curved ?
            config.lineSmoothness = config.lineSmoothness || 0.7; // smoothness for connecting curves
            config.aroundPad = config.aroundPad || 20; // padding to draw around rectangles/lines
            config.aroundSmoothness = config.aroundSmoothness || 0.5; // smoothness for things drawn around rectangles/lines
            config.lineSpacing = config.lineSpacing || 1.5; // line spacing to columns
            config.style = config.style || {};

            let defaultAll = { // general default style for stuff
                lineWidth: 1,
                lineDash: [],
                lineColor: '#000000',
                backgroundColor: '#FFFFFF',
                textColor: '#000000'
            }
            let defaultStyle = { // specific default styles
                query: Object.assign({}, defaultAll, { lineWidth: 2 }),
                table: Object.assign({}, defaultAll, { lineWidth: 1 }),
                exists: Object.assign({}, defaultAll, { lineWidth: 2 }),
                notExists: Object.assign({}, defaultAll, { lineDash: [5, 15], lineWidth: 2 }),
                forAll: defaultAll,
                subSelect: Object.assign({}, defaultAll, { lineWidth: 2, lineDash: [5, 5] }),
                selectLine: Object.assign({}, defaultAll, { lineDash: [2, 2] }),
                joinLine: Object.assign({}, defaultAll, {}),
                arrowLine: defaultAll,
                set: Object.assign({}, defaultAll, { backgroundColor: '#C9FFD5' }),
                groupBy: Object.assign({}, defaultAll, { lineWidth: 2, lineColor: '#FFFFFF', backgroundColor: '#999999', textColor: '#FFFFFF' }),
                having: Object.assign({}, defaultAll, { lineWidth: 2, backgroundColor: '#CCCCCC' })
            }

            let junctionGroups = [];
            let smooth_value = config.aroundSmoothness;
            const PAD = config.aroundPad;
            const LINESPACING = config.lineSpacing;
            let out = [];

            let style = config.style;

            for (let k in defaultStyle) { // ensure all styles are defined in config.style
                if (!(k in style)) {
                    style[k] = Object.assign({}, defaultStyle[k]);
                } else {
                    for (let j in defaultStyle[k]) {
                        if (!(j in style[k])) {
                            let t = defaultStyle[k][j];
                            if (t instanceof Array) {
                                style[k][j] = t.slice(0);
                            } else {
                                style[k][j] = t;
                            }
                        }
                    }
                }
            }

            function selectToString(s, shortened = true) {
                let out;
                if (typeof s == 'string' || s instanceof String) {
                    out = s;
                } else if ("display" in s) {
                    out = s.display;
                } else {
                    out = "(" + queryModelToString(s) + ")";
                }
                if (shortened && out.length > 25) {
                    return out.substring(0, 10) + "..." + out.substring(out.length - 10);
                } else {
                    return out;
                }
            }

            function createTableRect(r, table) { // creates a rectangle corresponding to a table
                r.type = "rect";
                r.measures = {};
                r.table = table;
                r.columns = {};
                r.lineDash = [];
                if (!("x" in r)) r.x = 0;
                if (!("y" in r)) r.y = 0;
                r.width = 0;
                r.height = 0;
                function colToString(col) {
                    let def = r.columns[col];
                    return ("short" in def ? def.short : col) + ' ' + def.conditions.join(" ; ");
                }
                // in order to display everything in place, we need to measure the size taken by the text to be displayed
                // we do it before displaying the table for the first time
                // the prepare function is called by draw if the measures have not yet been taken
                r.prepare = (ctx) => {
                    if ("lineHeight" in r.measures) return;
                    let m = ctx.measureText(r.table.table);
                    r.measures.lineHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 4;
                    r.measures.columns = {};
                    let i = 0;
                    let w = m.width;
                    for (let k in r.columns) {
                        let col = r.columns[k];
                        if (col.conditions.length > 0) {
                            let groups = {};
                            for (let i = 0; i < col.conditions.length; i++) {
                                let group = col.conditions[i].cond.group;
                                let k = (group === undefined ? '' : group.colors.join('/'));
                                if (!(k in groups)) groups[k] = [];
                                groups[k].push(col.conditions[i]);
                            }
                            r.measures.columns[k] = [];
                            for (let g in groups) {
                                let group = groups[g];
                                let t = ("short" in col ? col.short : k);
                                let sep = ' ';
                                for (let i = 0; i < group.length; i++) {
                                    t += sep + group[i].display;
                                    sep = '; ';
                                }
                                let f = ctx.measureText(t);
                                w = Math.max(w, f.width);
                                r.measures.columns[k].push({
                                    display: t,
                                    group: group[0].cond.group, // they are in the same group, just pick it from the first element
                                    x: [0, f.width + 10],
                                    y: r.measures.lineHeight + 15 + (i * r.measures.lineHeight * LINESPACING) + r.measures.lineHeight / 2,
                                    selected: r.columns[k].selected === true,
                                    grouped: r.columns[k].grouped === true,
                                    having: r.columns[k].having === true
                                });
                                i++;
                            }
                        } else {
                            let t = ("short" in col ? col.short : k);
                            let f = ctx.measureText(t);
                            w = Math.max(w, f.width);
                            r.measures.columns[k] = [{
                                display: t,
                                x: [0, f.width + 10],
                                y: r.measures.lineHeight + 15 + (i * r.measures.lineHeight * LINESPACING) + r.measures.lineHeight / 2,
                                selected: r.columns[k].selected === true,
                                grouped: r.columns[k].grouped === true,
                                having: r.columns[k].having === true
                            }];
                            i++;
                        }
                    }
                    r.width = w + 10;
                    r.height = ((i + 1) * r.measures.lineHeight * LINESPACING) + 10;
                    r.fillStyle = style.table.backgroundColor;
                    r.strokeStyle = style.table.lineColor;
                    r.lineWidth = style.table.lineWidth;
                    r.lineDash = style.table.lineDash;
                }
                r.draw = function (layers, model) {
                    if (!("lineHeight" in r.measures)) {
                        layers[0].push(r.prepare);
                    }
                    this.super.draw(layers, model); // call the default draw function to draw the border
                    layers[4].push((ctx) => { // but we still need to draw the content
                        ctx.beginPath();
                        ctx.setLineDash(style.table.lineDash);
                        ctx.strokeStyle = style.table.lineColor;
                        ctx.lineWidth = style.table.lineWidth;
                        ctx.moveTo(this.x, this.y + this.measures.lineHeight + 12);
                        ctx.lineTo(this.x + this.width, this.y + this.measures.lineHeight + 12);
                        ctx.stroke();
                        ctx.fillStyle = style.table.textColor;
                        ctx.fillText(r.table.table, this.x + 5, this.y + this.measures.lineHeight + 5);
                        for (let k in this.measures.columns) {
                            let cols = this.measures.columns[k];
                            for (let i = 0; i < cols.length; i++) {
                                let c = cols[i];
                                if (c.grouped) { // grouped column => apply different style
                                    ctx.fillStyle = style.groupBy.backgroundColor;
                                    ctx.fillRect(this.x + style.table.lineWidth, this.y + c.y - this.measures.lineHeight / 2, this.width - 2 * style.table.lineWidth, this.measures.lineHeight * 1.2 + 2);
                                    ctx.fillStyle = style.groupBy.textColor;
                                    ctx.fillText(c.display, this.x + c.x[0] + 6, this.y + c.y + this.measures.lineHeight / 2);
                                    if (c.selected) {
                                        ctx.beginPath();
                                        ctx.setLineDash(style.selectLine.lineDash);
                                        ctx.strokeStyle = style.groupBy.lineColor;
                                        ctx.lineWidth = style.groupBy.lineWidth;
                                        ctx.moveTo(this.x + c.x[0] + 6, this.y + c.y + this.measures.lineHeight / 2 + 2);
                                        ctx.lineTo(this.x + c.x[1] - 10, this.y + c.y + this.measures.lineHeight / 2 + 2);
                                        ctx.stroke();
                                    }
                                } else if (c.having) { // having column => apply different style
                                    ctx.fillStyle = style.having.backgroundColor;
                                    ctx.fillRect(this.x + style.table.lineWidth, this.y + c.y - this.measures.lineHeight / 2, this.width - 2 * style.table.lineWidth, this.measures.lineHeight * 1.2 + 2);
                                    ctx.fillStyle = style.having.textColor;
                                    ctx.fillText(c.display, this.x + c.x[0] + 6, this.y + c.y + this.measures.lineHeight / 2);
                                    if (c.selected) {
                                        ctx.beginPath();
                                        ctx.setLineDash(style.selectLine.lineDash);
                                        ctx.strokeStyle = style.having.lineColor;
                                        ctx.lineWidth = style.having.lineWidth;
                                        ctx.moveTo(this.x + c.x[0] + 6, this.y + c.y + this.measures.lineHeight / 2 + 2);
                                        ctx.lineTo(this.x + c.x[1] - 10, this.y + c.y + this.measures.lineHeight / 2 + 2);
                                        ctx.stroke();
                                    }
                                } else {
                                    ctx.fillStyle = style.table.textColor;
                                    ctx.fillText(c.display, this.x + c.x[0] + 6, this.y + c.y + this.measures.lineHeight / 2);
                                    if (c.selected) {
                                        ctx.beginPath();
                                        ctx.setLineDash(style.selectLine.lineDash);
                                        ctx.strokeStyle = style.selectLine.lineColor;
                                        ctx.lineWidth = style.selectLine.lineWidth;
                                        ctx.moveTo(this.x + c.x[0] + 6, this.y + c.y + this.measures.lineHeight / 2 + 2);
                                        ctx.lineTo(this.x + c.x[1] - 10, this.y + c.y + this.measures.lineHeight / 2 + 2);
                                        ctx.stroke();
                                    }
                                }
                            }
                        }
                    })
                }
                return r;
            }

            function gatherColumns(query, table) {
                // gathers the columns for this table in query
                // determining if they are selected or not
                let cols = {};
                function loop(cond, pre = {}) {
                    if (!(cond instanceof Object)) return;
                    if (("column" in cond) && (cond.table == table)) {
                        if (!(cond.column in cols)) {
                            cols[cond.column] = JSON.parse(JSON.stringify(cond));
                        }
                        cols[cond.column].conditions = [];
                        Object.assign(cols[cond.column], pre);
                    }
                    if ("left" in cond) loop(cond.left, pre);
                    if ("right" in cond) loop(cond.right, pre);
                    if (cond.type === "SELECT") {
                        // maybe the column is referenced in a subselect ?
                        for (let i = 0; i < cond.from.length; i++) {
                            if (cond.from[i].table == table) return; // table is shadowed in subquery
                        }
                        loopQuery(cond);
                    }
                }
                function loopQuery(query) {
                    for (let i = 0; i < query.select.length; i++) {
                        loop(query.select[i], { selected: true });
                    }
                    loop(query.where || {});
                    for (let i = 0; i < query.from.length; i++) {
                        if ("inner" in query.from[i]) loop(query.from[i].inner);
                        if ("louter" in query.from[i]) loop(query.from[i].louter);
                        if ("router" in query.from[i]) loop(query.from[i].router);
                        if ("fouter" in query.from[i]) loop(query.from[i].fouter);
                    }
                    if (query.groupBy) {
                        for (let i = 0; i < query.groupBy.length; i++) {
                            loop(query.groupBy[i], { grouped: true });
                        }
                    }
                    loop(query.having || {}, { having: true });
                }
                loopQuery(query);
                // let's sort the columns
                // first selected not grouped not having in the order they were found
                // then not grouped not having in alphabetical order
                // then the rest with priority to selected then grouped then having
                let out = {};
                for (let k in cols) { // YNN
                    if (cols[k].selected === true && cols[k].grouped !== true && cols[k].having !== true) {
                        out[k] = cols[k];
                        delete cols[k];
                    }
                }
                let temp = [];
                for (let k in cols) { // NNN
                    if (cols[k].selected !== true && cols[k].grouped !== true && cols[k].having !== true) {
                        temp.push(k);
                    }
                }
                temp.sort();
                for (let i = 0; i < temp.length; i++) {
                    out[temp[i]] = cols[temp[i]];
                    delete cols[temp[i]];
                }
                temp = Object.keys(cols);
                temp.sort((a, b) => {
                    let ca = cols[a];
                    let cb = cols[b];
                    let scorea = (ca.selected ? 0 : 100) + (ca.grouped ? 0 : 10) + (ca.having ? 0 : 1);
                    let scoreb = (cb.selected ? 0 : 100) + (cb.grouped ? 0 : 10) + (cb.having ? 0 : 1);
                    return scorea - scoreb;
                });
                for (let i = 0; i < temp.length; i++) {
                    out[temp[i]] = cols[temp[i]];
                }
                return out;
            }

            function createSelectRect(r, query, parent) {
                let links = [];
                r.type = "rect";
                r.lineDash = [];
                r.drawer = 'closed';
                r.measures = {};
                r.query = query;
                r.model = [];
                r.tables = {};
                // process tables
                for (let i = 0; i < query.from.length; i++) {
                    if (query.from[i].type in queryTypes) {
                        let { rect, links } = createSelectRect({ x: i * 30, y: 10, width: 100, height: 100 }, query.from[i], findTarget);
                        rect.drawer = 'stuckopen';
                        r.model.push(rect);
                        r.model.push.apply(out, links);
                        if (query.from[i].alias) {
                            rect.hint = query.from[i].alias;
                            r.tables[rect.hint] = rect;
                            rect.columns = gatherColumns(query, query.from[i].alias);
                        } else {
                            rect.columns = {};
                        }

                    } else {
                        let table = createTableRect({ x: i * 30, y: 10 }, query.from[i]);
                        r.model.push(table);
                        r.tables[query.from[i].table] = table;
                        table.columns = gatherColumns(query, query.from[i].table); // example : {"t":{"table":"dummy","column":"t","display":"dummy.t","conditions":[],"selected":true}}
                    }
                }
                // process conditions
                function findTarget(table, column, path = []) {
                    if (arguments.length < 2) { // return the absolute coords of r
                        //                        let c = { x: r.x + (r.paddingLeft || 0), y: r.y + (r.paddingTop || 0), width: r.width - (r.paddingLeft || 0), height: r.height - (r.paddingTop || 0) };
                        let c = { x: r.x + (r.paddingLeft || 0), y: r.y + (r.paddingTop || 0), width: r.width - (r.paddingLeft || 0), height: r.height - (r.paddingTop || 0) };
                        if (parent) {
                            let oc = parent(); // convert relative coords to absolute coords by recursively calling parent
                            c.x += oc.x + (config.padx || 0);
                            c.y += oc.y + (config.pady || 0);
                        }
                        return c;
                    }
                    if (table in r.tables) { // target is inside this model
                        if (column) {
                            return {
                                table: r.tables[table],
                                tableName: table,
                                column: r.tables[table].columns[column],
                                columnName: column,
                                measures: r.tables[table].measures,
                                model: r.model,
                                path,
                                container: r,
                                coords(group) {
                                    let s = r.query.coords();
                                    let t = r.tables[table];
                                    let cols = t.measures.columns[column];
                                    for (let i = 0; i < cols.length; i++) {
                                        let c = cols[i];
                                        if (c.group == group) return {
                                            x: s.x + t.x + c.x[0] + (config.padx || 0),
                                            y: s.y + t.y + c.y - t.measures.lineHeight / 2 + (config.pady || 0) + 5,
                                            width: c.x[1] - c.x[0],
                                            height: t.measures.lineHeight
                                        }
                                    }
                                }
                            }
                        } else {
                            return {
                                table: r.tables[table],
                                measures: r.measures,
                                model: r.model,
                                path,
                                container: r,
                                coords() {
                                }
                            }
                        }
                    } else if (parent) {
                        path.push(r);
                        return parent(table, column, path);
                    } else {
                        return null;
                    }
                }

                query.coords = findTarget; // attach to AST, so that disjunction groups can work properly

                function inverseOperator(op) {
                    switch (op) {
                        case "<":
                            return ">";
                        case ">":
                            return "<";
                        case "<=":
                            return ">=";
                        case ">=":
                            return "<=";
                        default:
                            return op;
                    }
                }

                function createSubSelect(sub) {
                    let idx = r.model.length;
                    processQuery(sub, r.model, false, findTarget);
                    while (idx < r.model.length) {
                        if (r.model[idx].type == "rect") {
                            r.model[idx].lineDash = [5, 15];
                            return r.model[idx];
                        }
                        idx++;
                    }
                }

                function getColumnPos(target, other) {
                    if (!('columns' in target.measures)) return;
                    // find canvas position of target relative to their common container
                    let padx = target.table.x;
                    let pady = target.table.y + target.measures.lineHeight / 3;

                    for (let i = 0; i < other.path.length; i++) {
                        padx += (other.path[i].paddingLeft || 0) + other.path[i].x + (config.padx || 5);
                        pady += (other.path[i].paddingTop || 0) + other.path[i].y + (config.pady || 5);
                    }
                    let tgt = target.measures.columns[target.columnName];
                    if (tgt instanceof Array) {
                        return { x: tgt[0].x, y: tgt[0].y, padx, pady, table: target.table }
                    } else {
                        return { x: tgt.x, y: tgt.y, padx, pady, table: target.table }
                    }
                }

                function getRectPos(target, other) {
                    if (!('target' in target)) return;
                    // find canvas position of target relative to their common container
                    let padx = 0;
                    let pady = 0;

                    for (let i = 0; i < other.path.length; i++) {
                        padx += (other.path[i].paddingLeft || 0) + other.path[i].x + (config.padx || 5);
                        pady += (other.path[i].paddingTop || 0) + other.path[i].y + (config.pady || 5);
                    }
                    return { x: target.target.x, y: target.target.y, padx, pady, width: target.target.width, height: target.target.height }
                }

                function createLinkBetween(left, right, link = {}, style) {

                    function drawArrowHead(ctx, x, y, rot, full = true) {
                        ctx.save();
                        ctx.translate(x, y);
                        ctx.rotate(rot);
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.lineTo(-5, -12);
                        ctx.lineTo(5, -12);
                        ctx.closePath();
                        if (full) {
                            ctx.fill();
                        } else {
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fill();
                            ctx.stroke();
                        }
                        ctx.restore();
                    }
                    function drawCircle(ctx, x, y, r, full = true) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(x, y, r, 0, 2 * Math.PI);
                        if (full) {
                            ctx.fill();
                        } else {
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fill();
                            ctx.stroke();
                        }
                        ctx.restore();
                    }

                    function draw(c, layers) {
                        layers[6].push((ctx) => {
                            let m, l, r, n;
                            ctx.beginPath();
                            ctx.setLineDash(style.lineDash);
                            ctx.lineWidth = style.lineWidth;
                            ctx.strokeStyle = style.lineColor;
                            ctx.moveTo(c.x1, c.y1);
                            if (c.dx1 || c.dy1 || c.dx2 || c.dy2) {
                                let coords = toBezier(c, config.lineSmoothness);
                                ctx.bezierCurveTo(coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
                            } else {
                                ctx.lineTo(c.x2, c.y2);
                            }
                            ctx.stroke();
                            let mx, my;
                            if (c.dx1 || c.dy1 || c.dx2 || c.dy2) {
                                let coords = toBezier(c, config.lineSmoothness);
                                let d = getBezierXY(0.5, c.x1, c.y1, coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
                                mx = d.x;
                                my = d.y;
                                let d2 = getBezierXY(0.55, c.x1, c.y1, coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
                                a = Math.atan2(d2.y - d.y, d2.x - d.x);
                            } else {
                                mx = (c.x1 + c.x2) / 2;
                                my = (c.y1 + c.y2) / 2;
                                a = Math.atan2(c.y2 - c.y1, c.x2 - c.x1);
                            }
                            switch (link.hint) {
                                case "=":
                                    break; // = is implicit when nothing is displayed
                                case "<>": // circle around
                                    m = ctx.measureText(link.hint);
                                    l = Math.max(m.width, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 2;
                                    r = Math.sqrt(l * l * 2) / 2;
                                    ctx.beginPath();
                                    ctx.arc(mx, my, r, 0, 2 * Math.PI);
                                    ctx.fillStyle = style.backgroundColor;
                                    ctx.fill();
                                    ctx.stroke();
                                    ctx.fillStyle = style.textColor;
                                    ctx.fillText(link.hint, mx - l / 2 + 1, my + m.actualBoundingBoxAscent / 2);
                                    break;
                                default: // rain drop directed c.f towards c.t
                                    n = link.hint.startsWith('NOT');
                                    let t = n ? link.hint.substring(4) : link.hint;
                                    m = ctx.measureText(t);
                                    l = Math.max(m.width, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 2;
                                    r = Math.sqrt(l * l * 2) / (t.length > 2 ? 3 : 2);
                                    ctx.beginPath();
                                    ctx.arc(mx, my, r, a + HALFPI, a + THREEQUARTERPI);
                                    let px1 = mx + Math.cos(a + HALFPI) * r;
                                    let py1 = my + Math.sin(a + HALFPI) * r;
                                    let px2 = mx + Math.cos(a) * r * 2;
                                    let py2 = my + Math.sin(a) * r * 2;
                                    let px3 = mx + Math.cos(a - HALFPI) * r;
                                    let py3 = my + Math.sin(a - HALFPI) * r;
                                    ctx.moveTo(px1, py1);
                                    ctx.lineTo(px2, py2);
                                    ctx.lineTo(px3, py3);
                                    ctx.fillStyle = style.backgroundColor;
                                    ctx.fill();
                                    ctx.stroke();
                                    ctx.fillStyle = style.textColor;
                                    ctx.fillText(t, mx - l / 2 + 1, my + m.actualBoundingBoxAscent / 2);
                                    let px4 = mx + Math.cos(a + HALFPI / 2 + Math.PI) * r;
                                    let py4 = my + Math.sin(a + HALFPI / 2 + Math.PI) * r;
                                    let px5 = mx + Math.cos(a - HALFPI / 2 + Math.PI) * r;
                                    let py5 = my + Math.sin(a - HALFPI / 2 + Math.PI) * r;
                                    if (n) {
                                        ctx.moveTo((px1 + px2) / 2, (py1 + py2) / 2);
                                        ctx.lineTo(px4, py4);
                                        ctx.moveTo((px3 + px2) / 2, (py3 + py2) / 2);
                                        ctx.lineTo(px5, py5);
                                        ctx.stroke();
                                    }
                                    break;
                            }
                        });
                        if (link.leftSymbol !== undefined) {
                            layers[6].push((ctx) => {
                                switch (link.leftSymbol) {
                                    case "inner":
                                        drawCircle(ctx, c.x1, c.y1, 5, false);
                                        break;
                                    case "outer":
                                        drawCircle(ctx, c.x1, c.y1, 5, true);
                                        break;
                                    case "small":
                                        drawCircle(ctx, c.x1, c.y1, 3, false);
                                        break;
                                    case "arrow":
                                    case "warrow":
                                        if (c.dx1 || c.dy1 || c.dx2 || c.dy2) {
                                            let coords = toBezier(c, config.lineSmoothness);
                                            let d = getBezierXY(0.10, c.x1, c.y1, coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
                                            drawArrowHead(ctx, c.x1, c.y1, -Math.atan2(c.x1 - d.x, c.y1 - d.y), link.leftSymbol == "arrow");
                                        } else {
                                            drawArrowHead(ctx, c.x1, c.y1, -Math.atan2(c.x1 - c.x2, c.y1 - c.y2), link.leftSymbol == "arrow");
                                        }
                                        break;
                                }
                            });
                        }
                        if (link.rightSymbol !== undefined) {
                            layers[6].push((ctx) => {
                                switch (link.rightSymbol) {
                                    case "inner":
                                        drawCircle(ctx, c.x2, c.y2, 5, false);
                                        break;
                                    case "outer":
                                        drawCircle(ctx, c.x2, c.y2, 5, true);
                                        break;
                                    case "small":
                                        drawCircle(ctx, c.x2, c.y2, 3, false);
                                        break;
                                    case "arrow":
                                    case "warrow":
                                        if (c.dx1 || c.dy1 || c.dx2 || c.dy2) {
                                            let coords = toBezier(c, config.lineSmoothness);
                                            let d = getBezierXY(0.90, c.x1, c.y1, coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
                                            drawArrowHead(ctx, c.x2, c.y2, -Math.atan2(c.x2 - d.x, c.y2 - d.y), link.leftSymbol == "arrow");
                                        } else {
                                            drawArrowHead(ctx, c.x2, c.y2, -Math.atan2(c.x1 - c.x2, c.y1 - c.y2) + Math.PI, false);
                                        }
                                        break;
                                }
                            });
                        }
                    }


                    link.type = "link";
                    link.fromborder = true;
                    link.toborder = true;
                    if (!('lineDash' in link)) link.lineDash = [];
                    let tgt1, tgt2;
                    if ('table' in left) {
                        tgt1 = findTarget(left.table, left.column);
                    } else {
                        tgt1 = {
                            model: r.model,
                            path: [],
                            container: r,
                            target: left
                        }
                    }
                    if ('table' in right) {
                        tgt2 = findTarget(right.table, right.column);
                    } else {
                        tgt2 = {
                            model: r.model,
                            path: [],
                            container: r,
                            target: right
                        }
                    }
                    if (tgt1 == null || tgt2 == null) return null;
                    if (tgt1.column && tgt2.column) {
                        // we have a source and a destination
                        link.from = tgt2.path.length == 0 ? tgt1.table : tgt2.path[tgt2.path.length - 1];
                        link.to = tgt1.path.length == 0 ? tgt2.table : tgt1.path[tgt1.path.length - 1];
                        link.rcoords = function () {
                            let from = getColumnPos(tgt1, tgt2);
                            let to = getColumnPos(tgt2, tgt1);
                            if (from == null || to == null) return;
                            let d = Number.MAX_VALUE;
                            let c;
                            for (let i = 0; i < from.x.length; i++) {
                                for (let j = 0; j < to.x.length; j++) {
                                    let candidate = { f: { x: from.x[i] + from.padx, y: from.y + from.pady, dx: i == 0 ? -1 : 1 }, t: { x: to.x[j] + to.padx, y: to.y + to.pady, dx: j == 0 ? -1 : 1 } };
                                    let cd = distance(candidate.f, candidate.t);
                                    if (cd < d) {
                                        d = cd;
                                        c = candidate;
                                    }
                                }
                            }
                            if (config.straightLines) {
                                return { x1: c.f.x, y1: c.f.y, x2: c.t.x, y2: c.t.y };
                            } else {
                                return { x1: c.f.x, y1: c.f.y, dx1: c.f.dx, x2: c.t.x, y2: c.t.y, dx2: c.t.dx };
                            }
                        }
                    } else if (tgt1.column && tgt2.target) {
                        // we have a source and a destination
                        link.from = tgt2.path.length == 0 ? tgt1.table : tgt2.path[tgt2.path.length - 1];
                        link.to = tgt1.path.length == 0 ? tgt2.target : tgt1.path[tgt1.path.length - 1];
                        //                link.rightSymbol = "arrow";
                        link.rcoords = function () {
                            // link from a column to a rectangle
                            let from = getColumnPos(tgt1, tgt2);
                            let to = getRectPos(tgt2, tgt1);
                            if (from == null || to == null) return;
                            let d = Number.MAX_VALUE;
                            let c;
                            for (let i = 0; i < from.x.length; i++) {
                                let p = getClosest({ x: to.x + to.padx, y: to.y + to.pady, width: to.width, height: to.height, type: 'rect' }, { x: from.x[i] + from.padx, y: from.y + from.pady, type: "dot" });
                                let candidate = { f: { x: from.x[i] + from.padx, y: from.y + from.pady }, t: p }
                                let cd = distance(candidate.f, candidate.t);
                                if (cd < d) {
                                    d = cd;
                                    c = candidate;
                                }
                            }
                            if (config.straightLines) {
                                return { x1: c.f.x, y1: c.f.y, x2: c.t.x, y2: c.t.y };
                            } else {
                                return { x1: c.f.x, y1: c.f.y, dx1: c.f.dx, dy1: c.f.dy, x2: c.t.x, y2: c.t.y, dx2: c.t.dx, dy2: c.t.dy };
                            }
                        }
                    } else if (tgt1.target && tgt2.column) {
                        // we have a source and a destination
                        link.from = tgt2.path.length == 0 ? tgt1.table : tgt2.path[tgt2.path.length - 1];
                        link.to = tgt1.path.length == 0 ? tgt2.target : tgt1.path[tgt1.path.length - 1];
                        //                link.rightSymbol = "arrow";
                        link.rcoords = function () {
                            // link from a column to a rectangle
                            let from = getRectPos(tgt1, tgt2);
                            let to = getColumnPos(tgt2, tgt1);
                            if (from == null || to == null) return;
                            let d = Number.MAX_VALUE;
                            let c;
                            for (let i = 0; i < to.x.length; i++) {
                                let p = getClosest({ x: from.x + from.padx, y: from.y + from.pady, width: from.width, height: from.height, type: 'rect' }, { x: to.x[i] + to.padx, y: to.y + to.pady, type: "dot" });
                                let candidate = { f: p, t: { x: to.x[i] + to.padx, y: to.y + to.pady } }
                                let cd = distance(candidate.f, candidate.t);
                                if (cd < d) {
                                    d = cd;
                                    c = candidate;
                                }
                            }
                            if (config.straightLines) {
                                return { x1: c.f.x, y1: c.f.y, x2: c.t.x, y2: c.t.y };
                            } else {
                                return { x1: c.f.x, y1: c.f.y, dx1: c.f.dx, dy1: c.f.dy, x2: c.t.x, y2: c.t.y, dx2: c.t.dx, dy2: c.t.dy };
                            }
                        }
                    } else if (tgt1.target && tgt2.target) {
                        link.from = tgt2.path.length == 0 ? tgt1.target : tgt2.path[tgt2.path.length - 1];
                        link.to = tgt1.path.length == 0 ? tgt2.target : tgt1.path[tgt1.path.length - 1];
                        //                link.rightSymbol = "arrow";
                        link.rcoords = function () {
                            // link from a column to a rectangle
                            let from = getRectPos(tgt1, tgt2);
                            let to = getRectPos(tgt2, tgt1);
                            if (from == null || to == null) return;
                            let rf = { x: from.x + from.padx, y: from.y + from.pady, width: from.width, height: from.height, type: 'rect' };
                            let rt = { x: to.x + to.padx, y: to.y + to.pady, width: to.width, height: to.height, type: 'rect' };
                            let c = { f: getClosest(rf, rt), t: getClosest(rt, rf) };
                            if (config.straightLines) {
                                return { x1: c.f.x, y1: c.f.y, x2: c.t.x, y2: c.t.y };
                            } else {
                                return { x1: c.f.x, y1: c.f.y, dx1: c.f.dx, dy1: c.f.dy, x2: c.t.x, y2: c.t.y, dx2: c.t.dx, dy2: c.t.dy };
                            }
                        }
                    }
                    link.draw = function (layers) {
                        draw(link.rcoords(), layers);
                    }
                    if (tgt1.path.length > tgt2.path.length) {
                        tgt1.model.push(link);
                    } else {
                        tgt2.model.push(link);
                    }
                    link.coords = () => {
                        let c = link.rcoords();
                        let o = (tgt1.path.length > tgt2.path.length) ? tgt1 : tgt2;
                        let p = o.container.query.coords(); // shift by container coords
                        if ("x1" in c) {
                            c.x1 += p.x + (config.padx || 5);
                            c.y1 += p.y + (config.pady || 5);
                            c.x2 += p.x + (config.padx || 5);
                            c.y2 += p.y + (config.pady || 5);
                        } else {
                            c.x += p.x + (config.padx || 5);
                            c.y += p.y + (config.pady || 5);
                        }
                        return c;
                    }

                    return link;
                }

                function processCond(cond, leftSymbol, rightSymbol, group = {}) {
                    if ("group" in cond) group = cond.group;
                    let leftSubQuery = cond.left !== undefined && Object.getPrototypeOf(cond.left) === Object.prototype && ("type" in cond.left) && (cond.left.type in queryTypes);
                    let rightSubQuery = cond.right !== undefined && Object.getPrototypeOf(cond.right) === Object.prototype && ("type" in cond.right) && (cond.right.type in queryTypes);
                    let leftDirect = cond.left !== undefined && Object.getPrototypeOf(cond.left) !== Object.prototype; // direct static value
                    let rightDirect = cond.right !== undefined && Object.getPrototypeOf(cond.right) !== Object.prototype; // direct static value
                    let leftColumn = cond.left !== undefined && Object.getPrototypeOf(cond.left) === Object.prototype && ("column" in cond.left);
                    let rightColumn = cond.right !== undefined && Object.getPrototypeOf(cond.right) === Object.prototype && ("column" in cond.right);
                    switch (cond.type) {
                        case "AND":
                        case "OR":
                            processCond(cond.left, leftSymbol, rightSymbol, group);
                            processCond(cond.right, leftSymbol, rightSymbol, group);
                            break;
                        case "IS NULL":
                        case "IS NOT NULL":
                            if (leftColumn) {
                                let tgt = findTarget(cond.left.table, cond.left.column);
                                if (tgt !== null) {
                                    tgt.column.conditions.push({ cond, display: cond.type });
                                }
                            } else if (leftSubQuery) {
                                // how do you represent a subquery that IS NULL or IS NOT NULL ?
                                // the same as EXISTS and NOT EXISTS, but using the left condition instead of the right
                                createSubSelect(cond.left).hint = cond.type;
                            } // a direct value IS NULL or IS NOT NULL: makes no sense, just ignore
                            break;
                        case "EXISTS":
                        case "NOT EXISTS":
                        case "FOR ALL":
                            if (!rightSubQuery) break; // makes no sense if right is not a subquery
                            createSubSelect(cond.right).hint = cond.type;
                            cond.coords = cond.right.coords; // transfer coords function directly here
                            break;
                        case "IN":
                        case "NOT IN":
                        case "=ANY":
                        case "=ALL":
                            if (leftDirect && rightSubQuery) { // value IN (SELECT...)
                                // represents as EXISTS and NOT EXISTS, with appropriate hint
                                createSubSelect(cond.right).hint = cond.left + " " + cond.type;
                                cond.coords = cond.right.coords; // transfer coords function directly here
                            } else if (leftColumn && rightSubQuery) { // column IN (SELECT...)
                                let r = createSubSelect(cond.right);
                                let link = createLinkBetween(cond.left, r, {
                                    hint: cond.type
                                }, style.joinLine);
                                cond.coords = link.coords; // transfer coords function to AST
                            } else if (leftColumn && rightDirect) { // column IN value
                                let tgt = findTarget(cond.left.table, cond.left.column);
                                if (tgt !== null) {
                                    tgt.column.conditions.push({ cond, display: `${cond.type} (${cond.right})` });
                                    cond.coords = tgt.coords; // transfer coords function to AST
                                }
                            } else if (leftSubQuery && rightDirect) { // (SELECT ...) IN value
                                createSubSelect(cond.left).hint = cond.type + " " + cond.right;
                                cond.coords = cond.left.coords; // transfer coords function directly here
                                //                                delete cond.left.coords;
                            } else if (leftSubQuery && rightSubQuery) { // (SELECT ...) IN (SELECT ...)
                                let r1 = createSubSelect(cond.left);
                                let r2 = createSubSelect(cond.right);
                                let link = createLinkBetween(r1, r2, {
                                    hint: cond.type
                                }, style.joinLine);
                                cond.coords = link.coords;
                            } // else does not make sense, just ignore
                            break;
                        default: // généric case for the remaining operators
                            if (leftSubQuery && rightSubQuery) {
                                let r1 = createSubSelect(cond.left);
                                let r2 = createSubSelect(cond.right);
                                let link = createLinkBetween(r1, r2, {
                                    hint: cond.type
                                }, style.joinLine);
                                cond.coords = link.coords;
                            } else if (leftSubQuery || rightSubQuery) {
                                let sub, other, op, column, direct;
                                if (leftSubQuery) {
                                    sub = cond.left;
                                    other = cond.right;
                                    op = cond.type;
                                    column = rightColumn;
                                    direct = rightDirect;
                                } else {
                                    sub = cond.right;
                                    other = cond.left;
                                    op = inverseOperator(cond.type);
                                    column = leftColumn;
                                    direct = leftDirect;
                                }
                                if (column) {
                                    let r = createSubSelect(sub);
                                    let link = createLinkBetween(other, r, {
                                        hint: cond.type
                                    }, style.joinLine);
                                    cond.coords = link.coords;
                                } else if (direct) {
                                    createSubSelect(sub).hint = op + other;
                                    cond.coords = sub.coords; // transfer coords function directly here
                                    //                                    delete sub.coords;
                                }
                            } else if (rightColumn && leftColumn) {
                                let tgt1 = findTarget(cond.left.table, cond.left.column);
                                let tgt2 = findTarget(cond.right.table, cond.right.column);
                                if (tgt1 !== null && tgt2 != null && tgt1.column && tgt2.column) {
                                    // we have a source and a destination
                                    // find the tgt with the longest path, and point the arrow towards it
                                    let leftArrow, rightArrow;
                                    if (tgt1.path.length > tgt2.path.length) {
                                        leftArrow = "warrow";
                                    } else if (tgt2.path.length > tgt1.path.length) {
                                        rightArrow = "warrow";
                                    } else {
                                        if (cond.type == "=") {
                                            leftArrow = "small";
                                            rightArrow = "small";
                                        }
                                    }
                                    let link = createLinkBetween(cond.left, cond.right, {
                                        hint: cond.type,
                                        leftSymbol: leftSymbol || leftArrow, rightSymbol: rightSymbol || rightArrow
                                    }, style.joinLine);
                                    cond.coords = link.coords;
                                }
                            } else if (leftColumn || rightColumn) {
                                let col, operator, operand;
                                if (leftColumn) {
                                    col = cond.left;
                                    operator = cond.type;
                                    operand = cond.right;
                                } else {
                                    col = cond.right;
                                    operand = cond.left;
                                    operator = inverseOperator(cond.type);
                                }
                                // print booleans in uppercase
                                if (operand === true) operand = "TRUE";
                                if (operand === false) operand = "FALSE";
                                let tgt = findTarget(col.table, col.column);
                                if (tgt !== null) {
                                    tgt.column.conditions.push({ cond, display: operator + " " + operand });
                                    cond.coords = tgt.coords; // transfer coords function to AST
                                }
                            }
                            break;
                    }
                }
                processCond(query.where || {});
                for (let i = 0; i < query.from.length; i++) {
                    if ("inner" in query.from[i]) processCond(query.from[i].inner, 'inner', 'inner');
                    if ("louter" in query.from[i]) processCond(query.from[i].louter, 'outer', 'inner');
                    if ("router" in query.from[i]) processCond(query.from[i].router, 'inner', 'outer');
                    if ("fouter" in query.from[i]) processCond(query.from[i].fouter, 'outer', 'outer');
                }
                processCond(query.having || {});

                if (config.drawJunctions) {
                    r.junctionGroups = getGroupsColors(query);
                    if (r.junctionGroups.length > 1 || (r.junctionGroups.length == 1 && r.junctionGroups[0].type == 'OR')) {
                        junctionGroups.push(r.junctionGroups);
                    }
                }

                r.prepare = (ctx) => {
                    if ("lineHeight" in r.measures) return;
                    // start by preparing inner content
                    for (let i = 0; i < r.model.length; i++) {
                        if ("prepare" in r.model[i]) {
                            r.model[i].prepare(ctx, i * 100);
                        }
                    }
                    // compute drawer informations
                    let m = ctx.measureText("SELECT" + (r.query.distinct ? " DISTINCT" : ""));
                    let max = m.width;
                    r.measures.lineHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
                    r.measures.select = {};
                    r.measures.columns = {};
                    for (let i = 0; i < query.select.length; i++) {
                        let t = selectToString(query.select[i]);
                        let cond = [];
                        if (r.columns) {
                            let col = r.columns[query.select[i].alias];
                            if (col) cond = col.conditions
                        };
                        let f = ctx.measureText(t + cond.join("; "));
                        if (f.width + 25 > max) max = f.width + 25;
                        let m = {
                            x: [15, f.width + 25],
                            y: r.measures.lineHeight * LINESPACING + 15 + (i * r.measures.lineHeight * LINESPACING) + r.measures.lineHeight / 2
                        };
                        r.measures.select[selectToString(query.select[i], false)] = m;
                        let colname;
                        if (isObject(query.select[i])) {
                            colname = query.select[i].alias || query.select[i].column;
                        } else {
                            colname = query.select[i];
                        }
                        r.measures.columns[colname] = {
                            x: [m.x[0] - 10, m.x[1] - 10],
                            y: m.y + (r.paddingTop || 0) + r.measures.lineHeight
                        };
                    }
                    r.measures.drawerWidth = max;
                    r.minheight = r.measures.lineHeight * LINESPACING + 15 + (query.select.length * r.measures.lineHeight * LINESPACING) + r.measures.lineHeight / 2;
                    if (r.hint) {
                        r.paddingTop = r.measures.lineHeight + 3;
                    }
                    if (!parent) {
                        r.style = style.query;
                        r.lineWidth = r.style.lineWidth;
                    } else {
                        switch (r.hint) {
                            case 'FOR ALL':
                                r.style = style.forAll;
                                r.lineWidth = 0;
                                break;
                            case 'NOT EXISTS':
                                r.style = style.notExists;
                                r.lineWidth = 0;
                                break;
                            case 'EXISTS':
                                r.style = style.exists;
                                r.lineWidth = 0;
                                break;
                            default:
                                r.style = style.subSelect;
                                r.lineWidth = (r.hint ? 0 : r.style.lineWidth);
                                break;
                        }
                    }
                    r.lineDash = r.style.lineDash;
                    r.strokeStyle = r.style.lineColor;
                    r.fillStyle = r.style.backgroundColor;
                    if (r.autoOpen) {
                        delete r.autoOpen;
                        r.drawer = "open";
                    }
                    if (r.drawer == "stuckopen" || r.drawer == 'open') {
                        let px = r.measures.drawerWidth + 10;
                        //                        r.x = r.x - px;
                        r.paddingLeft = px;
                        r.width = r.width + px;
                    }
                }
                r.draw = function (layers, model) {
                    switch (this.drawer) {
                        case 'closed':
                            this.super.draw(layers, model);
                            if (!("lineHeight" in r.measures)) {
                                layers[0].push(r.prepare);
                            }
                            /*                            if (this.autoOpen === true) {
                                                            delete this.autoOpen;
                                                            setTimeout(() => { this.toggle({ physCanvas: this.super.physCanvas }); }, 100);
                                                        }*/
                            break;
                        case 'stuckopen':
                        case 'open':
                            this.super.draw(layers, model);
                            layers[4].push((ctx) => {
                                r.prepare(ctx);
                                ctx.beginPath();
                                let w = this.measures.drawerWidth;
                                ctx.setLineDash(this.lineDash);
                                ctx.lineWidth = this.lineWidth;
                                ctx.strokeStyle = this.style.lineColor;
                                ctx.moveTo(this.x + w + 10, (this.paddingTop || 0) + this.y);
                                ctx.lineTo(this.x + w + 10, this.y + this.height);
                                ctx.moveTo(this.x, (this.paddingTop || 0) + this.y + this.measures.lineHeight + 10);
                                ctx.lineTo(this.x + w + 10, (this.paddingTop || 0) + this.y + this.measures.lineHeight + 10);
                                ctx.stroke();
                                ctx.fillStyle = this.style.textColor;
                                ctx.fillText("SELECT" + (this.query.distinct ? " DISTINCT" : ""), this.x + 5, (this.paddingTop || 0) + this.y + this.measures.lineHeight + 5);
                                let columns = Object.keys(this.measures.columns);
                                let i = 0;
                                for (let k in this.measures.select) {
                                    let cond = [];
                                    if (this.columns && columns && i < columns.length) {
                                        let col = this.columns[columns[i]];
                                        if (col) cond = col.conditions
                                    };
                                    ctx.fillText(selectToString(k) + cond.join("; "), this.x + this.measures.select[k].x[0], (this.paddingTop || 0) + this.y + this.measures.select[k].y + this.measures.lineHeight / 2);
                                    i++;
                                }
                                if ("orderBy" in this.query) {
                                    function match(l, r) {
                                        if (isObject(l) && isObject(r)) {
                                            if ("display" in l) return l.display == r.display;
                                            if ("column" in l) return l.column = r.column;
                                            return l == r;
                                        } else if (!isObject(r)) {
                                            if ("display" in l) return l.display == r;
                                            return false;
                                        } else {
                                            return l == r;
                                        }
                                    }
                                    for (let i = 0; i < this.query.orderBy.length; i++) {
                                        // find a select that corresponds to the order
                                        let j = 0;
                                        for (let k in this.measures.select) {
                                            if (match(this.query.orderBy[i], this.query.select[j])) {
                                                ctx.fillText(this.query.orderBy[i].sort == "ASC" ? UTF8UpArrow : UTF8DownArrow, this.x + this.measures.select[k].x[0] - 10, (this.paddingTop || 0) + this.y + this.measures.select[k].y + this.measures.lineHeight / 2);
                                                ctx.save();
                                                ctx.font = "8px Arial";
                                                ctx.fillText(i + 1, this.x + this.measures.select[k].x[0] - 13, (this.paddingTop || 0) + this.y + this.measures.select[k].y + this.measures.lineHeight / 2 - 5);
                                                ctx.restore();
                                                break;
                                            }
                                            j++;
                                        }
                                    }
                                }
                            });
                            layers[9].push((ctx) => { // add lines for columns between select and tables
                                for (let i = 0; i < this.query.select.length; i++) {
                                    let t = this.query.select[i];
                                    if (t.table in this.tables) {
                                        let c = this.tables[t.table].measures.columns[t.column];
                                        if (c !== undefined) {
                                            if (c instanceof Array) c = c[0];
                                            // we have a target for this column
                                            let o = this.measures.select[t.display];
                                            if (o !== undefined) {
                                                ctx.beginPath();
                                                ctx.setLineDash(style.selectLine.lineDash);
                                                ctx.lineWidth = style.selectLine.lineWidth;
                                                ctx.strokeStyle = style.selectLine.lineColor;
                                                let cc = {
                                                    x1: this.x + o.x[1] - 8,
                                                    y1: (this.paddingTop || 0) + this.y + o.y,
                                                    x2: this.x + this.tables[t.table].x + c.x[0] + this.paddingLeft + 10,
                                                    y2: (this.paddingTop || 0) + this.y + this.tables[t.table].y + c.y + this.measures.lineHeight / 2 + 4,
                                                    dx1: 1,
                                                    dx2: -1
                                                }
                                                if (config.straightLines) {
                                                    ctx.moveTo(cc.x1, cc.y1);
                                                    ctx.lineTo(cc.x2, cc.y2);
                                                } else {
                                                    let coords = toBezier(cc, config.lineSmoothness);
                                                    ctx.moveTo(cc.x1, cc.y1);
                                                    ctx.bezierCurveTo(coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
                                                }
                                                ctx.stroke();
                                            }
                                        }
                                    }
                                }
                            });
                            break;
                        default: // animation step between closed and open
                            let px = (this.measures.drawerWidth + 10) * this.drawer / 100;
                            this.x = this.ox - px;
                            this.paddingLeft = px;
                            this.width = this.owidth + px;
                            this.super.draw(layers, model);
                            layers[4].push((ctx) => {
                                r.prepare(ctx);
                                ctx.beginPath();
                                ctx.setLineDash(this.style.lineDash);
                                ctx.lineWidth = this.style.lineWidth;
                                ctx.strokeStyle = this.style.lineColor;
                                ctx.moveTo(this.ox, (this.paddingTop || 0) + this.y);
                                ctx.lineTo(this.ox, this.y + this.height);
                                ctx.stroke();
                            });
                            break;
                    }
                    switch (this.hint) {
                        case 'FOR ALL':
                            layers[4].push((ctx) => {
                                ctx.beginPath();
                                ctx.fillStyle = r.style.textColor;
                                ctx.setLineDash(r.style.lineDash);
                                ctx.lineWidth = r.style.lineWidth;
                                ctx.strokeStyle = r.style.lineColor;
                                ctx.fillText(this.hint, this.x, this.y + this.measures.lineHeight);
                                ctx.rect(this.x + 1, this.y + this.paddingTop + 1, this.width - 2, this.height - this.paddingTop - 2);
                                ctx.rect(this.x - 1, this.y + this.paddingTop - 1, this.width + 2, this.height - this.paddingTop + 2);
                                ctx.stroke();
                            })
                            break;
                        default:
                            if (this.hint) {
                                layers[4].push((ctx) => {
                                    ctx.beginPath();
                                    ctx.fillStyle = r.style.textColor;
                                    ctx.setLineDash(r.style.lineDash);
                                    ctx.lineWidth = r.style.lineWidth;
                                    ctx.strokeStyle = r.style.lineColor;
                                    ctx.fillText(this.hint, this.x, this.y + this.measures.lineHeight);
                                    ctx.rect(this.x, this.y + this.paddingTop, this.width, this.height - this.paddingTop);
                                    ctx.stroke();
                                })
                            }
                            break;
                    }
                }
                r.toggle = function (event) {
                    switch (this.drawer) {
                        case "closed":
                            r.ox = r.x;
                            r.owidth = r.width;
                            r.drawer = 0;
                            event.physCanvas.animate({
                                length: 100, // length in ms
                                step(ms) { // show frame step corresponding to ms
                                    r.drawer = ms; // just update the time frame, its the draw function that does the actual drawing.
                                },
                                done() {
                                    r.drawer = 'open';
                                    event.physCanvas.checkBoundaries();
                                }
                            });
                            break;
                        case "open":
                            r.ox = r.x + r.measures.drawerWidth + 10;
                            r.owidth = r.width - r.measures.drawerWidth - 10;
                            r.drawer = 100;
                            event.physCanvas.animate({
                                length: 100, // length in ms
                                step(ms) { // show frame step corresponding to ms
                                    r.drawer = 100 - ms; // just update the time frame, its the draw function that does the actual drawing.
                                },
                                done() {
                                    r.drawer = 'closed';
                                    event.physCanvas.checkBoundaries();
                                }
                            });
                            break;
                    }
                }
                return { rect: r, links };
            }


            function createUnion(r) {
                r.type = 'UNION';
                r.draw = function (layers, model) {
                    layers[0].push((ctx) => {
                        ctx.save();
                        ctx.beginPath();
                        this._bezier = dotsToBezier(getAround(this.what[0], this.what[1], PAD).dots, smooth_value);
                        drawBezier(ctx, this._bezier);
                        ctx.fillStyle = style.set.backgroundColor;
                        ctx.fill();
                        ctx.restore();
                    });
                    layers[5].push((ctx) => {
                        ctx.beginPath();
                        drawBezier(ctx, this._bezier);
                        ctx.strokeStyle = style.set.lineColor;
                        ctx.lineWidth = style.set.lineWidth;
                        ctx.setLineDash(style.set.lineDash);
                        ctx.stroke();
                        return;
                    });
                }
                return r;
            }

            function createIntersect(r) {
                r.type = "INTERSECT";
                r.draw = function (layers, model) {
                    layers[0].push((ctx) => {
                        let { dots, switchIndex } = getAround(this.what[0], this.what[1], PAD, true);
                        if (dots.length > 0 && switchIndex != -1) {
                            let r1x1 = dots[switchIndex * 2 - 2];
                            let r1y1 = dots[switchIndex * 2 - 1];
                            let r2x1 = dots[switchIndex * 2];
                            let r2y1 = dots[switchIndex * 2 + 1];
                            let r1x2 = dots[0];
                            let r1y2 = dots[1];
                            let r2x2 = dots[dots.length - 2];
                            let r2y2 = dots[dots.length - 1];
                            let r1 = dots.slice(0, switchIndex * 2);
                            let r2 = dots.slice(switchIndex * 2);
                            let sx1 = (r1x1 + r2x1) / 2;
                            let sx2 = (r1x2 + r2x2) / 2;
                            let sy1 = (r1y1 + r2y1) / 2;
                            let sy2 = (r1y2 + r2y2) / 2;
                            let a = Math.atan2(sy1 - sy2, sx1 - sx2) + Math.PI / 2;
                            let l=Math.min(Math.max(Math.abs(r1x1-r1x2),Math.abs(r1y1-r1y2))/6,30);
                            // a could point towards the inside of the set, or to the outside;
                            let l1 = distance({ x: dots[0], y: dots[1] }, { x: (sx1 + sx2) / 2 + l * Math.cos(a), y: (sy1 + sy2) / 2 + l * Math.sin(a) });
                            a += Math.PI;
                            let l2 = distance({ x: dots[0], y: dots[1] }, { x: (sx1 + sx2) / 2 + l * Math.cos(a), y: (sy1 + sy2) / 2 + l * Math.sin(a) });
                            // we measure both directions and take the fartest one
                            if (l1 > l2) a -= Math.PI;
                            r1.push((sx1 + sx2) / 2 + l * Math.cos(a), (sy1 + sy2) / 2 + l * Math.sin(a));
                            a += Math.PI;
                            r2.push((sx1 + sx2) / 2 + l * Math.cos(a), (sy1 + sy2) / 2 + l * Math.sin(a));
                            this._bezier = dotsToBezier(r1, smooth_value);
                            this._bezier2 = dotsToBezier(r2, smooth_value);
                            ctx.save();
                            ctx.beginPath();
                            drawBezier(ctx, this._bezier);
                            ctx.clip();
                            ctx.beginPath();
                            drawBezier(ctx, this._bezier2);
                            ctx.fillStyle = style.set.backgroundColor;
                            ctx.fill();
                            ctx.restore();
                        }
                    });
                    layers[5].push((ctx) => {
                        if (this._bezier) {
                            ctx.beginPath();
                            ctx.strokeStyle = style.set.lineColor;
                            ctx.lineWidth = style.set.lineWidth;
                            ctx.setLineDash(style.set.lineDash);
                            drawBezier(ctx, this._bezier);
                            drawBezier(ctx, this._bezier2);
                            ctx.stroke();
                        }
                        return;
                    });
                }
                return r;
            }

            function createExcept(r) {
                r.type = 'EXCEPT';
                r.draw = function (layers, model) {
                    layers[0].push((ctx) => {
                        ctx.save();
                        ctx.beginPath();
                        this._bezier = dotsToBezier(getAround(this.what[0], this.what[1], PAD).dots, smooth_value);
                        drawBezier(ctx, this._bezier);
                        ctx.fillStyle = style.set.backgroundColor;
                        ctx.fill();
                        ctx.beginPath();
                        const PAD2 = PAD / 4.0;
                        let r2 = this.what[1];
                        let subdots = [r2.x - PAD2, r2.y - PAD2, r2.x + r2.width + PAD2, r2.y - PAD2, r2.x + r2.width + PAD2, r2.y + r2.height + PAD2, r2.x - PAD2, r2.y + r2.height + PAD2];
                        this._bezier2 = dotsToBezier(subdots, smooth_value);
                        ctx.fillStyle = getComputedStyle(ctx.canvas).backgroundColor || style.query.backgroundColor;
                        drawBezier(ctx, this._bezier2);
                        ctx.fill();
                        ctx.restore();
                    });
                    layers[5].push((ctx) => {
                        ctx.beginPath();
                        ctx.strokeStyle = style.set.lineColor;
                        ctx.lineWidth = style.set.lineWidth;
                        ctx.setLineDash(style.set.lineDash);
                        drawBezier(ctx, this._bezier);
                        drawBezier(ctx, this._bezier2);
                        ctx.stroke();
                        return;
                    });
                }
                return r;
            }

            function processQuery(model, out, autoopen = false, parent) {
                let r;
                switch (model.type) {
                    case "SELECT":
                        let right = 0;
                        for (let i = 0; i < out.length; i++) {
                            let item = out[i];
                            if (item.type == "rect" && item.x + Math.min(item.width, 300) > right) {
                                right = item.x + Math.min(item.width, 300);
                            }
                        }
                        let { rect, links } = createSelectRect({ x: right + 50, y: 10, width: 100, height: 100 }, model, parent);
                        if (autoopen) rect.autoOpen = true;
                        out.push(rect);
                        out.push.apply(out, links);
                        break;
                    case "UNION":
                    case "UNION ALL":
                        r = createUnion({}); // leak below
                    case "INTERSECT":
                        if (r === undefined) r = createIntersect({}); // leak below
                    case "EXCEPT":
                        if (r === undefined) r = createExcept({});
                        let idx = out.length;
                        processQuery(model.left, out);
                        r.what = [out[idx]];
                        idx = out.length;
                        processQuery(model.right, out);
                        r.what.push(out[idx]);
                        out.push(r);
                        out.push({
                            type: "link",
                            fromborder: true,
                            toborder: true,
                            from: idx - 1,
                            to: idx,
                            draw() { }
                        });
                        break;
                    default:
                        throw new Error("Invalid node type " + model.type);
                }
            }

            model = removeNotExpressions(JSON.parse(JSON.stringify(model)));

            processQuery(model, out, true);

            if (junctionGroups.length > 0) {
                out.push({
                    type: 'junctions', draw(layers) {
                        layers[9].push((ctx) => {
                            for (let i = 0; i < junctionGroups.length; i++) {
                                drawGroups(ctx, junctionGroups[i], config.lineSmoothness);
                            }
                        });
                    }
                })
            }
            return out;
        }

        root.queryModelToPhysModel = queryModelToPhysModel;

        return root;
    }

    if (typeof window != "undefined") {
        instance(window);
    }

    if (typeof module != "undefined" && module.exports) {
        module.exports = instance(require('./sqltransformer.js'));
    }

})();