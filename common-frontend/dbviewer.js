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
        return { x: event.canvasX, y: event.canvasY };
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

    function createDBViewer({ model, aliases: aliases, root, events, checkboxes, radios, colors, selectionModel, ontablemove }) {

        selectionModel.clear();
        if (checkboxes === undefined) checkboxes = false;
        if (radios === undefined) radios = false;
        if (colors === undefined) colors = false;
        const checkradios = (checkboxes || radios);

        //    el.append($('<pre>').text(JSON.stringify(model,null,4)));
        if (events === undefined) events = {};
        let zoom = 1.00;
        let canvas = $('<canvas class="navdataflow" style="font:serif 20px" width="1400" height="1000">');
        canvas.css("zoom", (zoom * 100) + "%");
        root.append(canvas);
        let phys = createPhysCanvas(canvas[0], { font: '14px Arial' });

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

        function rightclick(event, pos) {
            if (event.button == 0 && event.shiftKey == true) {
                let o={}; // makes event mutable
                for(let k in event) o[k]=event[k];
                event=o;
                event.button = 2;
                event.shiftKey = false;
                event.which = 3; // shift+left click = right click
            }
            let tgt = $.extend({}, getTarget(pos));
            delete tgt.coords;
            selectionModel.select(tgt, event, pos);
        }

        /*

        TODO : if (radios) then there is a need to manage the FK tracing between two tables
        part of the code is here
        but it also involves help from phys : 
            add dragstart event
            if trigger function returns false then phys cancels its own table dragging mechanism
            + with mousemove and mouseup, should be able to achieve it
        */

        drawingFK=null;

        phys.addEventListener("dragStart", function(event) {
            selectionModel.clear(null);
            let pos=getPos(event);
            if (radios) {
                let tgt=getTarget(pos);
                if (tgt != null && ("column" in tgt) && event.oX > tgt.coords.x && event.oX < tgt.coords.x + 12) {
                    drawingFK=tgt;
                    drawingFK.ctx=event.physCanvas.canvas.getContext("2d");
                    drawingFK.repaint=event.physCanvas.repaint;
                    return false;
                }
            }
        });

        phys.addEventListener("dragStop", function(event) {
            resizeCanvas();
        });

        phys.addEventListener("afterPaint", function() {
            if (drawingFK!=null) {
                drawingFK.ctx.beginPath();
                renderDuck(drawingFK.ctx, drawingFK.coords.x - 3, drawingFK.coords.y + textHeight / 2, drawingFK.toX, drawingFK.toY, true);
                drawingFK.ctx.stroke();
            }
        });

        phys.addEventListener("mousemove", function(event) {
            if (drawingFK!=null) {
                drawingFK.toX=event.canvasX;
                drawingFK.toY=event.canvasY;
                drawingFK.repaint();
            }
        });

        phys.addEventListener("click", function (event) {
            let pos = getPos(event);
            rightclick(event, pos);
        });

        function captureClick(e) {
            e.stopPropagation(); // Stop the click from being propagated.
            window.removeEventListener('click', captureClick, true); // cleanup
        }

        phys.addEventListener("mouseup", function (event) {
            let pos = getPos(event);
            let tgt = getTarget(pos);
            if (drawingFK!=null) {
                if (tgt!=null) {
                    delete tgt.coords;
                    selectionModel.fk({table:drawingFK.table, column:drawingFK.column},tgt,event,pos);    
                    drawingFK=null;
                } else {
                    drawingFK=null;
                    phys.repaint();
                }
                window.addEventListener('click', captureClick, true);
        } else {
                if (tgt == null) {
                    selectionModel.clear(event);
                } else if (event.which != 1) {
                    rightclick(event, pos);
                }    
            }
        });

        phys.addEventListener('beforePaint', function (event) {
            hotspots = [];
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
            m.columns = $.extend({}, m.columns); // reset columns reference, otherwise messes up coords for original table
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


        function renderTable(ctx, table, alias) {
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

        function renderDuck(ctx, x1, y1, x2, y2, vertical) {
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

        function renderFKTableAlias(ctx, src, column, fktgt, fkcolumn, hotspot, total, count) {
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
                renderDuck(ctx,tcoords.x + tcoords.width, coords.y + coords.height / 2 + 2, sx, coords.y + coords.height / 2 + 2, true);
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
                    renderDuck(ctx, c.x1, c.y1, c.x2, c.y2, c.v);
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

        function renderFK(ctx, table, column, fk, total, count) {
            renderFKTableAlias(ctx, model[table], column, model[fk.table], fk.column, { table: table, column: column, fk: fk }, total, count);
        }

        function resizeCanvas() {
            let bb = bbox({ x: 0, y: 0, width: 0, height: 0 });
            canvas.attr("width", Math.max(bb.width + 100, canvas[0].parentElement.clientWidth / zoom));
            canvas.attr("height", Math.max(bb.height + 100, canvas[0].parentElement.clientHeight / zoom));
            ctx.width = canvas.width();
            ctx.height = canvas.height();
            ctx.font = "14px Arial";
            phys.repaint();
        }

        // wait to get a correct measurement on the canvas before adding elements to phys

        function runIt() {
            ctx.width = canvas.width();
            ctx.height = canvas.height();
            ctx.font = "14px Arial";
            textHeight = ctx.measureText('M').width + 4;
            if (textHeight > 4) {
                iconWidth = ctx.measureText("\u{26AF}").width;
                CHECKBOXSIZE = textHeight;
                setupPhysModel();
                $(window).on('resize', resizeCanvas);
                resizeCanvas();
            } else {
                // too early to get the size of text on the canvas, leave a bit of time to the browser to set ip up correctly
                setTimeout(runIt, 100);
            }
        }

        runIt();

        function setupPhysModel() {
            let indexes = {};
            phys.freezeUntilRepaint();
            function hash(r) {
                if (r.type == "link") {
                    return (r.fk.from.alias?r.fk.from.alias:r.fk.from.table) + "!" + r.fk.from.column + "!" + (r.fk.to.alias?r.fk.to.alias:r.fk.to.table) + "!" + r.fk.to.column;
                } else {
                    return r.from.table + "!" + r.from.column + "!" + r.to.table + "!" + r.to.column;
                }
            }
            function tablehash(r) {
                function link(a, b) {
                    if (a < b) {
                        return a + "!" + b;
                    } else {
                        return b + "!" + a;
                    }
                }
                if (r.type == "link") {
                    return link(r.fk.from.table, r.fk.to.table);
                } else {
                    return link(r.from.table, r.to.table);
                }
            }
            prepModel();
            // sync model with phys.model
            let fks = [];
            let links = {};
            let counts = {};
            for (let i = phys.model.length - 1; i >= 0; i--) { // save current links, removing them from the model
                if (phys.model[i].type == "link") {
                    let link = phys.model.splice(i, 1)[0];
                    links[hash(link)] = link;
                }
            }
            for (let i = phys.model.length - 1; i >= 0; i--) { // remove old elements
                if (phys.model[i].type == "rect" && !("table" in phys.model[i])) continue;
                if (!(phys.model[i].table in model)) {
                    phys.model.splice(i, 1);
                }
            }
            for (let k in model) {
                let table;
                for (let i = 0; i < phys.model.length; i++) {
                    if (phys.model[i].table == k) {
                        table = phys.model[i];
                        indexes[k] = i;
                        break;
                    }
                }
                if (table === undefined) {
                    table = {
                        type: "rect",
                        table: k,
                        draw: function (layers, physmodel) {
                            this.super.draw(layers, physmodel);
                            let ox=model[this.table]["coords___"].x;
                            let oy=model[this.table]["coords___"].y;
                            let tx=this.x;
                            let ty=this.y;

                            if (ontablemove!==undefined && !(ox==tx && oy==ty)) {
                                ontablemove({
                                    table:this.table, ox,oy,tx,ty
                                })
                            }
                            model[this.table]["coords___"].x= tx;
                            model[this.table]["coords___"].y = ty;
                            layers[4].push((ctx) => {
                                ctx.beginPath();
                                renderTable(ctx, this.table);
                                ctx.stroke();
                            });
                        }
                    };
                    indexes[k] = phys.model.length;
                    phys.model.push(table);
                }
                table.x = model[k]["coords___"].x;
                table.y = model[k]["coords___"].y;
                table.width = model[k]["coords___"].width;
                table.height = model[k]["coords___"].height;
                for (let c in model[k]) {
                    if (c == 'coords___') continue;
                    let col = model[k][c];
                    if ('fk' in col) {
                        fks.push({
                            from: { table: k, column: c },
                            to: col.fk
                        })
                        if ('fk2' in col) { // fk2 is used by the merge tool and reflects the alternate fk for this table.column
                            fks.push({
                                from: { table: k, column: c },
                                to: col.fk2
                            })
                        }
                    }
                }
            }


            // now onto aliases
            for (let k in aliases) {
                let alias;
                for (let i = 0; i < phys.model.length; i++) {
                    if (phys.model[i].alias === k) {
                        alias = phys.model[i];
                        indexes[k]=i;
                        break;
                    }
                }
                if (alias === undefined) {
                    alias = {
                        type: "rect",
                        alias: k,
                        draw: function (layers, physmodel) {
                            selectionModel.clear(null);
                            this.super.draw(layers, physmodel);
                            aliases[this.alias]["coords___"].x = this.x;
                            aliases[this.alias]["coords___"].y = this.y;
                            layers[4].push((ctx) => {
                                ctx.beginPath();
                                renderTable(ctx, aliases[this.alias].table, this.alias)
                                ctx.stroke();
                            });
                        }
                    };
                    indexes[k]=phys.model.length;
                    phys.model.push(alias);
                }
                alias.x = aliases[k]["coords___"].x;
                alias.y = aliases[k]["coords___"].y;
                alias.width = aliases[k]["coords___"].width;
                alias.height = aliases[k]["coords___"].height;
            }
            for (let i = phys.model.length - 1; i >= 0; i--) { // remove old elements
                if (phys.model[i].type == "rect" && !("alias" in phys.model[i])) continue;
                if (!(phys.model[i].alias in aliases)) {
                    phys.model.splice(i, 1);
                }
            }
            // links are always placed after tables so that the table has a chance to compute coords for its columns
            for (let i = 0; i < fks.length; i++) {
                let h = hash(fks[i]);
                let link;
                if (h in links) {
                    // get back existing link in phys.model, removing it so that it is placed back at the end
                    link = links[h];
                    delete links[h];
                } else {
                    link = {
                        type: 'link',
                        fromborder: true,
                        toborder: true
                    }
                }
                phys.model.push(link);
                link.from = indexes[fks[i].from.table];
                link.to = indexes[fks[i].to.table];
                link.fk = fks[i];
                let th = tablehash(link);
                link.count = counts[th] || 0;
                counts[th] = link.count + 1;
                if (counts[th]>3) debugger;
                link.draw = function (layers, physmodel) {
                    layers[5].push((ctx) => {
                        renderFK(ctx, fks[i].from.table, fks[i].from.column,
                            fks[i].to, counts[th], link.count);
                    });
                }
            }

            // links for aliases
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
                        let fk = {
                            from: {
                                table: aliases[alias].table,
                                alias: alias,
                                column: aliases[alias].toFK[i].column
                            },
                            to: {
                                table: aliases[alias].toFK[i].table,
                                column: aliases[alias].toFK[i].fkcolumn
                            }
                        }
                        if ("alias" in aliases[alias].toFK[i]) {
                            fk.to.alias=aliases[alias].toFK[i].alias;
                        }
                        let h=hash({type:"link",fk});
                        let link;
                        if (h in links) {
                            link=links[h]; // reuse existing link
                        } else {
                            link={
                                type:'link',
                                fromborder:true,
                                toborder:true
                            }
                        }
                        phys.model.push(link);
                        link.from = indexes[fk.from.alias||fk.from.table];
                        link.to = indexes[fk.to.alias||fk.to.table];
                        link.fk=fk;
                        let icount=count;
                        link.draw=function(layers,physmodel) {
                            layers[5].push((ctx)=>{
                                ctx.save();
                                ctx.beginPath();
                                let hotspot = {
                                    table: fk.from.table,
                                    alias: fk.from.alias,
                                    column: fk.from.column,
                                    fk: fk.to
                                };
                                renderFKTableAlias(ctx,aliases[alias], fk.from.column, toTarget(aliases[alias].toFK[i]), aliases[alias].toFK[i].fkcolumn, hotspot, total, icount);
                                ctx.stroke();
                                ctx.restore();                
                            })
                        }
                        count++;
                    }
                    for (let i = 0; i < aliases[alias].fromFK.length; i++) {
                        if ("alias" in aliases[alias].fromFK[i]) {
                            continue; // will be drawn from the other alias table side
                        }
                        let fk = {
                            from: {
                                table: aliases[alias].fromFK[i].table,
                                column: aliases[alias].fromFK[i].fkcolumn
                            },
                            to: {
                                table: aliases[alias].table,
                                alias:alias,
                                column: aliases[alias].fromFK[i].column
                            }
                        }
                        if ("alias" in aliases[alias].fromFK[i]) {
                            fk.from.alias=aliases[alias].fromFK[i].alias;
                        }
                        let h=hash({type:"link",fk});
                        let link;
                        if (h in links) {
                            link=links[h]; // reuse existing link
                        } else {
                            link={
                                type:'link',
                                fromborder:true,
                                toborder:true
                            }
                        }
                        phys.model.push(link);
                        link.from = indexes[fk.from.alias||fk.from.table];
                        link.to = indexes[fk.to.alias||fk.to.table];
                        link.fk=fk.fk;
                        let icount=count;
                        link.draw=function(layers,physmodel) {
                            layers[5].push((ctx)=>{
                                ctx.save();
                                ctx.beginPath();
                                let hotspot = {
                                    table: fk.from.table,
                                    column: fk.from.column,
                                    fk: fk.to
                                };
                                if ("alias" in fk.from) hotspot.alias=fk.from.alias;
                                renderFKTableAlias(ctx,toTarget(aliases[alias].fromFK[i]), fk.from.column, aliases[alias], fk.to.column, hotspot, total, icount);
                                ctx.stroke();
                                ctx.restore();                
                            })
                        }
                        count++;
                    }
                }
            }
            phys.repaint();
            resizeCanvas();
        }

        return {
            redraw: function () {
                prepModel();
                setupPhysModel();
            },
            textHeight,
            destroy() {
                phys.model.splice(0, phys.model.length);
                $(window).off('resize', resizeCanvas);
                root.empty();
            },
            resize: resizeCanvas
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
