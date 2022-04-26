const electron = require('electron');


(function () {

    let callbackid = 0;
    let callbacks = {};


    let ipcAjax = function (data, callback, error) {
        callbackid++;
        callbacks[callbackid] = {};
        if (callback !== undefined) callbacks[callbackid].callback = callback;
        if (error !== undefined) callbacks[callbackid].error = error;
        let rd = JSON.parse(JSON.stringify(data));
        rd.callbackid = callbackid;
        electron.ipcRenderer.send("asynchronous-message", rd);
    }

    ipcAjax.callbacks = {};

    electron.ipcRenderer.on("main", (event, data) => {
        if ("callbackid" in data) {
            let f = callbacks[data.callbackid];
            delete callbacks[data.callbackid];
            delete data.callbackid;
            if ("error" in data) {
                if (f!=undefined && "error" in f) {
                    f.error(data.error);
                } else {
                    error(typeof data.error == "string" ? data.error : data.error.message);
                }
            } else if ("response" in data) {
                if (f!=undefined && "callback" in f) {
                    f.callback(data.response);
                } else {
                    console.log(data.response);
                }
            } else {
                if (f!=undefined && "callback" in f) {
                    f.callback(data);
                } else {
                    console.log(data);
                }
            }
        } else if ("trigger" in data) {
            if (data.trigger in ipcAjax.callbacks) {
                let n = data.trigger;
                delete data.trigger;
                ipcAjax.callbacks[n](data);
            }
        } else if ("getCheckSchema" in data) {
            delete data.getCheckSchema;
            data.schema=$.SQLEditor.schema;
            data.action="setCheckSchema";
            electron.ipcRenderer.send("asynchronous-message", data);
        } else {
            throw new Error("InternalError ipcAjax");
        }
    });


    if (window) window.ipcAjax = ipcAjax;
    if (module) module.exports = ipcAjax;

})();




