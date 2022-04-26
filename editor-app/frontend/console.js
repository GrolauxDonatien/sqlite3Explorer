let conf={adapter:"sqlite3"};

let str=location.search.substring(1).split('&');
for(let i=0; i<str.length; i++) {
    let idx=str[i].indexOf("=");
    if (idx!=-1) {
        conf[str[i].substring(0,idx)]=decodeURIComponent(str[i].substring(idx+1));
    }
}

let history=[];
let historyIdx=0;

function display(results) {

    let table = $('<table>');
    $('#results').append(table);
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
                case "date":
                    switch(formats[j].internalType) {
                        case "datetime":
                            td.addClass('date').text(new Date(results.rows[i][j]).toLocaleString());
                            break;
                        case "time":
                            td.addClass('date').text(new Date(results.rows[i][j]).toLocaleTimeString());
                            break;
                        case "date":
                            td.addClass('date').text(new Date(results.rows[i][j]).toLocaleDateString());
                            break;        
                    }
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
    document.getElementById('bottom').scrollIntoView();
    input.focus();
}

let input=$('#sql');
input.focus();
//input.on('focusout',()=>{input.focus()});

input.on('keydown',(event)=>{
    switch (event.key) {
        case "Enter":
            let t=input.val();
            if (historyIdx>=history.length || history[historyIdx]!=t) {
                history.push(t);
            }
            historyIdx=history.length;
            switch(t) {
                case "reload":
                    location.reload();
                    break;
                case "clear":
                    $('#results').empty();
                    input.val("");
                    break;
                default:
                    $('#results').append($('<div>').text('> '+t));
                    input.val("");
                    ipcAjax({
                        adapter:"sqlite3",
                        action:"exec",
                        exec:t,
                        file:conf.file
                    }, (response)=>{
                        if ("error" in response) {
                            $('#results').append($('<div class="error">').text(response.error));
                        } else if ("rows" in response.results) {
                            display(response.results);
                        } else if ("info" in response.results) {
                            $('#results').append($('<div>').text(response.results.info.changes+" tuple(s) modified."));
                        } else {
                            $('#results').append($('<div>').text("Ok."));
                        }
                    }, (err)=>{
                        $('#results').append($('<div class="error">').text(err));
                    });
                    break;
            }
            event.preventDefault();
            break;
        case "Escape":
            input.val("");
            historyIdx=history.length;
            event.preventDefault();
            break;
        case "ArrowUp":
            if (historyIdx>0) {
                historyIdx--;
                input.val(history[historyIdx]);
            }
            event.preventDefault();
            break;
        case "ArrowDown":
            if (historyIdx<history.length-1) {
                historyIdx++;
                input.val(history[historyIdx]);
            } else {
                historyIdx=history.length;
                input.val("");
            }
            event.preventDefault();
            break;
    }
});