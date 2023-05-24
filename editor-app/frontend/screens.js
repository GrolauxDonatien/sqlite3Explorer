
setTimeout(() => {
    $('#bugfix').remove();
}, 0);

let conf = { adapter: "sqlite3" };

let str = location.search.substring(1).split('&');
for (let i = 0; i < str.length; i++) {
    let idx = str[i].indexOf("=");
    if (idx != -1) {
        conf[str[i].substring(0, idx)] = decodeURIComponent(str[i].substring(idx + 1));
    }
}

function error(msg) {
    alert(msg);
}

let total;

function recount(cb) {
    ipcAjax({
        adapter: "sqlite3",
        action: "exec",
        exec: `SELECT COUNT(*) FROM ${conf.table}`,
        file: conf.file
    }, (response) => {
        if ("error" in response) {
            error(response.error);
        } else {
            total = response.results.rows[0][0];
            $('#total').text(response.results.rows[0][0]);
            if (cb) cb();
        }
    }, error);
}

let current = 0;
let schema;
let tbody = $('#tuple');
let curel = $('#current');
let inerror = false;

function showTuple() {
    function showFields(fields, tuple) {
        for (let i = 0; i < fields.length; i++) {
            let info = schema[fields[i].name];
            let tr = $('<tr>');
            let td = $('<td>').text(fields[i].name);
            tr.append(td);
            td = $('<td>');
            if ("fk" in info) {
                let select = $('<select singleselect-search="true">');
                select.on('change', ()=>{
                    tr[0].children[0].setAttribute('class', 'changed');
                })
                ipcAjax({
                    adapter: "sqlite3",
                    action: "exec",
                    exec: `SELECT * FROM ${info.fk.table} WHERE ${info.fk.column}=?`,
                    args:[tuple[i]],
                    file: conf.file
                }, (options) => {
                    function toObj(tuple) {
                        if (tuple==null) {
                            return {[info.fk.column]:null,text:"NULL"};
                        } else {
                            return {[info.fk.column]:tuple[fkidx],text:tuple.join('/')};
                        }
                    }
                    let fkidx = -1;
                    let fields=[];
                    for (let j = 0; j < options.results.fields.length; j++) {
                        if (options.results.fields[j].name === info.fk.column) {
                            fkidx = j;
                        }
                        fields.push(options.results.fields[j].name);
                    }
                    singleselectDropdown(select[0], {
                        selected: toObj(options.results.rows[0]),
                        keys: { [info.fk.column]: "text" },
                        pagingSize: 100,
                        async total(search) {
                            let q={};
                            q.exec=`SELECT COUNT(*) FROM ${info.fk.table}`
                            if (search.trim()!='') {
                                q.exec+=` WHERE ${fields.join(" || '/' || ")} LIKE ?`;
                                q.args=['%'+search+'%'];
                            }
                            return new Promise((resolve, reject)=>{
                                q.adapter="sqlite3",
                                q.action="exec";
                                q.file=conf.file;
                                ipcAjax(q,(result)=>{
                                    resolve(result.results.rows[0][0]);
                                });
                            });
                        },
                        async fetch(search, start) {
                            let q={};
                            q.exec=`SELECT * FROM ${info.fk.table}`
                            if (search.trim()!='') {
                                q.exec+=` WHERE ${fields.join(" || '/' || ")} LIKE ?`;
                                q.args=['%'+search+'%'];
                            }
                            q.exec+=" LIMIT 100 OFFSET "+start;
                            return new Promise((resolve, reject)=>{
                                q.adapter="sqlite3",
                                q.action="exec";
                                q.file=conf.file;
                                ipcAjax(q,(result)=>{
                                    let opts=[];
                                    if (start==0 && info.nullable) {
                                        opts.push({[info.fk.column]:null,text:"NULL"});
                                    }
                                    for(let i=0; i<result.results.rows.length; i++) {
                                        opts.push({[info.fk.column]:result.results.rows[i][fkidx],text:result.results.rows[i].join('/')});
                                    }
                                    resolve(opts);
                                });
                            });
                        },
                        async get(key) {
                            let q={};
                            if (key!=null) {
                                q.exec=`SELECT * FROM ${info.fk.table} WHERE ${info.fk.column}=?`;
                                q.args=key;
                            } else {
                                q.exec=`SELECT * FROM ${info.fk.table} WHERE ${info.fk.column} IS NULL`;
                            }
                            return new Promise((resolve, reject)=>{
                                q.adapter="sqlite3",
                                q.action="exec";
                                q.file=conf.file;
                                ipcAjax(q,(result)=>{
                                    resolve(result.results.rows[0][0]);
                                });
                            });
                        }
                    });
                });
                td.append(select);
            } else {
                let input = $('<input>');
                if (info.pk === true && info.type == "integer" && info.auto === true) {
                    input.attr('disabled', 'disabled');
                    input.attr("title", "Cannot modify auto generated PK");
                    input.attr('data-pk', JSON.stringify(tuple[i]));
                } else if (info.pk === true) {
                    input.attr('data-pk', JSON.stringify(tuple[i]));
                }
                switch (schema[fields[i].name].format) {
                    case "datetime":
                        input.attr('type', 'datetime-local');
                        if (tuple[i]) tuple[i] = tuple[i].replace(" ", 'T');
                        break;
                    case "time":
                        input.attr('type', 'time');
                        break;
                    case "date":
                        input.attr('type', 'date');
                        break;
                    case "boolean":
                        input.attr('type', 'checkbox');
                        input.prop('checked', tuple[i] === 1);
                        break;
                    case "number":
                        input.attr('type', 'number');
                        break;
                }
                if (tuple[i]!=null) input.val(tuple[i]);
                td.append(input);
            }
            tr.append(td);
            tbody.append(tr);
        }
    }

    if (isNaN(current) || current < 0) current = 0;
    if (current > total) current = total;
    if (current == total) {
        curel.val("");
        tbody.html('');
        inerror = false;
        let fields = Object.keys(schema);
        for (let i = 0; i < fields.length; i++) fields[i] = { name: fields[i] };
        showFields(fields, []);
    } else {
        ipcAjax({
            adapter: "sqlite3",
            action: "exec",
            exec: `SELECT * FROM ${conf.table} LIMIT 1 OFFSET ${current}`,
            file: conf.file
        }, (response) => {
            tbody.html('');
            if ("error" in response) {
                curel.val("");
                inerror = true;
                error(response.error);
            } else {
                inerror = false;
                curel.val(current + 1);
                let tuple = response.results.rows[0];
                let fields = Object.keys(schema);
                let rfields = {};
                for (let i = 0; i < response.results.fields.length; i++) rfields[response.results.fields[i].name] = true;
                for (let i = 0; i < fields.length; i++) {
                    if (fields[i] in rfields) {
                        fields[i] = { name: fields[i] };
                    } else {
                        inerror = true;
                        curel.val("");
                        error("The schema has changed and the database needs to be imported back again first.");
                        return;
                    }
                }
                showFields(fields, tuple);
            }
        }, error);
    }
}

ipcAjax({ action: "getAndCheckTableSchema", conf }, (response) => {
    schema = response.schema;
    delete schema.checks___;
    recount(showTuple);
}, error);

$('#prev').on('click', () => {
    if (current > 0) {
        current--;
        showTuple();
    }
});

$('#first').on('click', () => {
    if (current != 0) {
        current = 0;
        showTuple();
    }
});

$('#next').on('click', () => {
    if (current < total - 1) {
        current++;
        showTuple();
    }
});

$('#last').on('click', () => {
    if (current != total - 1) {
        current = total - 1;
        showTuple();
    }
});

$('#add').on('click', () => {
    if (current != total) {
        current = total;
        showTuple();
    }
});

curel.on('change', () => {
    current = parseInt(curel.val()) - 1;
    showTuple();
});

$('#cancel').on('click', () => {
    // just reload tuple
    showTuple();
});

$('#delete').on('click', () => {
    if (inerror) {
        error('Cannot delete while there is an error.');
        return;
    }
    if (!confirm("Are you sure you want to delete this entry ?")) return;
    if (current == total) {
        current = 0;
        showTuple();
        return;
    }
    // gather data
    let pk = {};
    let inputs = $('table td>input, table td>select');
    let i = 0;
    for (let f in schema) {
        let el = inputs[i];
        i++;
        let info = schema[f];
        if (info.pk === true) {
            let v = el.getAttribute('data-pk');
            if (v) {
                pk[f] = JSON.parse(v);
            }
            if (info.type == "integer" && info.auto === true) continue;
        }
    }
    if (Object.keys(pk).length == 0) {
        error('Cannot delete if there is no PK');
        return;
    }
    let op = {
        delete: pk
    }
    ipcAjax({
        adapter: "sqlite3",
        action: "batch",
        operations: [op],
        file: conf.file,
        table: conf.table
    }, (response) => {
        if ("error" in response) {
            error(response.error);
        } else {
            for (let i = 0; i < response.results.length; i++) {
                let op = response.results[i];
                if (!op.success) {
                    error(op.error);
                    showTuple();
                    return;
                }
            }
            current--;
            total--;
            $('#total').text(total);
            showTuple();
        }
    }, (msg) => {
        error(msg);
        showTuple();
    })
});

$('#save').on('click', () => {
    if (inerror) {
        error('Cannot save while there is an error.');
        return;
    }
    // gather data
    let tuple = {};
    let pk = {};
    let inputs = $('table td>input, table td>select');
    let i = 0;
    for (let f in schema) {
        let el = inputs[i];
        i++;
        let info = schema[f];
        if (info.pk === true) {
            let v = el.getAttribute('data-pk');
            if (v) {
                pk[f] = JSON.parse(v);
            }
            if (info.type == "integer" && info.auto === true) continue;
        }
        let v;
        switch (schema[f].format) {
            case "datetime":
                v = el.value.replace('T', ' ');
                break;
            case "time":
                v = el.value;
                break;
            case "date":
                v = el.value;
                break;
            case "boolean":
                v = el.checked ? 1 : 0;
                break;
            case "number":
                v = parseFloat(el.value);
                if (isNaN(v)) v = null;
                break;
            default:
                v = el.value;
        }
        tuple[f] = v;
    }
    let op;
    if (current == total) {
        op = {
            insert: tuple,
            pks: Object.keys(pk)
        }
    } else {
        if (Object.keys(pk).length == 0) {
            error('Cannot update if there is no PK');
            return;
        }
        op = {
            update: tuple,
            pks: pk
        }
    }
    ipcAjax({
        adapter: "sqlite3",
        action: "batch",
        operations: [op],
        file: conf.file,
        table: conf.table
    }, (response) => {
        if ("error" in response) {
            error(response.error);
        } else {
            for (let i = 0; i < response.results.length; i++) {
                let op = response.results[i];
                if (!op.success) {
                    error(op.error);
                    return;
                }
            }
            if (current == total) {
                total++;
                $('#total').text(total);
                showTuple();
            } else {
                $('table .changed').removeClass('changed')
            }
        }
    }, (msg) => {
        error(msg);
    })
})

$('table').on('change', 'input', (event) => {
    if (event.target.classList.contains("singleselect-dropdown-search")) return;
    event.target.parentElement.parentElement.children[0].setAttribute('class', 'changed');
});

