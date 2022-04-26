(function () {

    const PI = Math.PI;
    const PI2 = PI * 2;
    const BLACK = '#000000';
    const LIGHTGRAY = '#F0F0F0';
    const GRAY = '#C0C0C0';
    const WHITE = '#FFFFFF';
    const DARKBLUE = '#1B4A91';
    const GREEN = 'green';

    function getPos(event) {
        let rect = event.currentTarget.getBoundingClientRect()
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function isInside(c, px, py) {
        if ("x" in c) {
            let { x, y, width, height } = c;
            return px >= x && px <= (x + width) && py >= y && py <= (y + height);
        } else if ("x1" in c) {
            function sqr(x) { return x * x }
            function dist2(v, w) { return sqr(v.x - w.x) + sqr(v.y - w.y) }
            function distToSegmentSquared(p, v, w) {
                var l2 = dist2(v, w);
                if (l2 == 0) return dist2(p, v);
                var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                return dist2(p, {
                    x: v.x + t * (w.x - v.x),
                    y: v.y + t * (w.y - v.y)
                });
            }
            function distToSegment(p, v, w) { return Math.sqrt(distToSegmentSquared(p, v, w)); }
            return distToSegment({ x: px, y: py }, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }) < 3;
        }
    }

    function createDBViewer({ model, aliases: aliases, root, events, checkboxes, radios, colors, selectionModel, ondrawn, emptymessage = '' }) {

        selectionModel.clear();
        if (checkboxes === undefined) checkboxes = false;
        if (radios === undefined) radios = false;
        if (colors === undefined) colors = false;
        const checkradios = (checkboxes || radios);

        //    el.append($('<pre>').text(JSON.stringify(model,null,4)));
        if (events === undefined) events = {};
        let zoom = 1.00;
        let redrawing = true;
        let eventLock = false;
        let canvas = $('<canvas class="navdataflow" style="font:serif 20px" width="1400" height="1000">');
        canvas.css("zoom", (zoom * 100) + "%");
        root.append(canvas);
        const ctx = canvas[0].getContext("2d");
        ctx.font = "18px Arial";
        let textHeight;
        let iconWidth;
        let dragTarget = {};
        let dragSrc = {};
        let CHECKBOXSIZE;
        const CHECKPADX = 1;
        const CHECKPADY = 4;
        const TABLEPAD = 50;

        let hotspots = [];

        function getTarget(c) {
            for (let i = hotspots.length - 1; i >= 0; i--) {
                if (isInside(hotspots[i].coords, c.x, c.y)) {
                    return hotspots[i];
                }
            }
            return null;
        }

        let old = null;
        let moveobject = null;

        const NONE = {
            down(event, pos) {
                if (event.button == 0 && event.shiftKey == true) {
                    event.button = 2;
                    event.shiftKey = false;
                    event.which = 3; // shift+left click = right click
                }
                let tgt = getTarget(pos);
                if (tgt == null) {
                    selectionModel.clear(event);
                } else {
                    moveobject = tgt;
                    old = pos;
                    state = MAYBEMOVE;
                }
                redraw();
            }
        }

        const MAYBEMOVE = {
            drag(event, pos) {
                if (Math.abs(pos.x - old.x) > 2 || Math.abs(pos.y - old.y) > 2) {
                    if (radios) {
                        let tgt = getTarget(pos);
                        if (tgt != null && old.x > tgt.coords.x && old.x < tgt.coords.x + 12) {
                            state = DRAG;
                            state.drag(event, pos);
                            return;
                        }
                    }
                    state = MOVE;
                    state.drag(event, pos);
                }
            },
            up(event, pos) {
                if (event.button == 0 && event.shiftKey == true) {
                    event.button = 2;
                    event.shiftKey = false;
                    event.which = 3; // shift+left click = right click
                }
                let tgt = $.extend({}, getTarget(pos));
                delete tgt.coords;
                selectionModel.select(tgt, event, pos);
                redraw();
                state = NONE;
            },
            move(event, pos) {
                state = NONE;
            }
        }

        const MOVE = {
            drag(event, pos) {
                // adjust coord of selectedTable
                if (moveobject.alias === undefined) {
                    model[moveobject.table].coords___.x += pos.x - old.x;
                    model[moveobject.table].coords___.y += pos.y - old.y;
                } else {
                    aliases[moveobject.alias].coords___.x += pos.x - old.x;
                    aliases[moveobject.alias].coords___.y += pos.y - old.y;
                }
                old = pos;
                redraw();
            },
            up(event, pos) {
                state = NONE;
            }
        }

        const DRAG = {
            drag(event, pos) {
                let tgt = $.extend({}, getTarget(pos));
                dragTarget = tgt;
                dragSrc = moveobject;
                redraw();
                ctx.beginPath();
                let c = model[moveobject.table].coords___.columns[moveobject.column];
                renderDuck(c.x - 3, c.y + textHeight / 2, pos.x, pos.y, true);
                ctx.stroke();
            },
            up(event, pos) {
                let tgt = $.extend({}, getTarget(pos));
                delete tgt.coords;
                delete moveobject.coords;
                selectionModel.fk(moveobject, tgt, event, pos);
                moveobject = null;
                dragTarget = {};
                dragSrc = {};
                redraw();
                state = NONE;
            }
        }

        let state = NONE;

        canvas.on("mousemove", function (event) {
            if (eventLock) return;
            let pos = getPos(event);
            if ("mousemove" in events) { if (events.mousemove(event, pos) === false) return; };
            if (state == null) return;
            if (event.buttons == 0) { // no buttons down
                if ("move" in state) {
                    state.move(event, pos);
                }
            } else {
                if ("drag" in state) {
                    state.drag(event, pos);
                }
            }
        });

        canvas.on("mousedown", function (event) {
            if (eventLock) return;
            let pos = getPos(event);
            if ("mousedown" in events) { if (events.mousedown(event, pos) === false) return; };
            if (state == null) return;
            if ("down" in state) {
                state.down(event, pos);
            }
        });

        canvas.on("mouseup", function (event) {
            if (eventLock) return;
            let pos = getPos(event);
            if ("mouseup" in events) { if (events.mouseup(event, pos) === false) return; };
            if (state == null) return;
            if ("up" in state) {
                state.up(event, pos);
            }
        });

        function bbox(orig) {
            let bb = $.extend({}, orig);
            for (let k in model) {
                let c = model[k].coords___;
                if (c === undefined) continue;
                if (bb.x == undefined) {
                    bb = $.extend(bb, c);
                } else {
                    if (c.x < bb.x) bb.x = c.x;
                    if (c.y < bb.y) bb.y = c.y;
                    if (c.x + c.width > bb.x + bb.width) bb.width = (c.x + c.width) - bb.x;
                    if (c.y + c.height > bb.y + bb.height) bb.height = (c.y + c.height) - bb.y;
                }
            }
            for (let k in aliases) {
                let c = aliases[k].coords___;
                if (c === undefined) continue;
                if (bb.x == undefined) {
                    bb = $.extend(bb, c);
                } else {
                    if (c.x < bb.x) bb.x = c.x;
                    if (c.y < bb.y) bb.y = c.y;
                    if (c.x + c.width > bb.x + bb.width) bb.width = (c.x + c.width) - bb.x;
                    if (c.y + c.height > bb.y + bb.height) bb.height = (c.y + c.height) - bb.y;
                }
            }
            if (bb.x == undefined) {
                return { x: 0, y: 0, width: 0, height: 0 };
            }
            return bb;
        }

        function measureTable(table) {
            let w = Math.min(ctx.measureText(table).width, 150);
            let i = 2;
            for (let k2 in model[table]) {
                if (k2 == "coords___") continue;
                w = Math.max(w, ctx.measureText(k2 + " ").width + ctx.measureText(model[table][k2].type).width + (checkradios ? CHECKBOXSIZE : 0));
                i++;
            }
            return { width: w + 10 + iconWidth * 2, height: textHeight * i };
        }

        function measureAlias(alias) {
            let w = Math.min(ctx.measureText(aliases[alias].alias).width, 150);
            let m = $.extend({}, model[aliases[alias].table].coords___);
            m.width = Math.max(w + 10 + iconWidth * 2, m.width);
            return m;
        }

        function prepModel() {

            let counts = {};
            for (let table in model) {
                counts[table] = [];
            }
            function tryPush(tablein, tableout) {
                if (counts[tablein].indexOf(tableout) == -1) {
                    counts[tablein].push(tableout);
                }
                if (counts[tableout].indexOf(tablein) == -1) {
                    counts[tableout].push(tablein);
                }
            }
            let needsPosition = {};
            for (let table in model) {
                for (let column in model[table]) {
                    if ("fk" in model[table][column]) {
                        if (model[table][column].fk.table == undefined) debugger;
                        if (model[table][column].fk.table.indexOf(' ') != -1) continue;
                        tryPush(table, model[table][column].fk.table);
                    }
                }
                needsPosition[table] = !("coords___" in model[table]);
                if (!needsPosition[table]) {
                    let c = model[table].coords___;
                    let s;
                    if (!("width" in c)) {
                        s = measureTable(table);
                        c.width = s.width;
                    }
                    if (!("height" in c)) {
                        if (s === undefined) s = measureTable(table);
                        c.height = s.height;
                    }
                }
            }
            let mostConstraineds = Object.keys(counts);
            mostConstraineds.sort(function (a, b) {
                return counts[b].length - counts[a].length;
            });

            function recenter() {
                let shift = 0;
                for (let k in model) {
                    let c = model[k].coords___;
                    if (c === undefined) continue;
                    if (c.x < 0) shift = Math.max(shift, -c.x);
                }
                if (shift > 0) {
                    shift += 10;
                    for (let k in model) {
                        let c = model[k].coords___;
                        if (c === undefined) continue;
                        c.x += shift;
                    }
                }
                shift = 0;
                for (let k in model) {
                    let c = model[k].coords___;
                    if (c === undefined) continue;
                    if (c.y < 0) shift = Math.max(shift, -c.y);
                }
                if (shift > 0) {
                    shift += 10;
                    for (let k in model) {
                        let c = model[k].coords___;
                        if (c === undefined) continue;
                        c.y += shift;
                    }
                }
            }

            function hasOverlap(c1, c2) {
                if (c1.x + c1.width <= c2.x) return false;
                if (c2.x + c2.width <= c1.x) return false;
                if (c1.y + c1.height <= c2.y) return false;
                if (c2.y + c2.height <= c1.y) return false;
                return true;
            }

            function avoidOverlapX(coords, shiftRight) {
                function loop(attempt) {
                    if (attempt > 10) return;
                    for (let k in model) {
                        let c = model[k].coords___;
                        if (c === undefined) continue;
                        if (hasOverlap(coords, c)) {
                            if (shiftRight) {
                                coords.x = Math.max(coords.x + TABLEPAD * 2, c.x + c.width + TABLEPAD * 2);
                            } else {
                                coords.x = Math.min(coords.x - TABLEPAD * 2, c.x - coords.width - TABLEPAD * 2);
                            }
                            loop(attempt + 1);
                        }
                    }
                }
                loop(0);
            }

            function avoidOverlapY(coords, shiftDown) {
                function loop(attempt) {
                    if (attempt > 10) return;
                    for (let k in model) {
                        let c = model[k].coords___;
                        if (c === undefined) continue;
                        if (hasOverlap(coords, c)) {
                            if (shiftDown) {
                                coords.y = Math.max(coords.y + TABLEPAD, c.y + c.height + TABLEPAD);
                            } else {
                                coords.y = Math.min(coords.y - TABLEPAD, c.y - coords.height - TABLEPAD);
                            }
                            loop(attempt + 1);
                        }
                    }
                }
                loop(0);
            }

            function dist(c1, c2) {
                let d1x = c1.x + c1.width / 2;
                let d2x = c2.x + c2.width / 2;
                let d1y = c1.y + c1.height / 2;
                let d2y = c2.y + c2.height / 2;
                return Math.sqrt((d1x - d2x) * (d1x - d2x) + (d1y - d2y) * (d1y - d2y));
            }

            function avoidOverlap(coords) {
                let c1 = $.extend({}, coords);
                let c2 = $.extend({}, coords);
                let c3 = $.extend({}, coords);
                let c4 = $.extend({}, coords);
                avoidOverlapX(c1, true);
                avoidOverlapX(c2, false);
                avoidOverlapY(c3, true);
                avoidOverlapY(c4, false);
                let d1 = dist(c1, coords);
                let d2 = dist(c2, coords) + 10; // favors specific directions
                let d3 = dist(c3, coords);
                let d4 = dist(c4, coords) + 10;
                if (d1 < d2 && d1 < d3 && d1 < d4) return c1;
                if (d2 < d3 && d2 < d4) return c2;
                if (d3 < d4) return c3;
                return c4;
            }


            function tryPlace(table, side) {
                if (!needsPosition[table]) return true;
                let bb, c, target;
                switch (counts[table].length) {
                    case 0:
                        // put at bottom
                        bb = bbox();
                        c = measureTable(table);
                        c.x = TABLEPAD;
                        c.y = bb.y + bb.height + TABLEPAD;
                        model[table].coords___ = avoidOverlap(c);
                        needsPosition[table] = false;
                        break;
                    case 1:
                        // put to side of peer
                        target = counts[table][0];
                        if (needsPosition[target]) return;
                        c = measureTable(table);
                        if (side === true) {
                            c.x = model[target].coords___.x + model[target].coords___.width + TABLEPAD * 2;
                        } else {
                            c.x = model[target].coords___.x - TABLEPAD * 2 - c.width;
                        }
                        c.y = model[target].coords___.y + model[target].coords___.height / 2 - c.height / 2;
                        c = avoidOverlap(c);
                        model[table].coords___ = c;
                        needsPosition[table] = false;
                        break;
                    case 2:
                        // put below peer
                        let target1 = counts[table][0];
                        let target2 = counts[table][1];
                        if (needsPosition[target1] && needsPosition[target2]) return; // no reference target
                        c = measureTable(table);
                        if (!needsPosition[target1] && !needsPosition[target2]) { // place in between these two
                            c.x = (model[target1].coords___.x + model[target2].coords___.x) / 2;
                            c.y = (model[target1].coords___.y + model[target2].coords___.y) / 2;
                        } else { // use a reference table
                            let target = (needsPosition[target1] ? target2 : target1);
                            c.x = model[target].coords___.x + model[target].coords___.width / 2 - c.width / 2;
                            c.y = model[target].coords___.y;
                        }
                        model[table].coords___ = avoidOverlap(c);
                        needsPosition[table] = false;
                        break;
                    default:
                        // 3 or more
                        bb = bbox();
                        c = measureTable(table);
                        model[table].coords___ = { x: 10, y: bb.y + c.height + TABLEPAD, width: c.width, height: c.height };
                        needsPosition[table] = false;
                        break;
                }
                if (!needsPosition[table]) {
                    let right = true;
                    for (let i = 0; i < counts[table].length; i++) {
                        if (counts[counts[table][i]].length <= 2) {
                            tryPlace(counts[table][i], right);
                            right = !right;
                        }
                    }
                    for (let i = 0; i < counts[table].length; i++) {
                        if (counts[counts[table][i]].length > 2) {
                            tryPlace(counts[table][i], right);
                            right = !right;
                        }
                    }
                }
            }

            function forcePlace(table) {
                if (!needsPosition[table]) return true;
                let bb = bbox();
                let c = measureTable(table);
                c.x = TABLEPAD;
                c.y = bb.y + bb.height + TABLEPAD;
                model[table].coords___ = avoidOverlap(c);
                needsPosition[table] = false;
                for (let i = 0; i < counts[table].length; i++) {
                    if (counts[counts[table][i]].length <= 2) {
                        forcePlace(counts[table][i]);
                    }
                }
                for (let i = 0; i < counts[table].length; i++) {
                    if (counts[counts[table][i]].length > 2) {
                        forcePlace(counts[table][i]);
                    }
                }
                return true;
            }

            let grid = [];
            let sizeY = [];
            let sizeX = [];
            let mx = 0;

            function get(x, y) {
                if (grid[y] === undefined) return undefined;
                return grid[y][x];
            }

            function set(x, y, table) {
                if (grid[y] === undefined) grid[y] = [];
                let c = measureTable(table);
                grid[y][x] = { table: table, size: c };
                if (sizeY[y] == undefined) sizeY[y] = 0;
                sizeY[y] = Math.max(sizeY[y], c.height + TABLEPAD);
                if (sizeX[x] == undefined) sizeX[x] = 0;
                sizeX[x] = Math.max(sizeX[x], c.width + TABLEPAD);
            }

            function gridPlace(table, x, y) {
                if (!needsPosition[table]) return;
                set(x, y, table);
                if (x >= mx) mx = x + 1;
                needsPosition[table] = false;
                function findEmptyPlace(x, y, d) {
                    if (get(x, y + d) === undefined) return { x: x, y: y + d };
                    if (get(x + d, y) === undefined) return { x: x + d, y: y };
                    if (get(x - d, y) === undefined) return { x: x - d, y: y };
                    if (get(x, y - d) === undefined) return { x: x, y: y - d };
                    if (get(x + d, y + d) === undefined) return { x: x + d, y: y + d };
                    if (get(x - d, y + d) === undefined) return { x: x - d, y: y + d };
                    if (get(x + d, y - d) === undefined) return { x: x + d, y: y - d };
                    if (get(x - d, y - d) === undefined) return { x: x - d, y: y - d };
                    return findEmptyPlace(x, y, d + 1);
                }
                for (let i = 0; i < counts[table].length; i++) {
                    if (needsPosition[counts[table][i]] === false) continue;
                    // found a table that needs placement
                    let c = findEmptyPlace(x, y, 1);
                    gridPlace(counts[table][i], c.x, c.y);
                }
            }

            // forgets mostConstrained that are already placed
            for (let i = mostConstraineds.length - 1; i >= 0; i--) {
                if (needsPosition[mostConstraineds[i]] == false) mostConstraineds.splice(i, 1);
            }

            while (mostConstraineds.length > 0) {
                /*                // find source of longest path, and place it on top
                                let maxlen=0;
                                let candidate=null;
                                function maxlength(table) {
                                    let passed={};
                                    passed[table]=true;
                                    function loop(table,len) {
                                        let m=0;
                                        for(let i=0; i<counts[table].length; i++) {
                                            if (passed[counts[table][i]]) continue;
                                            passed[counts[table][i]]=true;
                                            let l=loop(counts[table][i],0)+1;
                                            passed[counts[table][i]]=false;
                                            if (l>m) m=l;
                                        }
                                        return m;
                                    }
                                    return loop(table,0);
                                }
                                for(let i=mostConstraineds.length-1; i>=0; i--) {
                                    let len=maxlength(mostConstraineds[i]);
                                    if (len>=maxlen) {
                                        maxlen=len;
                                        candidate=mostConstraineds[i];
                                    }
                                }
                
                                if (candidate!=null) gridPlace(candidate,0,0);*/

                gridPlace(mostConstraineds[0], mx, 0);
                // forgets mostConstrained that are already placed
                for (let i = mostConstraineds.length - 1; i >= 0; i--) {
                    if (needsPosition[mostConstraineds[i]] == false) mostConstraineds.splice(i, 1);
                }
            }

            function keys(o) {
                let ret = Object.keys(o);
                for (let i = 0; i < ret.length; i++) ret[i] = parseInt(ret[i]);
                ret.sort();
                return ret;
            }

            // turn grid into coordinates

            let bb = { x: 0, y: 0, d: Number.MAX_VALUE };
            for (let table in model) {
                if ("coords___" in model[table]) {
                    let px = model[table].coords___.x + model[table].coords___.width;
                    let py = model[table].coords___.y + model[table].coords___.height;
                    let ok = true;
                    for (let table2 in model) {
                        if ("coords___" in model[table2]) {
                            let dx = model[table2].coords___.x + model[table2].coords___.width;
                            let dy = model[table2].coords___.y + model[table2].coords___.height;
                            if (dx > px && dy > py) {
                                ok = false;
                                break;
                            }
                        }
                    }
                    if (ok) {
                        let pd = Math.sqrt(px * px + py * py);
                        if (pd < bb.d) {
                            bb.d = pd;
                            bb.x = px;
                            bb.y = py;
                        }
                    }
                }
            }
            let coordY = [];
            let coordX = [];

            let ky = keys(sizeY);
            let t = 0;
            for (let i = 0; i < ky.length; i++) {
                coordY[ky[i]] = t;
                t += sizeY[ky[i]];
            }

            let kx = keys(sizeX);
            t = 0;
            for (let i = 0; i < kx.length; i++) {
                coordX[kx[i]] = t;
                t += sizeX[kx[i]];
            }

            ky = keys(grid);
            for (let i = 0; i < ky.length; i++) {
                kx = keys(grid[ky[i]]);
                for (let j = 0; j < kx.length; j++) {
                    let item = grid[ky[i]][kx[j]];
                    let c = item.size;
                    c.x = coordX[kx[j]] + (sizeX[kx[j]] - c.width) / 2 + TABLEPAD + bb.x;
                    c.y = coordY[ky[i]] + (sizeY[ky[i]] - c.height) / 2 + TABLEPAD + bb.y;
                    model[item.table].coords___ = c;
                }
            }

            /*let most = counts[mostConstraineds[0]].length;
            if (most > 1) {
                function setSingleFirst() {
                    let target = null;
                    for (let table in model) {
                        if (counts[table].length == most) { // one of the top tables
                            for (let table2 in model) {
                                if (counts[table2].length == 1 && counts[table2][0] == table) {
                                    if (target == null) {
                                        // this table has a single out link to one of the most constrained tables
                                        target = table2;
                                    } else {
                                        // however, there are several tables with a single link to one of the most constrainted tables
                                        // we don't know which one would suit best, so we give up
                                        target = null;
                                        break;
                                    }
                                }
                            }
                            if (target != null) {
                                // we found a table with a single link to one of the most constrained tables => this is a good starting point
                                // to start placing the different tables
                                forcePlace(target);
                                return;
                            }
                        }
                    }
                }
                setSingleFirst();
            }*/

            /*                for (let i = 0; i < mostConstraineds.length; i++) {
                                tryPlace(mostConstraineds[i], true);
                            }*/

            /*for (let i = 0; i < mostConstraineds.length; i++) {
                forcePlace(mostConstraineds[i]);
            }*/


            for (let alias in aliases) {
                if (!("coords___" in aliases[alias])) {
                    let other = model[aliases[alias].table].coords___;
                    let c = measureAlias(alias);
                    c.x = other.x + TABLEPAD * 2;
                    c.y = other.y + TABLEPAD * 2;
                    aliases[alias].coords___ = c;
                }
            }
        }


        function renderTable(table, alias) {
            let c, title, sel;
            if (alias === undefined) {
                c = model[table].coords___;
                let s;
                if (!("width" in c)) {
                    s = measureTable(table);
                    c.width = s.width;
                }
                if (!("height" in c)) {
                    if (s === undefined) s = measureTable(table);
                    c.height = s.height;
                }
                title = table;
                hotspots.push({
                    coords: c,
                    table: table
                });
                sel = { table };
            } else {
                c = aliases[alias].coords___;
                title = table + " " + alias;
                hotspots.push({
                    coords: c,
                    table: table,
                    alias: alias
                });
                ctx.font = "italic " + ctx.font;
                sel = { alias, table };
            }
            ctx.fillStyle = WHITE;
            ctx.fillRect(c.x, c.y, c.width, c.height);
            let defcolor = colors ? selectionModel.color(sel) : BLACK;
            ctx.strokeStyle = selectionModel.isSelected(sel) ? DARKBLUE : defcolor;
            ctx.fillStyle = defcolor
            ctx.rect(c.x, c.y, c.width, c.height);
            ctx.moveTo(c.x, c.y + textHeight + 6);
            ctx.lineTo(c.x + c.width, c.y + textHeight + 6);
            if (checkboxes) {
                ctx.rect(c.x + 2 + CHECKPADX, c.y + 2 + CHECKPADY, CHECKBOXSIZE - 4, CHECKBOXSIZE - 4);
                if (selectionModel.isSelected(sel)) {
                    ctx.moveTo(c.x + CHECKPADX + 2, c.y + CHECKPADY + 2);
                    ctx.lineTo(c.x + CHECKPADX + CHECKBOXSIZE - 2, c.y + CHECKPADY + CHECKBOXSIZE - 2);
                    ctx.moveTo(c.x + CHECKPADX + 2, c.y + CHECKPADY + CHECKBOXSIZE - 2);
                    ctx.lineTo(c.x + CHECKPADX + CHECKBOXSIZE - 2, c.y + CHECKPADY + 2);
                    ctx.fillStyle = DARKBLUE;
                }
                ctx.fillText(title, c.x + 2 + CHECKBOXSIZE, c.y + textHeight + 2);
            } else {
                ctx.fillStyle = selectionModel.isSelected(sel) ? DARKBLUE : defcolor;
                ctx.fillText(title, c.x + 2, c.y + textHeight + 2);
            }
            if (!("columns" in c)) c.columns = {};

            let content = model[table];
            let i = 0;
            for (let k in content) {
                if (k == "coords___") continue;
                let selc = $.extend({}, sel, { column: k });
                let defcolor = colors ? selectionModel.color(selc) : BLACK;
                let tx, ty;
                if (checkboxes) {
                    let y = c.y + 6 + textHeight * i + textHeight;
                    ctx.rect(c.x + 2 + CHECKPADX, y + 2 + CHECKPADY, CHECKBOXSIZE - 4, CHECKBOXSIZE - 4);
                    if (selectionModel.isSelected(selc)) {
                        ctx.moveTo(c.x + CHECKPADX + 2, y + CHECKPADY + 2);
                        ctx.lineTo(c.x + CHECKPADX + CHECKBOXSIZE - 2, y + CHECKPADY + CHECKBOXSIZE - 2);
                        ctx.moveTo(c.x + CHECKPADX + 2, y + CHECKPADY + CHECKBOXSIZE - 2);
                        ctx.lineTo(c.x + CHECKPADX + CHECKBOXSIZE - 2, y + CHECKPADY + 2);
                        ctx.fillStyle = DARKBLUE;
                    } else {
                        ctx.fillStyle = defcolor;
                    }
                    tx = c.x + 2 + CHECKBOXSIZE;
                } else if (radios) {
                    let y = c.y + 6 + textHeight * i + textHeight;
                    ctx.moveTo(c.x + 2 + CHECKPADX + CHECKBOXSIZE - 4, y + 2 + CHECKPADY + CHECKBOXSIZE / 2 - 2);
                    ctx.arc(c.x + 2 + CHECKPADX + CHECKBOXSIZE / 2 - 2, y + 2 + CHECKPADY + CHECKBOXSIZE / 2 - 2, CHECKBOXSIZE / 2 - 2, 0, PI2);
                    if (selectionModel.isSelected($.extend({}, sel, { column: k }))) {
                        ctx.fillStyle = DARKBLUE;
                    } else {
                        ctx.fillStyle = defcolor;
                    }
                    if ((table == dragTarget.table && k == dragTarget.column) || ((table == dragSrc.table && k == dragSrc.column))) {
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.arc(c.x + 2 + CHECKPADX + CHECKBOXSIZE / 2 - 2, y + 2 + CHECKPADY + CHECKBOXSIZE / 2 - 2, CHECKBOXSIZE / 4 - 1, 0, PI2);
                        ctx.fillStyle = defcolor;
                        ctx.fill();
                        ctx.stroke();
                        ctx.beginPath();
                    }
                    tx = c.x + 2 + CHECKBOXSIZE;
                } else {
                    tx = c.x + 2;
                    ctx.fillStyle = selectionModel.isSelected(selc) ? DARKBLUE : defcolor;
                }
                ty = c.y + textHeight * 2 + 8 + textHeight * i;
                if (content[k].pk) {
                    ctx.fillText("\u{1F511}", tx, ty);
                    if (content[k].fk !== undefined) {
                        ctx.fillText("\u{26AF}", tx + iconWidth - 1, ty);
                    }
                } else if (content[k].unique) {
                    ctx.fillText("\u{2609}", tx, ty);
                } else if (content[k].fk !== undefined) {
                    ctx.fillText("\u{26AF}", tx, ty);
                }
                tx += iconWidth * 2;
                ctx.fillText(k, tx, ty);
                tx = c.x + c.width - ctx.measureText(content[k].type).width - 4;
                ctx.fillStyle = GRAY;
                ctx.fillText(content[k].type, tx, ty);
                i++;
                c.columns[k] = { x: c.x + 2, y: c.y + 8 + textHeight * i, width: c.width, height: textHeight };
                if (alias === undefined) {
                    hotspots.push({
                        coords: c.columns[k],
                        table: table,
                        column: k
                    });
                } else {
                    hotspots.push({
                        coords: c.columns[k],
                        table: table,
                        alias: alias,
                        column: k
                    });
                }
            }
        }

        function renderDuck(x1, y1, x2, y2, vertical) {
            const SIZE = 10;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            let d = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
            let tgtX = (x2 - x1) / d * SIZE + x1;
            let tgtY = (y2 - y1) / d * SIZE + y1;
            if (vertical) {
                ctx.moveTo(x1, y1 - 5);
                ctx.lineTo(tgtX, tgtY);
                ctx.lineTo(x1, y1 + 5);
            } else {
                ctx.moveTo(x1 - 5, y1);
                ctx.lineTo(tgtX, tgtY);
                ctx.lineTo(x1 + 5, y1);
            }
        }

        function renderFKTableAlias(src, column, fktgt, fkcolumn, hotspot, total, count) {
            if (src === undefined || fktgt === undefined) return;
            let coords = src.coords___.columns[column];
            let coords2 = fktgt.coords___.columns[fkcolumn];
            let tcoords = src.coords___;
            let tcoords2 = fktgt.coords___;
            if (coords2 === undefined) return;
            // must draw from coords to coords2
            // is coords on the right of coords2 ?
            let isSelected = selectionModel.isSelected(hotspot);
            let defcolor = colors ? selectionModel.color({ table: hotspot.table, column: hotspot.column, "fk": hotspot.fk }) : BLACK;
            ctx.strokeStyle = isSelected ? DARKBLUE : defcolor;

            if (src == fktgt) {
                let w = ctx.measureText(fkcolumn).width;
                let sx = tcoords.x + tcoords.width + w + 20;
                renderDuck(tcoords.x + tcoords.width, coords.y + coords.height / 2 + 2, sx, coords.y + coords.height / 2 + 2, true);
                ctx.moveTo(sx, coords.y + coords.height / 2 + 2);
                ctx.lineTo(sx, coords2.y + coords2.height / 2 + 2);
                ctx.lineTo(tcoords.x + tcoords.width, coords2.y + coords2.height / 2 + 2);
                ctx.stroke();
                ctx.save();
                ctx.beginPath();
                ctx.fillStyle = WHITE;
                sx -= w / 2;
                let sy = (coords.y + coords.height / 2 + coords2.y + coords2.height / 2) / 2 - textHeight / 2;
                ctx.fillRect(sx - 2, sy - 2, w + 4, textHeight + 4);
                ctx.fillStyle = isSelected ? DARKBLUE : defcolor;
                ctx.rect(sx - 2, sy - 2, w + 4, textHeight + 4);
                ctx.fillText(fkcolumn, sx, sy + textHeight - 2);
                ctx.stroke();
                ctx.restore();
                hotspots.push($.extend({ coords: { x: sx - 2, y: sy - 2, width: w + 4, height: textHeight + 4 } }, hotspot));
            } else {
                let c = (function () {
                    if (tcoords.x + tcoords.width < tcoords2.x) {
                        return {
                            x1: tcoords.x + tcoords.width,
                            y1: coords.y + coords.height / 2 + 2,
                            x2: tcoords2.x,
                            y2: coords2.y + coords2.height / 2 + 2,
                            v: true
                        }
                    }
                    // is coords on the left of coords2 ?
                    if (tcoords.x > tcoords2.x + tcoords2.width) {
                        return {
                            x1: tcoords.x,
                            y1: coords.y + coords.height / 2 + 2,
                            x2: tcoords2.x + tcoords2.width,
                            y2: coords2.y + coords2.height / 2 + 2,
                            v: true
                        }
                    }
                    // otherwise, just connect the tables

                    if (tcoords.y > tcoords2.y + tcoords2.height) {
                        return {
                            x1: tcoords.x + (count + 1) * tcoords.width / (total + 1),
                            y1: tcoords.y,
                            x2: tcoords2.x + (count + 1) * tcoords2.width / (total + 1),
                            y2: tcoords2.y + tcoords2.height,
                            v: false
                        }
                    } else if (tcoords.y + tcoords.height < tcoords2.y) {
                        return {
                            x1: tcoords.x + (count + 1) * tcoords.width / (total + 1),
                            y1: tcoords.y + tcoords.height,
                            x2: tcoords2.x + (count + 1) * tcoords2.width / (total + 1),
                            y2: tcoords2.y,
                            v: false
                        }
                    }
                    return null;
                })();

                if (c != null) {
                    renderDuck(c.x1, c.y1, c.x2, c.y2, c.v);
                    ctx.stroke();
                    let w = ctx.measureText(fkcolumn).width;
                    let x, y;
                    x = (c.x1 + c.x2) / 2 - w / 2;
                    y = (c.y1 + c.y2) / 2 - textHeight / 2;
                    ctx.save();
                    ctx.beginPath();
                    ctx.fillStyle = WHITE;
                    ctx.fillRect(x - 2, y - 2, w + 4, textHeight + 4);
                    ctx.fillStyle = isSelected ? DARKBLUE : defcolor;
                    ctx.rect(x - 2, y - 2, w + 4, textHeight + 4);
                    ctx.fillText(fkcolumn, x, y + textHeight - 2);
                    ctx.stroke();
                    ctx.restore();
                    hotspots.push($.extend({ coords: c }, hotspot));
                    hotspots.push($.extend({ coords: { x: x - 2, y: y - 2, width: w + 4, height: textHeight + 4 } }, hotspot));
                }
            }

        }

        function renderFK(table, column, fk, total, count) {
            renderFKTableAlias(model[table], column, model[fk.table], fk.column, { table: table, column: column, fk: fk }, total, count);
        }

        function redraw() {
            if (redrawing) return;
            redrawing = true;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas[0].width, canvas[0].height);
            hotspots.splice(0, hotspots.length);
            if (Object.keys(model).length == 0) {
                ctx.fillText(emptymessage, 10, 10 + textHeight);
                redrawing = false;
                return;
            }
            for (let table in model) {
                ctx.save();
                ctx.beginPath();
                renderTable(table);
                ctx.stroke();
                ctx.restore();
            }
            for (let table in model) {
                let totals;
                for (let column in model[table]) {
                    if ("fk" in model[table][column]) {
                        if (totals === undefined) {
                            totals = {};
                            for (let column in model[table]) {
                                if ("fk" in model[table][column]) {
                                    let fktable = model[table][column].fk.table;
                                    if (!(fktable in totals)) totals[fktable] = { total: 0, count: 0 };
                                    totals[fktable].total++;
                                }
                                if ("fk2" in model[table][column]) {
                                    let fktable = model[table][column].fk2.table;
                                    if (!(fktable in totals)) totals[fktable] = { total: 0, count: 0 };
                                    totals[fktable].total++;
                                }
                            }
                        }
                        ctx.save();
                        ctx.beginPath();
                        let fk = model[table][column]["fk"];
                        renderFK(table, column, fk, totals[fk.table].total, totals[fk.table].count);
                        if ("fk2" in model[table][column]) {
                            let fk = model[table][column]["fk2"];
                            renderFK(table, column, fk, totals[fk.table].total, totals[fk.table].count);
                        }
                        totals[fk.table].count++;
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            }
            for (let alias in aliases) {
                ctx.save();
                ctx.beginPath();
                renderTable(aliases[alias].table, alias);
                ctx.stroke();
                ctx.restore();
            }
            function toTarget(tgt) {
                if (tgt.alias in aliases) {
                    return aliases[tgt.alias];
                } else if (tgt.table in model) {
                    return model[tgt.table];
                }
            }

            for (let alias in aliases) {
                let total = aliases[alias].toFK.length + aliases[alias].fromFK.length;
                if (total > 0) {
                    let count = 0;
                    for (let i = 0; i < aliases[alias].toFK.length; i++) {
                        ctx.save();
                        ctx.beginPath();
                        let hotspot = {
                            table: aliases[alias].table,
                            alias: alias,
                            column: aliases[alias].toFK[i].column,
                            fk: {
                                table: aliases[alias].toFK[i].table,
                                column: aliases[alias].toFK[i].fkcolumn
                            }
                        };
                        if ("alias" in aliases[alias].toFK[i]) {
                            hotspot.fk.alias = aliases[alias].toFK[i].alias;
                        }
                        renderFKTableAlias(aliases[alias], aliases[alias].toFK[i].column, toTarget(aliases[alias].toFK[i]), aliases[alias].toFK[i].fkcolumn, hotspot, total, count);
                        count++;
                        ctx.stroke();
                        ctx.restore();
                    }
                    for (let i = 0; i < aliases[alias].fromFK.length; i++) {
                        if ("alias" in aliases[alias].fromFK[i]) {
                            continue; // will be drawn from the other alias table side
                        }
                        ctx.save();
                        ctx.beginPath();
                        let hotspot = {
                            table: aliases[alias].fromFK[i].table,
                            column: aliases[alias].fromFK[i].fkcolumn,
                            fk: {
                                table: aliases[alias].table,
                                alias: alias,
                                column: aliases[alias].fromFK[i].column
                            }
                        };

                        renderFKTableAlias(toTarget(aliases[alias].fromFK[i]), aliases[alias].fromFK[i].fkcolumn, aliases[alias], aliases[alias].fromFK[i].column, hotspot, total, count);
                        count++;
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            }
            redrawing = false;
        }

        let resizeFunction = function (callback) {
            if (canvas == null) {
                if (callback) callback();
                return;
            }
            let bb = bbox({ x: 0, y: 0, width: 0, height: 0 });
            canvas.attr("width", Math.max(bb.width + 100, canvas[0].parentElement.clientWidth / zoom));
            canvas.attr("height", Math.max(bb.height + 100, canvas[0].parentElement.clientHeight / zoom));
            ctx.width = canvas.width();
            ctx.height = canvas.height();
            ctx.font = "14px Arial";
            redraw();
            if (textHeight === undefined) {
                textHeight = ctx.measureText('M').width + 4;
                iconWidth = ctx.measureText("\u{26AF}").width;
                CHECKBOXSIZE = textHeight;
                prepModel();
                redrawing = false;
                setTimeout(() => { resizeFunction(callback); }, 100);
            } else {
                if (ondrawn !== undefined) {
                    let f = ondrawn;
                    ondrawn = undefined;
                    f();
                }
                if (callback) callback();
            }
        }

        $(window).on('resize', ()=>{resizeFunction();});

        resizeFunction();

        return {
            redraw: function () {
                eventLock = true; // when redraw is called, events are frozen as they may trigger information not yet refreshed
                try {
                    prepModel(); // from outside, the model might have changed and needs a refresh
                    resizeFunction(() => { eventLock = false; }); // redraws + recomputes scrollbars    
                } catch (e) {
                    eventLock=false;
                    throw e;
                }
            },
            textHeight,
            destroy() {
                $(window).off('resize', resizeFunction);
                root.empty();
            },
            resize: resizeFunction
        }
    }

    createDBViewer.NONE = function (model) {
        return {
            select(target, event) {
            },
            isSelected(target) {
                return false;
            },
            clear() {
            }
        }
    };

    function viewSchema(schema) {
        let diag = $('<div>').attr('title', "Schema Viewer");
        diag.dialog({
            dialogClass: "no-close",
            modal: true,
            minHeight: 360,
            height: 600,
            minWidth: 640,
            buttons: [{
                text: "Close",
                click: function () {
                    diag.dialog("close");
                    diag.remove();
                }
            }]
        });
        createDBViewer({ model: schema, root: diag, checkradios: false, selectionModel: createDBViewer.NONE(schema) });
    }

    window.dbviewer = {
        dbSchemaUI: createDBViewer,
        dbSchemaDialog: viewSchema
    };

})();
