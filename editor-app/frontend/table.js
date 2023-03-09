window.tableEditor = function (header, viewport, data, dbadapter, singleTable = false) {

    let pks = {};
    let fieldNames = [];
    let tabledef = {};
    const ROWSIZE = 16;
    const WINDOWSIZE = 100;
    let cache = {
        rows: 0,
        tables: [],
        sizes: [],
        updates: {},
        deletes: {},
        inserts: []
    }
    let insertTable = $('<table class="insert">');

    function getCaretPosition(editableDiv) {
        let sel = window.getSelection();
        let range = sel.getRangeAt(0);
        if (range.commonAncestorContainer.parentNode == editableDiv) { // text in editableDiv
            let pad = 0;
            let children = editableDiv.childNodes;
            for (let i = 0; i < children.length; i++) {
                if (children[i] == range.endContainer) {
                    break;
                }
                if (children[i].nodeType == 3) {
                    pad += children[i].textContent.length;
                } else if (children[i].nodeName == "BR") {
                    pad += 1;
                } else if (children[i].nodeName == "DIV") {
                    pad += (i > 0 ? 1 : 0) + children[i].textContent.length;
                }
            }
            return pad + range.endOffset;
        } else if (range.commonAncestorContainer == editableDiv) { // br in editableDiv
            // weird browser behavior: caret is over a br
            // startoffset is the index of childNode the caret is over
            let pad = 0;
            let children = editableDiv.childNodes;
            for (let i = 0; i < range.startOffset; i++) {
                if (children[i].nodeType == 3) {
                    pad += children[i].textContent.length;
                } else if (children[i].nodeName == "BR") {
                    pad += 1;
                } else if (children[i].nodeName == "DIV") {
                    pad += (i > 0 ? 1 : 0) + children[i].textContent.length;
                }
            }
            return pad;
        } else if (range.commonAncestorContainer.parentNode != null && range.commonAncestorContainer.parentNode.parentNode == editableDiv) { // div in editableDiv
            let pad = 0;
            let children = editableDiv.childNodes;
            for (let i = 0; i < children.length; i++) {
                if (children[i] == range.commonAncestorContainer.parentNode) {
                    break;
                }
                if (children[i].nodeType == 3) {
                    pad += children[i].textContent.length;
                } else if (children[i].nodeName == "BR") {
                    pad += 1;
                } else if (children[i].nodeName == "DIV") {
                    pad += (i > 0 ? 1 : 0) + children[i].textContent.length;
                }
            }
            return pad + 1 + range.endOffset;
        }
        return 0;
    }

    function setCaret(editableDiv, position) {
        if (editableDiv == undefined) return;
        let range = document.createRange();
        let sel = window.getSelection();
        let children = editableDiv.childNodes;
        let set = false;
        for (let i = 0; i < children.length; i++) {
            if (children[i].nodeType == 3) {
                if (position > children[i].textContent.length) {
                    position -= children[i].textContent.length
                } else {
                    set = true;
                    range.setStart(children[i], Math.min(position, children[i].length));
                    break;
                }
            } else if (children[i].nodeName == "BR") {
                if (position == 0) {
                    set = true;
                    range.setStart(editableDiv, i);
                    break;
                }
                position--;
            } else if (children[i].nodeName == "DIV") {
                if (position == 0) {
                    set = true;
                    range.setStart(editableDiv, i);
                    break;
                }
                if (i > 0) position--;
                if (position > children[i].textContent.length) {
                    position -= children[i].textContent.length
                } else {
                    set = true;
                    range.setStart(children[i].childNodes[0], Math.min(position, children[i].childNodes[0].length));
                    break;
                }
            }
        }
        if (!set && position > 0) {
            // set at end
            setCaret(editableDiv, getText($(editableDiv)).length);
        } else {
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    function syncHeaderSize() {
        function getSizes(table) {
            let sizes = [];
            let isInsert = table.is('.insert');
            table.find('tr:first-child>td').each((i, e) => {
                let size = i == 0 ? 0 : $(e).width() - 4;
                if (i > 0 && isInsert && e.innerHTML != "") {
                    size += 4;
                }
                sizes.push(size);
            });
            if (!isInsert) {
                table.find('tr:first-child>td').each((i, e) => {
                    sizes[i] = Math.max(sizes[i], parseFloat(e.getAttribute("data-width")));
                });
            }
            return sizes;
        }
        let y = viewport.scrollTop();
        let rowIdx = Math.max(0, Math.floor(y / ROWSIZE) - WINDOWSIZE);
        let lastRowIdx = rowIdx + Math.floor(viewport.height() / ROWSIZE) + 1;
        let msizes = cache.sizes.slice(0, cache.sizes.length);
        while (rowIdx < cache.rows + WINDOWSIZE * 2 && rowIdx < lastRowIdx + WINDOWSIZE * 2) {
            let tableIdx = Math.floor(rowIdx / WINDOWSIZE);
            let table = $(`#${tableIdx}`);
            if (table.length == 1) {
                let sizes = getSizes(table);
                for (let i = 0; i < msizes.length; i++) {
                    if (sizes[i] > msizes[i]) {
                        msizes[i] = sizes[i];
                    }
                }
            }
            rowIdx += WINDOWSIZE;
        }
        rowIdx = Math.max(0, Math.floor(y / ROWSIZE) - WINDOWSIZE);
        let total = 0;
        for (let i = 0; i < msizes.length; i++) { total += msizes[i] + 10; }
        if (msizes[0] == 0) msizes[0] = 38;
        while (rowIdx < cache.rows + WINDOWSIZE * 2 && rowIdx < lastRowIdx + WINDOWSIZE * 2) {
            let tableIdx = Math.floor(rowIdx / WINDOWSIZE);
            let table = $(`#${tableIdx}`);
            if (table.length == 1) {
                for (let i = 0; i < msizes.length; i++) {
                    table.find('td').each((i, e) => {
                        e.setAttribute('style', `width:${msizes[i % msizes.length]}px`);
                    });
                }
                table.css('min-width', total + "px");
            }
            rowIdx += WINDOWSIZE;
        }
        for (let i = 0; i < msizes.length; i++) {
            let dataTd = header.find(`tr:first-child>th:nth(${i})`);
            dataTd.width(msizes[i]);
        }
        header.find('table').css('min-width', total + "px");
        for (let i = 0; i < msizes.length; i++) {
            let dataTd = insertTable.find(`tr>td:nth(${i})`);
            dataTd.width(msizes[i]);
        }
        for (let i = 0; i < cache.inserts.length; i++) {
            if ("___error123___" in cache.inserts[i]) {
                let tr = $('.insert>tbody>tr').eq(i);
                tr.find('.sqlerror').remove();
                tr.find('td:first-child').append($('<div class="sqlerror" onclick="this.parentElement.removeChild(this)">').text(cache.inserts[i]["___error123___"]));
            }
        }
        insertTable.css('min-width', total + "px");
    }

    function addRowToInsert() {
        let tbody = insertTable.find('tbody');
        let tr = $("<tr>");
        tbody.append(tr);
        for (let i = 0; i < fieldNames.length + 1; i++) {
            if (i == 0) {
                tr.append($(`<td><a class="save" title="Save All <CTRL+S>"><img src="data:image/png;base64,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"></a>&nbsp;<a class="cancel" title="Cancel edit <Escape>">&#x274C;</a>`));
            } else if (tabledef[fieldNames[i - 1]].auto !== true) {
                tr.append($('<td contenteditable="true" data-value="">'));
            } else {
                tr.append($('<td>'));
            }
        }
        data.height((cache.rows + insertTable.children().eq(0).children().length) * ROWSIZE + 1);
    }

    function drawHeader(fields, cb) {
        header.empty();
        let table = $('<table>');
        header.append(table);
        let thead = $('<thead>');
        table.append(thead);
        let tr = $('<tr>');
        thead.append(tr);
        fieldNames.splice(0, fieldNames.length);
        for (let i = 0; i < fields.length + 1; i++) {
            let th = $('<th>');
            if (i > 0) {
                th.text(fields[i - 1].name);
                fieldNames.push(fields[i - 1].name);
            }
            tr.append(th);
        }
        insertTable.empty();
        let tbody = $('<tbody>');
        insertTable.append(tbody);
        addRowToInsert();
        data.append(insertTable);
        setTimeout(() => {
            for (let i = 0; i < fields.length + 1; i++) {
                let headerTd = header.find(`>table>thead>tr:first-child>th:nth(${i})`);
                cache.sizes.push(headerTd.width());
            }
            syncHeaderSize();
            if (cb) cb();
        }, 10);
    }

    function setCacheRows(n) {
        cache.rows = n;
        data.height((cache.rows + insertTable.children().eq(0).children().length) * ROWSIZE + 1);
        let tableIdx = Math.floor(n / WINDOWSIZE) + 1;
        insertTable.css('position', 'absolute'); // keep at bottom
        insertTable.css('top', `${n * ROWSIZE}px`); // keep at bottom
        insertTable.attr('id', tableIdx);
    }

    function clearTables() {
        let keys = Object.keys(cache.tables);
        for (let i = 0; i < keys.length; i++) {
            $(`#${keys[i]}`).remove();
        }
        cache.tables.splice(0, cache.tables.length);
    }

    function error(msg) {
        setCacheRows(0);
        if (!((typeof msg == "string") || (msg instanceof String)) && "message" in msg) msg = msg.message;
        for (let k in cache.tables) delete cache.tables[k];
        cache.sizes.splice(0, cache.sizes.length);
        for (let k in cache.deletes) delete cache.deletes[k];
        for (let k in cache.updates) delete cache.updates[k];
        cache.inserts.splice(0, cache.inserts.length);
        data.empty();
        data.append($('<div class="error">').text(msg));
        //        data.append($('<div><button onclick="location.reload()">Retry</button></div>'));
    }

    let temp = $('<span>');
    function getText(el) {
        let ret = [];
        let last = false;
        el.contents().each((i, e) => {
            if (e.nodeType == 3) {
                last = false;
                ret.push(e.textContent);
            } else if (e.nodeName == "BR") {
                last = true;
                ret.push('\n');
            } else if (e.nodeName == "DIV") {
                last = false;
                ret.push('\n' + e.textContent);
            }
        });
        // weird browser behavior where an empty BR is trailing
        if (ret.length > 1 && last) {
            ret.splice(ret.length - 1, 1);
        }
        return ret.join("");
    }

    function assertDisplayed() {
        let y = viewport.scrollTop();
        header.css('left', '-' + viewport.scrollLeft() + 'px');
        let rowIdx = Math.floor(y / ROWSIZE);
        let lastRowIdx = rowIdx + Math.floor(viewport.height() / ROWSIZE) + 1;
        let newtable = false;
        if (cache.rows == 0) {
            dbadapter.window(fieldNames, Object.keys(pks), 0, 1,
                (response) => {
                    data.find('table.insert').attr('id', '1');
                    display(null, response.results);
                }, error);
            return;
        }
        while (rowIdx < lastRowIdx + WINDOWSIZE * 2) {
            let tableIdx = Math.floor(rowIdx / WINDOWSIZE);
            if (tableIdx * WINDOWSIZE >= cache.rows) {
                break;
            }
            if (cache.tables[tableIdx] == undefined) {
                // this table is missing, draw it now
                newtable = true;
                let table = $("<table>");
                table.attr('id', tableIdx);
                let top = 0;
                let prev = tableIdx - 1;
                while (prev > 0 && document.getElementById(prev) == null) prev--;
                if (prev >= 0) {
                    let e = document.getElementById(prev);
                    if (e == null) {
                        top = tableIdx * WINDOWSIZE * ROWSIZE;
                    } else {
                        top = e.offsetTop + e.offsetHeight - 1 + (tableIdx - prev - 1) * WINDOWSIZE * ROWSIZE;
                    }
                }
                table.css({ 'position': 'absolute', 'top': top + 'px' });
                let tbody = $('<tbody>');
                table.append(tbody);
                let row = [];
                for (let i = 0; i < fieldNames.length + 1; i++) {
                    if (i == 0) {
                        row.push(`<td><a class="save" title="Save All <CTRL+S>"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAACxMAAAsTAQCanBgAAAYeSURBVHhe7ZtdTFxFFMfPfvJVulatNKmtBa3oIhsFgohRqkZt1BhqIGBTKbHAi4mR+KLxiRdboonRxERNY1I/QyCWB0Oi0fBi1AdCAhpNhJZqShO0UZaVQPfrOmdn7t25c2f33oVd7hX2l8zemf+cM3Puyd6zs3TrAgBsPDhWaFdj22pudlUp+IYER2l8ArZkQ9IcpakJKMjitKvhSA0TULDFORyrediVp6AbMhyjFYsg6yBbsiFpjtKKRZAfcOwYbccXQRSwqWR16uzsdM/Pz58k3Qocy1AUxU0av2Y+uDIzMzNKrlnj47CsoYgNMXWqr6+v9ng8F5SSAKkeXqamcSWi4IpGIBAIMMWcZDIJkQjxqUiA16OQBAL8HfFCeXk5+Hw+iEajsLa2hok9Q5LwGnHhYzSNmZFRwxe1mTo1NDTUkIDnw898AvEbg0xFEzQF8F+ahMqvX4bJyUnwesUEpe3SKLC4eAW6u7vhs1d+gzsOrMF6zA2tL9XD8PAwtLa2wsTEBJw+M0xsXaAk4++0t7cPDg0NqYuZxkzIquVUBN1ut6DhEE3NkNkZNXFDFcVTApFHXgeXx/fi+Pj4+21tbVi7RHPL90GapmECNrgQDlE2Q2Yn9zUq6S2jNY9C5LE3AbwlfcvLy+caGxv5t5gkPmsafxBCrC2UGqHMI7ohqMnseE3mp6L3jR58ACJH3wbwlR9PJBIj5J1QQmRjfDlofAJMncjzj2MJaCJOWdOw6FmD+sb23wsrT7wLin/XsXA4fD4UCpXReQ1dzIyMmpoAq04UnNGggRkRNZmdQj6HZL4y0nbxfXfDypPvgVIaOErq0pfNzc2VbAqNrNyHpv0viqARBeJ7gxB+6gNIlt1wJBq99lUwGNyTmtBjem+OKYKvfngLHD99O5x84zBTEDEMJO2buP4wrDx9FpIV+1r8fv835HHYm5qgSGI2arYXwaqqKujv74cHH++D5ocGoOXhfujt7YW6ujoym90XSQQOQpgkIbH75nvI4zTJHgc0EgOSarYXQa/XAz09PTAwMKC1U6eel5wmM6+XrNwPq0eGsJ4E4/E4vgtwggcdpVpBiiD5vgBzc9jmhJa7trS0xFbV7yHui4elDMjuQ9OwY7kONDU1HSIZvpA+CuuD8F3+AXZPvMBG+SNZtgf+ee5bNkL0+yLev36BwPkTeAS/dWpqaoHJ0vsgTdNwoF8pixNJQHU6AXcymUcBz8oiuSTZGDEGm6umlFRCshSLPCK38179FQJf6BKARmjMY9BQ4FfL6qQl4BhJAPkY0iMPbKs071XyDkgn4BKb4EFHg2Z7Ecy3xmLECZ6MWkGKoC0aDuWgkTiraZiArAYcFk+CdmkUIUY04seITrP8CUCaoOFQDMJGTZSogsY8Bo2vAYglJzoSd0TRKVpKwAkeqVYsgrSf2YB2BXBGwxiELRoO5aCROKtp2LFcB0xPgn98BxU/vsVGvLtqs1nNBav3DULswP2pPo8jToJlsx/BTT+fha6uLqbkl5GREfjzrj5YC/UwRcUhJ8Gy2Y+heuFzGBsb0zT98sjGtY6ODlioflZIALXbESdB45/PjHa2F0EapF6jbF5TdH9BFez4KT1oJM5qGiYgqwGHpZMgDVKvyezyr1FsPgnKkNltRkMkdkYzVHABHoPG1wDEkhMdiTuKbghqMruNajKkdijgBI9UKxZB2s9sQLsCOKOhD6JYBItFUERmtxkNkdgZzVDBBXgMGgq8a1Yns5Ng6U+fwi7yXQB/2VEIYrEY/NsyCOv1J5iCYGgbPwnyCch684j2CxFDAmgQrvVl8F/+ngzFZfJHlHwRUkqvYyO6L6ImgDwCt01PT19MiWky3hu+qE1qQLsUs5/IpNl6Tf02KEkAGqExj6blvQjap1FsLoI2aqJEFTTmMWgo8K5ZnUKh0CGS4YuZfiZnJ65kHFzXwngQqpmdnf2dSKY3T8itCFr5oaSdJBKJ1dra2nOjo6P8v80hGe8NX9RmKWOkbSstpyJI2rbTiv9jhF1VCr4hwVEan4At2ZA0R2lqAgqyOO1qOFIrFkF25SnohgzHaMUiyDrIlmxImqO0HV4EAf4D+QyEbtlxtlMAAAAASUVORK5CYII="></a>&nbsp;<a class="cancel" title="Cancel edit <Escape>">&#x274C;</a>&nbsp;<a class="delete" title="Remove">&#x1F5D1;</a></td>`);
                    } else if (tabledef[fieldNames[i - 1]].auto === true) {
                        row.push('<td></td>');
                    } else {
                        row.push('<td contenteditable="true"></td>');
                    }
                }
                row = row.join('');
                for (let i = tableIdx * WINDOWSIZE; i < Math.min((tableIdx + 1) * WINDOWSIZE, cache.rows); i++) {
                    let tr = $('<tr>');
                    tr.html(row);
                    tbody.append(tr);
                }
                data.append(table);
                cache.tables[tableIdx] = {
                    table
                }
                dbadapter.window(fieldNames, Object.keys(pks), tableIdx * WINDOWSIZE, WINDOWSIZE,
                    (response) => {
                        let expected = Math.min(cache.rows - tableIdx * WINDOWSIZE, WINDOWSIZE);
                        if (expected != response.results.rows.length) {
                            // adjust number of rows if needed
                            let fields = [];
                            for (let column in tabledef) {
                                if (tabledef[column].pk === true) pks[column] = tabledef[column];
                                fields.push(tabledef[column]);
                            }
                            drawHeader(fields, () => {
                                dbadapter.count((response) => {
                                    setCacheRows(response);
                                    assertDisplayed(); // refresh everything
                                    syncHeaderSize();
                                }, (err) => {
                                    error(err);
                                });
                            });
                        } else {
                            display(table, response.results);
                        }
                    }, error);
            }
            rowIdx += WINDOWSIZE;
        }
        if (!newtable) {
            syncHeaderSize();
        }
    }

    dbadapter.schema((stabledef) => {
        tabledef = stabledef;
        pks = {};
        let fields = [];
        for (let column in tabledef) {
            if (tabledef[column].pk === true) pks[column] = tabledef[column];
            fields.push(tabledef[column]);
        }
        if (Object.keys(pks).length == 0) {
            data.empty();
            data.append('<div class="error">This table does not have a Primary Key. This is required before you can edit its content.</div>');
        } else {
            viewport.on('scroll', assertDisplayed);
            $(window).on('resize', assertDisplayed);
            drawHeader(fields, () => {
                dbadapter.count((response) => {
                    setCacheRows(response);
                    assertDisplayed();
                }, (err) => {
                    error(err);
                });
            });
        }
    }, (err) => {
        error(err);
    });

    function trToPK(tr) {
        let ret = {};
        for (let i = 0; i < fieldNames.length; i++) {
            if (fieldNames[i] in pks) {
                ret[fieldNames[i]] = JSON.parse(tr.children().eq(i + 1).attr('data-value'));
            }
        }
        return ret;
    }

    function trToKey(tr) {
        let ret = [];
        for (let i = 0; i < fieldNames.length; i++) {
            if (fieldNames[i] in pks) {
                ret.push(`${fieldNames[i]}=${tr.children().eq(i + 1).attr('data-value')}`);
            }
        }
        return ret.join('&');
    }

    function tupleToKey(tuple) {
        let ret = [];
        for (let i = 0; i < fieldNames.length; i++) {
            if (fieldNames[i] in pks) {
                ret.push(`${fieldNames[i]}=${JSON.stringify(tuple[fieldNames[i]])}`);
            }
        }
        return ret.join('&');
    }

    data.on('focusout', 'td[contenteditable="true"]', (event) => {
        let el = $(event.currentTarget);
        el.removeClass('focus');
        //        if (el.parent().index() > 1) el.removeAttr('style');
        /* the width of the two first rows are set in sync with the header
        other rows are left alone because not needed by the browser to calc correct width
        why two rows ? when one of these two rows receive the focus,
        the cell is displayed differently so that multiple rows become editable
        however the cell width does not count for the column width anymore. Having two rows
        ensure that at least one will force the width for the column */
        let tr = el.parent();
        let changed = {};
        tr.children().each((i, e) => {
            if (i == 0) return;
            i = i - 1;
            let fieldName = fieldNames[i];
            if ((fieldName in pks) && pks[fieldName].auto===true) return;
            let el = $(e);
            let oldV = format(cache.formats[i].type, cache.formats[i].internalType, el.attr('data-value'));
            let newV = getText(el);
            el.removeClass('changed');
            if (!(oldV == null && newV == "") && (oldV != newV)) {
                changed[fieldName] = newV;
                el.addClass('changed');
            }
        });
        tr.removeClass('tosave');
        if (Object.keys(changed).length > 0) {
            if (tr.parent().parent().is('.insert')) {
                cache.inserts[tr.index()] = changed;
                if (tr.index() == tr.parent().children().length - 1) {
                    addRowToInsert();
                }
            } else {
                cache.updates[trToKey(tr)] = changed;
            }
            tr.addClass('tosave');
        } else {
            delete cache.updates[trToKey(tr)];
        }
        syncHeaderSize();
    });

    data.on('focusin', 'td[contenteditable="true"]', (event) => {
        //        event.currentTarget.setAttribute('style', `width:${header.find('th').eq(event.currentTarget.cellIndex).width()}px`);
        if (event.currentTarget.parentNode.parentNode.childNodes.length > 1) {
            $(event.currentTarget).addClass('focus');
        }
    });

    let acceptedDateCharacters = new Date('4567-01-23T09:34:56Z').toLocaleDateString() + "089";
    let acceptedTimeCharacters = new Date('4567-01-23T12:34:56').toLocaleTimeString() + "0789";
    if (acceptedTimeCharacters.indexOf("PM") != -1) acceptedTimeCharacters += "A";
    let acceptedDateTimeCharacters = new Date('4567-01-23T12:34:56').toLocaleString() + "089";
    if (acceptedDateTimeCharacters.indexOf("PM") != -1) acceptedDateTimeCharacters += "A";
    data.on('keydown', 'td[contenteditable="true"]', (event) => {
        if (event.ctrlKey || event.altKey) return;
        let el, col, row, caret, tgt, text, idx;
        switch (event.key) {
            case "ArrowDown":
                caret = getCaretPosition(event.currentTarget);
                el = $(event.currentTarget);
                text = getText(el);
                if (text.substring(caret).indexOf('\n') != -1) break;
                col = el.index();
                row = el.parent().index();
                if (row < WINDOWSIZE - 1) {
                    tgt = el.parent().next().children().eq(col);
                } else {
                    let tableIdx = parseInt(el.parent().parent().parent().attr('id'));
                    tgt = $(`#${tableIdx + 1}`).find('tr:first-child').children().eq(col);
                }
                tgt.focus();
                idx = text.lastIndexOf('\n');
                if (idx != -1) caret -= idx;
                setCaret(tgt[0], caret);
                event.preventDefault();
                setTimeout(assertDisplayed, 10);
                break;
            case "ArrowUp":
                caret = getCaretPosition(event.currentTarget);
                el = $(event.currentTarget);
                text = getText(el);
                if (text.substring(0, caret).indexOf('\n') != -1) break;
                col = el.index();
                row = el.parent().index();
                if (row > 0) {
                    tgt = el.parent().prev().children().eq(col);
                } else {
                    let tableIdx = parseInt(el.parent().parent().parent().attr('id'));
                    tgt = $(`#${tableIdx - 1}`).find('tr:last-child').children().eq(col);
                }
                if (tgt.length == 0) break;
                tgt.focus();
                text = getText(tgt);
                idx = text.lastIndexOf('\n');
                if (idx != -1) caret += idx;
                setCaret(tgt[0], caret);
                event.preventDefault();
                setTimeout(assertDisplayed, 10);
                break;
            case "ArrowRight":
                caret = getCaretPosition(event.currentTarget);
                el = $(event.currentTarget);
                if (caret >= getText(el).length) {
                    tgt = $(event.currentTarget).next();
                    if (tgt.length > 0 && tgt.is('[contenteditable]')) {
                        tgt.focus();
                        setCaret(tgt[0], 0);
                        event.preventDefault();
                    }
                }
                break;
            case "ArrowLeft":
                caret = getCaretPosition(event.currentTarget);
                if (caret == 0) {
                    tgt = $(event.currentTarget).prev();
                    if (tgt.length > 0 && tgt.is('[contenteditable]')) {
                        tgt.focus();
                        setCaret(tgt[0], getText(tgt).length);
                        event.preventDefault();
                    }
                }
                break;
            default:
                if (event.key.length == 1) {
                    // proper key; filter according to field type
                    let el = $(event.currentTarget);
                    let idx = el.index() - 1;
                    let type = tabledef[fieldNames[idx]].type;
                    let prevent = false;
                    switch (type) {
                        case "tinyint":
                        case "smallint":
                        case "mediumint":
                        case "int":
                        case "integer":
                        case "bigint":
                        case "int2":
                        case "int4":
                        case "int8":
                            if ("0123456789".indexOf(event.key) == -1) prevent = true;
                            break;
                        case "numeric":
                        case "decimal":
                        case "real":
                        case "double":
                        case "double precision":
                        case "float":
                            if ("0123456789.e".indexOf(event.key) == -1) prevent = true;
                            break;
                        case "time":
                            if (acceptedTimeCharacters.indexOf(event.key) == -1) prevent = true;
                            break;
                        case "datetime":
                        case "timestamp":
                            if (acceptedDateTimeCharacters.indexOf(event.key) == -1) prevent = true;
                            break;
                        case "date":
                            if (acceptedDateCharacters.indexOf(event.key) == -1) prevent = true;
                            break;
                    }
                    if (prevent) {
                        event.preventDefault();
                        poperror('Invalid character "' + event.key + '" for column type ' + type);
                    } else {
                        el.closest('tr').removeClass('tosave').addClass('tosave');
                        el.attr('data-cwidth', el.width());
                    }
                }
                break;
        }
    });

    data.on('keyup', 'td[contenteditable="true"]', (event) => {
        let el = $(event.currentTarget);
        if (el.width() != el.attr('data-cwidth')) {
            syncHeaderSize();
        }
    })

    data.on('click', 'a.delete', (event) => {
        let tr = $(event.currentTarget.parentNode.parentNode);
        tr.toggleClass('todelete');
        if (tr.is('.todelete')) {
            cache.deletes[trToKey(tr)] = {};
        } else {
            delete cache.deletes[trToKey(tr)];
        }
    });

    data.on('click', 'a.cancel', (event) => {
        let tr = $(event.currentTarget.parentNode.parentNode);
        tr.find('.sqlerror').remove();
        let key = trToKey(tr);
        delete cache.deletes[key];
        delete cache.updates[key];
        if (tr.is('.tosave')) {
            tr.find('td.changed').each((i, e) => {
                let el = $(e);
                el.removeClass('changed');
                el.text(format(cache.formats[el.index() - 1].type, cache.formats[el.index() - 1].internalType, el.attr('data-value')));
            });
            tr.removeClass('tosave');
            if (tr.parent().parent().is('.insert')) {
                let idx = tr.index();
                tr.remove();
                data.height((cache.rows + insertTable.children().eq(0).children().length) * ROWSIZE + 1);
                cache.inserts.splice(idx, 1);
                syncHeaderSize();
            }
        }
        tr.removeClass('todelete');
    });

    data.on('click', 'a.save', (event) => {
        save($(event.currentTarget));
    });

    function format(type, internalType, text) {
        if (text == "") return "";
        switch (type) {
            case "date":
                switch (internalType) {
                    case "datetime":
                        return new Date(JSON.parse(text)).toLocaleString();
                    case "time":
                        return new Date(JSON.parse(text)).toLocaleTimeString();
                    case "date":
                        return new Date(JSON.parse(text)).toLocaleDateString();
                }
            default:
                return JSON.parse(text);
        }
    }

    function display(table, results) {
        let fields = [];
        let formats = [];
        for (let i = 0; i < results.fields.length; i++) {
            let f = results.fields[i];
            fields.push(f.name);
            formats.push(f.format);
        }
        cache.formats = formats;
        if (table != null) table.find('>tbody>tr').each((i, row) => {
            let tr = $(row);
            tr.children().each((j, td) => {
                if (j == 0) return;
                switch (formats[j - 1].type) {
                    case "datetime":
                    case "time":
                    case "date":
                        td.setAttribute('class', 'date');
                        break;
                    case "number":
                        td.setAttribute('class', 'number');
                        break;
                }
                let s = JSON.stringify(results.rows[i][j - 1]);
                td.innerText = format(formats[j - 1].type, formats[j - 1].internalType, s);
                td.setAttribute('data-value', s);
            });
            // restore operations state
            let key = trToKey(tr);
            let err = undefined;
            if (key in cache.deletes) {
                tr.addClass('todelete');
                err = cache.deletes[key]["___error123___"];
            }
            if (key in cache.updates) {
                tr.addClass('tosave');
                tr.children().each((j, td) => {
                    if (j == 0) return;
                    if (fieldNames[j - 1] in cache.updates[key]) {
                        td.innerText = format(formats[j - 1].type, formats[j - 1].internalType, JSON.stringify(cache.updates[key][fieldNames[j - 1]]));
                        $(td).addClass('changed');
                    }
                });
                err = cache.updates[key]["___error123___"];
            }
            if (err) {
                tr.find('.sqlerror').remove();
                tr.children().eq(0).append($('<div class="sqlerror" onclick="this.parentElement.removeChild(this)">').text(err));
            }
        });
        setTimeout(() => {
            if (table != null) table.find('>tbody>tr:first-child>td').each((i, e) => {
                e.setAttribute("data-width", $(e).width());
            });
            syncHeaderSize();
        }, 10);
    }

    window.addEventListener('keyup', (event) => {
        switch (event.key) {
            case 'Escape':
                let cur = $(':focus');
                if (cur.length > 0) {
                    document.activeElement.blur();
                }
                $('.sqlerror').remove();
                $('tr.todelete a.cancel, tr.tosave a.cancel').trigger('click');
                event.stopPropagation();
                event.preventDefault();
                break;
            case "s":
                if (!event.shiftKey && event.ctrlKey && !event.altKey && !event.metaKey) {
                    let cur = $(':focus');
                    if (cur.length > 0) {
                        document.activeElement.blur();
                    }
                    save($('tr.todelete a.save, tr.tosave:not(tr.todelete) a.save'));
                    event.stopPropagation();
                    event.preventDefault();
                }
        }
    }, true);

    function formatTuple(t) {
        for (let k in t) {
            if (!(k in tabledef)) continue;
            if (t[k] == null || ((typeof t[k] == "string") && (t[k].trim() == ""))) continue;
            let d = t[k];
            switch (tabledef[k].type) {
                case "date":
                case "time":
                case "datetime":
                    try {
                        d = new Date(t[k] + "Z").toISOString(); // trailing Z means UTC, which is assumed by toISOString()
                    } catch (_) { continue; }
                    break;
                default:
                    continue;
            }
            switch (tabledef[k].type) {
                case "date":
                    t[k] = d.split('T')[0];
                    break;
                case "time":
                    t[k] = d.split('T')[1];
                    break;
                case "datetime":
                    t[k] = d.split('T').join(' ');
                    break;
            }
        }
        return t;
    }

    function save(rowsA) {
        return new Promise((resolve, reject) => {
            let operations = [];
            let minTableIdx = Number.MAX_VALUE;
            rowsA.each((i, e) => {
                let tr = $(e).parent().parent();
                if (tr.parent().parent().is('.insert')) {
                    let idx = tr.index();
                    let insert = cache.inserts[idx];
                    delete insert["___error123___"];
                    operations.push({
                        insert: formatTuple(insert),
                        index: idx,
                        pks: Object.keys(pks)
                    });
                    minTableIdx = Math.min(minTableIdx, Math.floor(cache.rows / WINDOWSIZE));
                } else {
                    let key = trToKey(tr);
                    if (key in cache.deletes) {
                        let tableIdx = parseInt(tr.parent().parent().attr('id'));
                        if (tableIdx < minTableIdx) minTableIdx = tableIdx;
                        operations.push({
                            delete: trToPK(tr)
                        });
                    }
                    if (key in cache.updates) {
                        let upd = cache.updates[key];
                        delete upd["___error123___"];
                        let tableIdx = parseInt(tr.parent().parent().attr('id'));
                        if (tableIdx < minTableIdx) minTableIdx = tableIdx;
                        operations.push({
                            update: formatTuple($.extend(trToPK(tr), upd)),
                            pks: trToPK(tr)                        })
                    }
                }
            })
            if (operations.length == 0) {
                resolve();
                return;
            }
            dbadapter.batch(operations,
                (response) => {
                    let keys = Object.keys(cache.tables);
                    for (let j = 0; j < keys.length; j++) {
                        if (parseInt(keys[j]) >= minTableIdx) {
                            cache.tables[keys[j]].table.remove();
                            delete cache.tables[keys[j]];
                        }
                    }
                    let todelete = [];
                    let failures = false;
                    let n = cache.rows;
                    for (let i = 0; i < response.results.length; i++) {
                        let op = response.results[i];
                        if (!op.success) {
                            failures = true;
                        } else {
                            if ("delete" in op) {
                                let key = tupleToKey(op.delete); // UI will be updated through whole table refresh
                                delete cache.updates[key];
                                delete cache.deletes[key];
                                n--;
                            } else {
                                // got a tuple back, check if correct structure
                                if (Object.keys(op.tuple).length != fieldNames.length) {
                                    error("Table schema has changed in DB");
                                    return;
                                }
                                for (let i = 0; i < fieldNames.length; i++) {
                                    if (!(fieldNames[i] in op.tuple)) {
                                        error("Table schema has changed in DB");
                                        return;
                                    }
                                }
                                if ("update" in op) {
                                    let key = tupleToKey(op.tuple); // UI will be updated through whole table refresh
                                    delete cache.updates[key];
                                } else if ("insert" in op) {
                                    n++;
                                    todelete.push(op.index);
                                }
                            }
                        }
                    }
                    if (n != cache.rows) setCacheRows(n);
                    if (todelete.length > 0) {
                        todelete.sort();
                        for (let i = todelete.length - 1; i >= 0; i--) {
                            data.find('.insert tr').eq(todelete[i]).remove();
                            cache.inserts.splice(todelete[i], 1);
                        }
                        data.height((cache.rows + insertTable.children().eq(0).children().length) * ROWSIZE + 1);
                        syncHeaderSize()
                    }

                    if (failures) {
                        for (let i = 0; i < response.results.length; i++) {
                            let op = response.results[i];
                            if (op.success) continue;
                            let key;
                            if ("delete" in op) {
                                key = tupleToKey(op.delete);
                                if (key in cache.deletes) {
                                    cache.deletes[key]["___error123___"] = op.error;
                                }
                            } else if ("update" in op) {
                                key = tupleToKey(op.update);
                                if (key in cache.updates) {
                                    cache.updates[key]["___error123___"] = op.error;
                                }
                            } else if ("insert" in op) {
                                if (op.index in cache.inserts) {
                                    cache.inserts[op.index]["___error123___"] = op.error;
                                }
                            }
                        }
                    }
                    assertDisplayed();
                    resolve();
                }, (err) => {
                    error(err);
                    reject(err);
                });
        });
    }

    function poperror(msg) {
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
        toastr["error"](`${msg}`, "Error");
    }


    return {
        destroy() {
            header.empty();
            data.empty();
            viewport.off('scroll', assertDisplayed);
            $(window).off('resize', assertDisplayed);
            data.off('focusout');
            data.off('focusin');
            data.off('keydown');
            data.off('click');
        },
        saveAll() {
            return save($('tr.todelete a.save, tr.tosave:not(tr.todelete) a.save'));
        }
    }

}

