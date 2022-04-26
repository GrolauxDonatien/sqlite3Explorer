(function () {
    let dbSchemaDialog = window.dbviewer.dbSchemaDialog;
    let dbSchemaUI = window.dbviewer.dbSchemaUI;

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

    const dbActionUI = (function () {
        function create(root, schema, externavailable, inmodel, onchange) {
            let available = [];
            let tableavailable = {};
            available.push(tableavailable);
            for (let i = 0; i < externavailable.length; i++) available.push(externavailable[i]);
            let model = $.extend(true, {}, inmodel); // deep copy as model will be changed on the fly
            let but = $('<button>');
            root.empty();
            root.append(but);
            let unregister = [];
            function renderButton() {
                let txt, sep;
                switch (model.type) {
                    case "sqlinsert":
                        if (model.table == "") {
                            txt = "Define SQL insert...";
                        } else {
                            txt = "INSERT INTO " + model.table + "\nSET";
                            sep = " "
                            for (let k in model.insert) {
                                if (k == "") continue;
                                for (let i = 0; i < model.insert[k].length; i++) {
                                    txt += sep + k + "=" + model.insert[k][i];
                                    sep = ", ";
                                }
                            }
                        }
                        break;
                    case "sqlupsert":
                        if (model.table == "") {
                            txt = "Define SQL upsert...";
                        } else {
                            txt = "UPSERT " + model.table + "\nWHERE " + model.where + "\nWHEN FOUND UPDATE";
                            sep = " "
                            for (let k in model.update) {
                                if (k == "") continue;
                                for (let i = 0; i < model.update[k].length; i++) {
                                    txt += sep + k + "=" + model.update[k][i];
                                    sep = ", ";
                                }
                            }
                            txt += "\nWHEN MISSING INSERT"
                            sep = " "
                            for (let k in model.insert) {
                                if (k == "") continue;
                                for (let i = 0; i < model.insert[k].length; i++) {
                                    txt += sep + k + "=" + model.insert[k][i];
                                    sep = ", ";
                                }
                            }
                        }
                        break;
                    case "sqldelete":
                        if (model.table == "") {
                            txt = "Define SQL delete...";
                        } else {
                            txt = "DELETE FROM " + model.table + "\nWHERE " + model.where;
                        }
                        break;
                    case "sqlupdate":
                        if (model.table == "") {
                            txt = "Define SQL update...";
                        } else {
                            txt = "UPDATE " + model.table + "\nWHERE " + model.where + "\nSET";
                            sep = " "
                            for (let k in model.update) {
                                if (k == "") continue;
                                for (let i = 0; i < model.update[k].length; i++) {
                                    txt += sep + k + "=" + model.update[k][i];
                                    sep = ", ";
                                }
                            }
                        }
                        break;
                    case "sqltable":
                        if (model.table == "") {
                            txt = "Define SQL Sync table...";
                        } else {
                            txt = "SYNC TABLE " + model.table + " TO ARRAY " + model.array + "\nWHERE " + model.where + "\nSET";
                            sep = " "
                            for (let k in model.map) {
                                if (k == "") continue;
                                for (let i = 0; i < model.map[k].length; i++) {
                                    let v = model.map[k][i];
                                    if (v.startsWith(".")) {
                                        txt += sep + k + "=" + model.array + '[]' + v;
                                    } else {
                                        txt += sep + k + "=" + v;
                                    }
                                    sep = ", ";
                                }
                            }
                        }
                        break;
                }
                but.removeClass('dbaction-button');
                if (model.table != "") but.addClass('dbaction-button');
                but.text(txt);
            }
            function edit() {
                let diag = $('<div class="dbop-dialog">').attr('title', but.text());
                let view = $('<button style="float:right">').text('View Schema').click(() => { dbSchemaDialog(schema); });
                diag.append(view);
                diag.append("Target table: ");
                let select = $("<select>");
                diag.append(select);
                for (let k in schema) {
                    select.append($('<option>').text(k).val(k));
                }
                select.val(model.table);
                if ("where" in model) {
                    let whereParams = {};
                    let div = $('<div class="hline">');
                    div.append("Condition: WHERE ");
                    let input = $('<input style="width:80%">');
                    div.append(input);
                    let params = [whereParams];
                    params.push.apply(params, available);
                    $.formeditor.autocomplete(input, params);
                    diag.append(div);
                    input.val(model.where);
                    input.on('change', function () {
                        model.where = input.val();
                    });
                    select.on('change', () => {
                        for (let k in whereParams) delete whereParams[k];
                        model.table = select.val();
                        for (let column in schema[model.table]) {
                            if (column == "coords___") continue;
                            whereParams[model.table + "." + column] = schema[model.table][column].type;
                        }
                    })
                } else {
                    select.on('change', () => {
                        model.table = select.val();
                    })
                }

                let viewport = $('<div class="viewport">');

                function mapUI(type) {

                    let arrays = {};

                    if ("array" in model) {
                        for (let i = 0; i < available.length; i++) {
                            for (let k in available[i]) {
                                let split = k.split('[0]');
                                if (split.length >= 2) {
                                    if (!(split[0] in arrays)) arrays[split[0]] = [];
                                    arrays[split[0]].push(split[1]);
                                }
                            }
                        }
                        let div = $('<div class="hline">');
                        div.append("Array: ");
                        let select = $('<select>');
                        for (let a in arrays) {
                            let option = $('<option>');
                            option.attr('value', a);
                            option.text(a);
                            select.append(option);
                        }
                        div.append(select);
                        diag.append(div);
                        diag.append('<em>Items that start with . (a dot) are entries from the array; otherwise they are used as is.</em>');
                        select.val(model.array);
                        select.on('change', function () {
                            model.array = select.val();
                            if (model.array in arrays) {
                                src.splice(0, src.length);
                                for (let i = 0; i < arrays[model.array].length; i++) {
                                    src.push({ src: arrays[model.array][i], tgt: undefined, idx: 0 });
                                }
                                redrawAll();
                            }
                        });
                    }

                    diag.append(viewport);
                    let table = $('<table>');
                    let thead = $('<thead>');
                    let tr = $('<tr>');
                    tr.append($('<th>').text("Source for " + type));
                    tr.append($('<th style="width:300px">').text("Link"));
                    tr.append($('<th>').text("Target"));
                    thead.append(tr);
                    table.append(thead);
                    let tbody = $('<tbody>');
                    table.append(tbody);
                    let canvas = $('<canvas>');
                    let ctx = canvas[0].getContext("2d");
                    tr = $('<tr>');
                    tr.append($('<td>'));
                    tr.append($('<td rowspan="0">').append(canvas));
                    tr.append($('<td>'));
                    tbody.append(tr);
                    viewport.empty();
                    viewport.append(table);
                    let lineHeight;
                    let src = [];
                    let tgt = [];
                    let width;

                    function cleanModel() {
                        for (let k in model[type]) {
                            if (model[type][k].length == 0) {
                                delete model[type][k];
                            }
                        }
                    }

                    function redraw() {
                        width = canvas.width();
                        let height = tbody.find('tr').length * lineHeight;
                        canvas.height(height);
                        ctx.canvas.height = height;
                        ctx.canvas.width = width;
                        ctx.setTransform(1, 0, 0, 1, 0, 0);
                        ctx.clearRect(0, 0, canvas[0].width, canvas[0].height);
                        for (let i = 0; i < src.length; i++) {
                            ctx.beginPath();
                            ctx.arc(lineHeight / 2, lineHeight * i + lineHeight / 2, lineHeight / 2 - 4, 0, PI2, false);
                            if (drag !== null && drag.sidx == i) {
                                ctx.fillStyle = GREEN;
                                ctx.fill();
                                if (drag.src) {
                                    if ("tidx" in drag) {
                                        ctx.moveTo(lineHeight - 4, i * lineHeight + lineHeight / 2);
                                        ctx.lineTo(width - lineHeight + 4, drag.tidx * lineHeight + lineHeight / 2);
                                    } else {
                                        ctx.moveTo(lineHeight - 4, i * lineHeight + lineHeight / 2);
                                        ctx.lineTo(drag.tx, drag.ty);
                                    }
                                }
                            }
                            ctx.stroke();
                        }
                        let tableName = select.val();
                        for (let i = 0; i < tgt.length; i++) {
                            let info = schema[tableName][tgt[i]];
                            ctx.beginPath();
                            ctx.arc(width - lineHeight / 2, lineHeight * i + lineHeight / 2, lineHeight / 2 - 4, 0, PI2, false);
                            if (info.auto === true && !(drag !== null && drag.tidx == i)) {
                                ctx.fillStyle = LIGHTGRAY;
                                ctx.fill();
                            }
                            if (drag !== null && drag.tidx == i) {
                                ctx.fillStyle = GREEN;
                                ctx.fill();
                                if (!drag.src) {
                                    if ("sidx" in drag) {
                                        ctx.moveTo(lineHeight - 4, drag.sidx * lineHeight + lineHeight / 2);
                                        ctx.lineTo(width - lineHeight + 4, drag.tidx * lineHeight + lineHeight / 2);
                                    } else {
                                        ctx.moveTo(width - lineHeight + 4, drag.tidx * lineHeight + lineHeight / 2);
                                        ctx.lineTo(drag.tx, drag.ty);
                                    }
                                }
                            }
                            ctx.stroke();
                        }
                        for (let oy = 0; oy < src.length; oy++) {
                            let dy = src[oy].tgt;
                            if (dy !== undefined && oy != undefined) {
                                ctx.beginPath();
                                ctx.moveTo(lineHeight - 4, oy * lineHeight + lineHeight / 2);
                                ctx.lineTo(width - lineHeight + 4, dy * lineHeight + lineHeight / 2);
                                ctx.stroke();
                            }
                        }
                    }

                    function refresh() {
                        for (let i = 0; i < src.length; i++) {
                            src.tgt = undefined;
                            src.idx = 0;
                        }
                        src = [];
                        tgt = [];
                        let tableName = select.val();
                        let table = schema[tableName];
                        let ref = {};
                        for (let k in tableavailable) delete tableavailable[k];
                        for (let k in table) {
                            if (k == "" || k == "coords___") continue;
                            ref[tableName + "." + k] = tgt.length;
                            tgt.push(k);
                            tableavailable[tableName + "." + k] = "";
                        }
                        let present = {};
                        for (let k in model[type]) {
                            for (let i = 0; i < model[type][k].length; i++) {
                                present[model[type][k][i]] = true;
                                src.push({ src: model[type][k][i], tgt: ref[k], idx: i });
                            }
                        }
                        if (model.type != "sqltable") {
                            for (let i = 0; i < available.length; i++) {
                                for (let e in available[i]) {
                                    if (e.startsWith("data.") && present[e] !== true) src.push({ src: e, tgt: undefined, idx: 0 });
                                }
                            }
                        }
                        redrawAll();
                    }

                    function redrawAll() {
                        let rows = Math.max(tgt.length, src.length + 1);
                        let tableName = select.val();
                        let table = schema[tableName];
                        let children = tbody.children();
                        for (let i = 0; i < rows; i++) {
                            let child;
                            if (i < children.length) {
                                child = $(children[i]);
                                child.find('td:first-child').empty();
                                child.find('td:last-child').empty();
                            } else {
                                child = $('<tr><td></td><td></td></tr>');
                                tbody.append(child);
                            }
                            if (i <= src.length) {
                                let td = child.find('td:first-child');
                                let input = $('<input>');
                                if (i < src.length) input.val(src[i].src);
                                $.formeditor.autocomplete(input, available);
                                td.append(input);
                            }
                            if (i < tgt.length) {
                                let info = table[tgt[i]];
                                if (tgt[i] == "coords___") continue;
                                let el = child.find('td:last-child');
                                el.text(tgt[i]);
                                if (info.pk) {
                                    el.prepend($('<span class="schema-icon">').html("&#x26BF;"));
                                } else if (info.unique) {
                                    el.prepend($('<span class="schema-icon">').html("&#x2609;"));
                                } else if (info.fk) {
                                    el.prepend($('<span class="schema-icon">').html("&#x26AF;"));
                                } else {
                                    el.prepend($('<span class="schema-icon">'));
                                }
                                el.append("&nbsp;&nbsp;");
                                el.append($('<span class="type-info">').text(info.type));
                            }
                        }
                        if (children.length > rows) {
                            for (let i = children.length; i >= rows; i--) {
                                $(children[i]).remove();
                            }
                        }

                        let int = setInterval(function () {
                            lineHeight = tbody.children().eq(0).height() * 1.06;
                            if (lineHeight > 0) {
                                clearInterval(int);
                                redraw();
                            }
                        }, 100);
                    }

                    table.on('change', 'input', (event) => {
                        let input = $(event.currentTarget);
                        let idx = input.parent().parent().index();
                        if (idx < src.length) {
                            let i = 0;
                            loop: for (let k in model[type]) {
                                for (let j = 0; j < model[type][k].length; j++) {
                                    if (i == idx) {
                                        if (input.val().trim() == "") {
                                            // remove this one
                                            model[type][k].splice(j, 1);
                                            src.splice(idx, 1);
                                            cleanModel();
                                            redrawAll();
                                        } else {
                                            model[type][k][j] = input.val();
                                            src[idx].src = input.val();
                                        }
                                        break loop;
                                    }
                                    i++;
                                }
                            }
                        } else {
                            if (!("" in model[type])) model[type][""] = [];
                            model[type][""].push(input.val());
                            src.push({ src: input.val(), tgt: undefined, idx: model[type][""].length - 1 }); // add one source
                            redrawAll();
                        }
                    });

                    let drag = null;

                    canvas.on("mousemove", function (event) {
                        if (drag == null || event.buttons == 0) return;
                        let pos = getPos(event);
                        drag.tx = pos.x;
                        drag.ty = pos.y;
                        if (drag.src) {
                            if (pos.x >= width - lineHeight) {
                                let idx = Math.floor(pos.y / lineHeight);
                                if (idx >= 0 && idx < tgt.length) {
                                    drag.tidx = idx;
                                }
                            } else {
                                delete drag.tidx;
                            }
                        } else {
                            if (pos.x < lineHeight) {
                                let idx = Math.floor(pos.y / lineHeight);
                                if (idx >= 0 && idx < src.length) {
                                    drag.sidx = idx;
                                }
                            } else {
                                delete drag.sidx;
                            }
                        }
                        redraw();
                    });

                    canvas.on("mousedown", function (event) {
                        let pos = getPos(event);
                        if (pos.x < lineHeight) {
                            let idx = Math.floor(pos.y / lineHeight);
                            if (idx >= 0 && idx < src.length) {
                                drag = {
                                    sx: pos.x,
                                    sy: pos.y,
                                    sidx: idx,
                                    tx: pos.x,
                                    ty: pos.y,
                                    src: true
                                }
                            }
                            redraw();
                        } else if (pos.x > width - lineHeight) {
                            let idx = Math.floor(pos.y / lineHeight);
                            if (idx >= 0 && idx < tgt.length) {
                                drag = {
                                    sx: pos.x,
                                    sy: pos.y,
                                    tidx: idx,
                                    tx: pos.x,
                                    ty: pos.y,
                                    src: false
                                }
                            }
                            redraw();
                        }
                    });

                    function mouseup(event) {
                        if (drag == null) return;
                        if (("sidx" in drag) && !("tidx" in drag)) {
                            if (src[drag.sidx].tgt === undefined && ("" in model[type])) {
                                model[type][""].splice(src[drag.sidx].idx, 1);
                            } else if (model[type][select.val() + "." + tgt[src[drag.sidx].tgt]] != undefined) {
                                model[type][select.val() + "." + tgt[src[drag.sidx].tgt]].splice(src[drag.sidx].idx, 1);
                            }
                            if (!("" in model[type])) model[type][""]=[];
                            model[type][""].push(src[drag.sidx].src);
                            cleanModel();
                            src[drag.sidx].tgt = undefined;
                            src[drag.sidx].idx = model[type][""].length - 1;
                        } else if (("sidx" in drag) && ("tidx" in drag)) {
                            //remove this old one
                            if (src[drag.sidx].tgt === undefined && ("" in model[type])) {
                                model[type][""].splice(src[drag.sidx].idx, 1);
                            } else if (model[type][select.val() + "." + tgt[src[drag.sidx].tgt]] != undefined) {
                                model[type][select.val() + "." + tgt[src[drag.sidx].tgt]].splice(src[drag.sidx].idx, 1);
                            }
                            let col = select.val() + "." + tgt[drag.tidx];
                            if (!(col in model[type])) model[type][col] = [];
                            if (model[type][col].length > 0) { // clear old assignements to this target
                                for (let i = model[type][col].length - 1; i >= 0; i--) {
                                    let old = model[type][col][i];
                                    model[type][col].splice(i, 1);
                                    if (!("" in model[type])) model[type][""] = [];
                                    model[type][""].push(old);
                                    for (let j = 0; j < src.length; j++) {
                                        if (src[j].tgt == drag.tidx && src[j].idx == i) {
                                            src[j].tgt = undefined;
                                            src[j].idx = model[type][""].length - 1;
                                            break;
                                        }
                                    }
                                }
                            }
                            model[type][col].push(src[drag.sidx].src);
                            cleanModel();
                            src[drag.sidx].tgt = drag.tidx;
                            src[drag.sidx].idx = model[type][col].length - 1;
                        }
                        drag = null;
                        redrawAll();
                    }

                    $(document).on("mouseup", mouseup);
                    unregister.push(mouseup);
                    refresh();
                    select.on('change', function () {
                        for (let k in model[type]) delete model[type][k];
                        model[type][""] = [];
                        for (let i = 0; i < src.length; i++) {
                            model[type][""].push(src[i].src);
                        }
                        cleanModel();
                        refresh();
                    });

                }

                if ("update" in model) {
                    mapUI("update");
                }

                if ("insert" in model) {
                    mapUI("insert");
                }

                if ("map" in model) {
                    mapUI("map");
                }

                diag.dialog({
                    dialogClass: "no-close noselect",
                    modal: true,
                    minHeight: 360,
                    minWidth: 640,
                    width: 800,
                    buttons: [{
                        text: "Ok",
                        click: function () {
                            for (let i = 0; i < unregister.length; i++) {
                                $(document).off("mouseup", unregister[i]);
                            }
                            renderButton();
                            if (onchange) onchange(model);
                            diag.dialog("close");
                            diag.remove();
                        }
                    }, {
                        text: "Cancel",
                        click: function () {
                            for (let i = 0; i < unregister.length; i++) {
                                $(document).off("mouseup", unregister[i]);
                            }
                            diag.dialog("close");
                            diag.remove();
                        }
                    }]
                });
            }
            but.click(edit);
            renderButton();
        }
        return {
            create
        }
    })();

    window.dbaction = { dbActionUI };

})();
