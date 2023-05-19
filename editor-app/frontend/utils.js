const mispaf = {
    span: document.createElement('SPAN'),
    escape(text) {
        mispaf.span.innerText = text;
        return mispaf.span.innerHTML;
    },
    unescape(text) {
        mispaf.span.innerHTML = text;
        return mispaf.span.innerText;
    }
}

const ISFIREFOX = navigator.userAgent.search("Firefox");

function smartTable({ root, refresh, columns, onadd, filter, buttons }) {
    let data;

    root.innerHTML = ""; // just start from empty
    if (!root.classList.contains("smart")) {
        root.classList.add("smart");
    }

    let theader = document.createElement("THEAD");
    let tr = document.createElement("TR");
    theader.appendChild(tr);

    for (let i = 0; i < columns.length; i++) {
        if (!("title" in columns[i])) throw new Error("Missing title for column of index " + i);
        let th = document.createElement("TH");
        th.innerHTML = columns[i].title;
        if ("width" in columns[i]) {
            th.style.width = columns[i].width;
        }
        if ("tooltip" in columns[i]) {
            th.setAttribute("title", columns[i].tooltip);
        }
        tr.appendChild(th);
    }

    root.appendChild(theader);

    let tbody = document.createElement("TBODY");
    root.appendChild(tbody);

    if (onadd || buttons) {
        let tfooter = document.createElement("TFOOT");
        root.appendChild(tfooter);
        let tr = document.createElement("TR");
        tfooter.appendChild(tr);
        let html = [];
        if (buttons) {
            html.push('<td>');
            for (let b in buttons) {
                html.push(`<button class="btn btn-outline-secondary">${b}</button>`);
            }
            html.push('</td>');
            html.push(`<td colspan="${columns.length - 1}">`);
        } else {
            html.push(`<td colspan="${columns.length}">`);
        }
        html.push(`<button class="btn btn-outline-secondary">+</button></td>`);
        tr.innerHTML = html.join('');
        if (onadd) {
            tr.querySelector('td:last-child button').addEventListener("click", onadd);
        }
        if (buttons) {
            tr.querySelector('td:first-child button').addEventListener("click", (event) => {
                event.preventDefault();
                buttons[event.target.innerHTML](event);
            });
        }
    }

    let checkInterval = null;

    function runFilter() {
        if (filter === undefined) return;
        if (checkInterval !== null) {
            clearTimeout(checkInterval);
        }
        checkInterval = setTimeout(() => {
            checkInterval = null;
            for (let i = 0; i < tbody.children.length; i++) {
                let v = filter.value.toLowerCase();
                checkRowFilter(tbody.children[i], v);
            }
        }, 200);
    }

    if (filter) {
        filter.addEventListener('keyup', runFilter);
    }

    function checkRowFilter(row, v = null) {
        if (v == null) v = filter.value.toLowerCase();
        row.classList.remove('filtered');
        if (v == "") {
            return;
        }
        if (row.innerText.toLowerCase().indexOf(v) == -1) {
            row.classList.add('filtered');
        }
    }

    function renderRow(row) {
        let tr = document.createElement("TR");
        for (let j = 0; j < columns.length; j++) {
            let col = columns[j];
            let td = document.createElement('TD');
            tr.appendChild(td);
            if ("render" in col) {
                td.innerHTML = col.render(row);
            }
            if ("onedit" in col) {
                td.setAttribute("contenteditable", "true");
                td.setAttribute("data-value", td.innerHTML); //memoize content of td
                td.addEventListener('input', (event) => {
                    if (td.innerHTML.indexOf("<br>") != -1 && !ISFIREFOX) {
                        // on mobile chrome brower, Enter Keypress does not work
                        // but we can detect the presence of <br> in the cell.
                        // However, Firefox behaves strangely with end of line space
                        // and they add a <br> in that case other the space disappears
                        // this <br> then stays at the end you typing more keys
                        event.preventDefault();
                        event.stopPropagation();
                        event.target.blur();
                    }
                });
                td.addEventListener('keydown', (event) => {
                    if (event.key == "Escape") {
                        td.innerHTML = td.getAttribute("data-value");
                        event.target.blur();
                    }
                });
                td.addEventListener('keypress', (event) => {
                    if (event.key == "Enter" || event.keyCode == 13) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.target.blur();
                    }
                });
                td.addEventListener('focusout', (event) => {
                    td.innerHTML = mispaf.escape(mispaf.unescape(td.innerHTML)); // unescape removes <br>
                    if (td.innerHTML != td.getAttribute("data-value")) {
                        td.setAttribute("data-value", td.innerHTML);
                        let idx = [...td.parentElement.parentElement.children].indexOf(td.parentElement);
                        if (idx >= 0) {
                            col.onedit(td, data[idx]);
                        } else {
                            col.onedit(td, row);
                        }
                    }
                });

            }
            if ("onevent" in col) {
                for (let k in col.onevent) {
                    if (k == "render") {
                        col.onevent[k]({ target: td }, row, k);
                    } else {
                        let evt = k.split(":");
                        if (evt.length > 1) {
                            let els = td.querySelectorAll(evt.slice(1).join(':'));
                            for (let l = 0; l < els.length; l++) {
                                els[l].addEventListener(evt[0], (event) => {
                                    col.onevent[k](event, row, k, els[l]);
                                })
                            }
                        } else {
                            td.addEventListener(k, (event) => {
                                col.onevent[k](event, row);
                            });
                        }
                    }
                }
            }
        }
        return tr;
    }

    function set(nd) {
        data = nd;
        tbody.innerHTML = "";
        for (let i = 0; i < data.length; i++) {
            let tr = renderRow(data[i]);
            tbody.appendChild(tr);
        }
        runFilter();
    }

    function get() {
        return data;
    }

    function appendRow(row) {
        let tr = renderRow(row);
        data.push(row);
        tbody.appendChild(tr);
    }

    return {
        refresh,
        set,
        root,
        columns,
        get,
        appendRow,
        renderRow(row) {
            let idx = data.indexOf(row);
            if (idx == -1) throw new Error("Unknown row");
            let td = renderRow(row);
            tbody.replaceChild(td, tbody.children[idx]);
        },
        removeRow(row) {
            let idx = data.indexOf(row);
            if (idx == -1) throw new Error("Unknown row");
            data.splice(idx, 1);
            tbody.removeChild(tbody.children[idx]);
        }
    }
}

function deepEqual(x, y) {
    return (x && y && typeof x === 'object' && typeof y === 'object') ?
        (Object.keys(x).length === Object.keys(y).length) &&
        Object.keys(x).reduce(function (isEqual, key) {
            return isEqual && deepEqual(x[key], y[key]);
        }, true) : (x === y);
}
