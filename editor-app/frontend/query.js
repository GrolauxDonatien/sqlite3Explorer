let dbSchemaUI = window.dbviewer.dbSchemaUI;
let dbSchemaDialog = window.dbviewer.dbSchemaDialog;
let dbActionUI = window.dbaction.dbActionUI;
let queryUI = window.dbquery;
let ipcAjax = window.ipcAjax;
queryUI.dbQueryUI.parsers = window.parsers;
window.parsers.setSQLParser(window.sqlParser);

const SYNCDELAY = 250;
let overlay;

$('#explore').css('display', 'none');

let conf = {}, model, schema;

function display(results) {

    if (overlay !== null) {
        overlay.remove();
        overlay = null;
    }

    let table = $('<table>');
    $('#tab-results').empty();
    $('#toptabs').tabs('option', 'active', 1);
    $('#tab-results').append(table);
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
}

let syncModelToText = false;
let outTab = "schema";
let syncTimer = null;

function setModel(content) {
    try {
        let newModel = window.parsers.parse(content);
        // disambiguate select
        let dis = {};
        let bad = {};
        for (let i = 0; i < newModel.from.length; i += 2) {
            let from = queryUI.getTableAliasName(newModel.from[i]);
            if (from.table in schema) {
                for (let k in schema[from.table]) {
                    if (k == "coords___") continue;
                    if (k in dis) {
                        bad[k] = true;
                    } else {
                        dis[k] = from.alias + "." + k;
                    }
                }
            }
        }
        for (let k in bad) {
            delete dis[k];
        }
        for (let i = 0; i < newModel.select.length; i++) {
            if (newModel.select[i] in dis) newModel.select[i] = dis[newModel.select[i]];
        }
        for (let k in model) {
            delete model[k];
        }
        $.extend(model, newModel);
        conf.builder.refresh();
        return true;
    } catch (e) {
        return false;
    }
}

$('#tab-free textarea').on('keyup', function () {
    if (syncModelToText) {
        if (syncTimer != null) {
            clearTimeout(syncTimer);
            syncTimer = null;
        }
        syncTimer = setTimeout(function () {
            syncTimer = null;
            $('#tab-schema .error').css('display', 'none');
            $('#tab-qvi .error').css('display', 'none');
            if (syncModelToText) {
                if (outTab=="tab-qvi") {
                    if (!qvi.display($('#tab-free textarea').val())) {
                        $('#tab-schema .error').css('display', 'flex');
                        $('#tab-qvi .error').css('display', 'flex');
                    }
                } else {
                    if (!setModel($('#tab-free textarea').val())) {
                        $('#tab-schema .error').css('display', 'flex');
                        $('#tab-qvi .error').css('display', 'flex');
                    }    
                }
            }
        }, SYNCDELAY); // small delay before trying to sync
    }
});

function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;

    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        var successful = document.execCommand('copy');
        message(successful ? "Copied to clipboard" : "Could not copy to clipboard");
    } catch (err) {
        message("Could not copy to clipboard");
        console.error(err);
    }

    document.body.removeChild(textArea);
}
function copyTextToClipboard(text) {
    if (!navigator.clipboard) {
        fallbackCopyTextToClipboard(text);
        return;
    }
    navigator.clipboard.writeText(text).then(function () {
        message("Copied to clipboard");
    }, function (err) {
        message("Could not copy to clipboard");
        console.error(err);
    });
}

function message(msg) {
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
    toastr["info"](`${msg}`, "Information");
}

function error(msg) {
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
        "timeOut": "0",
        "extendedTimeOut": "0",
        "showEasing": "swing",
        "hideEasing": "linear",
        "showMethod": "fadeIn",
        "hideMethod": "fadeOut",
        "tapToDismiss": false
    }
    toastr["error"](`${msg}`, "Runtime Error");
}


function execute() {
    $('.toast').remove();
    if (overlay == null) {
        // immediately place a completely transparent overlay that prevents further interaction with the UI.
        overlay = $('<div style="z-index:100000; position:fixed; top:0px; left:0px; width:100%; height:100%; background-color:rgba(0,0,0,0.0); display: flex; justify-content: center; align-items: center;">');
        $('body').append(overlay);
        // after a while, makes this overlay visible
        setTimeout(function () {
            if (overlay !== null) {
                overlay.css('background-color', 'rgba(0,0,0,0.2)');
                overlay.append('<div class="loader">');
            }
        }, 10);
    }
    // get source
    let sql;
    if ($('#tab-free').css('display') == "none") {
        sql = queryUI.stringify(model, "\n");
    } else {
        sql = $('#tab-free textarea').val();
    }
    ipcAjax({
        adapter: "sqlite3",
        action: "query",
        query: sql,
        stat: conf.stat,
        file: conf.file
    }, (response) => {
        if ("schema" in response) {
            // the schema was updated; update the UI correspondingly
            $('#tab-schema').empty();
            $('#tab-builder').empty();
            model = queryUI.createQuery();
            for (let k in response.schema) {
                if (k in schema) response.schema[k].coords___ = schema[k].coords___;
            }
            schema = response.schema;
            conf.builder.destroy();
            conf.builder = queryUI.dbQueryUI({
                schemaEl: $('#tab-schema'),
                queryEl: $('#tab-builder'),
                schema: response.schema,
                available: [],
                model: model,
                onchange: function (e, m) {
                    if (syncModelToText) {
                        $('#tab-free textarea').val(queryUI.stringify(m, "\n"));
                    }
                }
            });
            conf.stat = response.stat;
            if ($('#tab-free').css('display') == "none") {
                setModel(sql);
            }
        }
        if ("error" in response) {
            if (overlay != null) {
                overlay.remove();
                overlay = null;
            }
            error(response.error + "<br><br>in<br><br>" + response.query);
        } else {
            display(response.results);
            $('#query').text(response.query);
        }
    }, (err) => {
        if (overlay != null) {
            overlay.remove();
            overlay = null;
        }
        error(err + "<br><br>in<br><br>" + sql);
    });
}

function clear() {
    if ($('#tab-free').css('display') == "none") {
        for (let k in model) {
            delete model[k];
        }
        $.extend(model, queryUI.createQuery());
        conf.builder.refresh();
    } else {
        $('#tab-free textarea').val("");
    }
    $("#tab-results").empty();
    $('#toptabs').tabs('option', 'active', 0);
    $('.toast').remove();
    $('#query').text("");
}

function setInTab(tab) {
    switch (tab) {
        case "tab-free":
            syncModelToText = true;
            $('#tab-schema .error').css('display', 'none');
            $('#tab-qvi .error').css('display', 'none');
            $('#tab-free textarea').val(queryUI.stringify(model, "\n"));
            break;
        case "tab-builder":
            syncModelToText = false;
            $('#tab-schema .error').css('display', 'none');
            $('#tab-qvi .error').css('display', 'none');
            let content = $('#tab-free textarea').val();
            try {
                let newModel = window.parsers.disAmbiguateSelect(window.parsers.parse(content), schema);
                $.extend(model, newModel);
                conf.builder.refresh();
            } catch (e) {
                console.log(e);
                debugger;
                // ignore
            }
            break;
    }
}

$("#bottom").on("tabsactivate", function (event, ui) {
    setInTab(ui.newTab.children().eq(0).attr('href').substring(1));
});

$('#top').on("tabsactivate", function (event, ui) {
    outTab = ui.newTab.children().eq(0).attr('href').substring(1);
    if (outTab=="tab-qvi") {
        if (syncModelToText) {
            qvi.display($('#tab-free textarea').val());
            qvi.resize();
        } else {
            qvi.display(queryUI.stringify(model, "\n"))
            qvi.resize();
        }
    }
    //    setInTab($('#bottomtabs').find('.ui-state-active').children().eq(0).attr('href').substring(1));
});

let str = location.search.substring(1).split('&');
for (let i = 0; i < str.length; i++) {
    let idx = str[i].indexOf("=");
    if (idx != -1) {
        conf[str[i].substring(0, idx)] = decodeURIComponent(str[i].substring(idx + 1));
    }
}

$("#toptabs").tabs();
$("#bottomtabs").tabs();

let qvi = (function initQVI(root) {
    let canvas = document.createElement('CANVAS');
    $('#tab-qvi')[0].appendChild(canvas);

    physCanvas = createPhysCanvas(canvas, { drawJunctions: true });
    physCanvas.addEventListener('click', (event) => {
        if (event.modelTarget !== undefined && event.modelTarget.type == "rect" && ("toggle" in event.modelTarget)) {
            event.modelTarget.toggle(event);
        }
    });

    function resizeCanvas() {
        let bb = physCanvas.bbox();
        let w=Math.max(bb.width + 100, physCanvas.canvas.parentElement.clientWidth );
        let h=Math.max(bb.height + 100, physCanvas.canvas.parentElement.clientHeight );
        physCanvas.canvas.setAttribute("width", w);
        physCanvas.canvas.setAttribute("height", h);
        let ctx=physCanvas.canvas.getContext("2d");
        ctx.width = w;
        ctx.height = h;
        physCanvas.repaint();
    }

    $(window).on('resize', resizeCanvas);
    let oldsql="";

    return {
        display(sql) {
            if (sql.trim()==oldsql) return $('#tab-qvi .error').css('display')=='none';
            oldsql=sql.trim();
            let parsed;
            try {
                parsed = window.sqlParser.parse(sql);
                $('#tab-qvi .error').css('display', 'none');
            } catch (e) {
                $('#tab-qvi .error').css('display', 'flex');
                return false;
            }
            let queryModelAll = queryASTToQueryModel(parsed);
            let queryModel = queryModelAll.results;
            queryModel = notExistsToForAll(queryModel);
            let physModel=queryModelToPhysModel(queryModel, physCanvas.config);
            physCanvas.model.splice(0,physCanvas.model.length);
            physCanvas.model.push.apply(physCanvas.model, physModel);

            physCanvas.addEventListener("afterPaint", physCanvas.bringIntoView);
            setTimeout(() => {
                let f = function () {
                    physCanvas.removeEventListener("afterPaint", physCanvas.bringIntoView);
                    physCanvas.removeEventListener("stopPaint", f);
                    physCanvas.repaint();
                }
                physCanvas.addEventListener("stopPaint", f);
            }, 500);
            return true;
        }, 
        resize:resizeCanvas
    }
})();

ipcAjax({
    action: "getSchema", conf: { adapter: "sqlite3", file: conf.file }
}, (response) => {
    $('#explore').css('display', 'flex');
    $('#loading').css('display', 'none');
    model = queryUI.createQuery();
    schema = response.schema;
    conf.builder = queryUI.dbQueryUI({
        schemaEl: $('#tab-schema'),
        queryEl: $('#tab-builder'),
        schema: response.schema,
        available: [],
        model: model,
        onchange: function (e, m) {
            conf.builder.refresh();
            if (syncModelToText) {
                $('#tab-free textarea').val(queryUI.stringify(m, "\n"));
            }
            if (outTab == "tab-qvi") {
                qvi.display(queryUI.stringify(m, "\n"));
                qvi.resize();
            }
        }
    });
    conf.stat = response.stat;
    $('#run').off('click');
    $("#run").click(execute);
    $('#clear').off('click');
    $("#clear").click(clear);
});