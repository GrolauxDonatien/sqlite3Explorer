function toJSType(type) {
    switch (type) {
        case "int":
        case "integer":
        case "numeric":
        case "smallint":
        case "double precision":
        case "decimal":
        case "double":
        case "float":
        case "bigint":
        case "int2":
        case "int8":
        case "mediumint":
        case "real":
        case "tinyint":
        case "unsigned bit int":
            return 'number';
        case "character":
        case "nvarchar":
        case "character varying":
        case "text":
        case "native character":
        case "nchar":
        case "varchar":
        case "character varying":
            return "string";
        case "boolean":
        case "bit":
            return "boolean";
        case "datetime":
        case "timestamp without time zone":
            return "datetime";
        default:
            if (type.indexOf("date") !== -1) {
                return "date";
            } else {
                return "unknown";
            }
    }
}

const types = {
    "integer": { 0: ["int", "integer", "tinyint", "smallint", "mediumint", "bigint", "unsigned bit int", "int2", "int8"] },
    "text": {
        0: ["text", "clob"],
        1: ["character", "varchar", "character varying", "nchar", "native character", "nvarchar"]
    },
    "blob": { 0: ["blob"] },
    "real": { 0: ["real", "double", "double precision", "float"] },
    "numeric": { 0: ["numeric", "boolean", "date", "datetime"], 2: ["decimal"] }
}

function internalTypeToType(internal) {
    let f = { internalType: internal };
    let idx = internal.indexOf("(");
    if (idx != -1) {
        f.type = internal.substring(0, idx).toLowerCase();
        let bounds = internal.substring(idx + 1, internal.length - 1).split(',');
        if (bounds.length == 1) {
            f.bounds = { length: parseInt(bounds[0]) }
        } else {
            let o = {};
            let total = 0;
            for (let i = 0; i < bounds.length; i++) {
                let k = "slice_" + i;
                let v = parseInt(bounds[i]);
                o[k] = v;
                total += v;
            }
            o.length = total;
            f.bounds = o;
        }

    } else {
        f.type = internal.toLowerCase();
        f.bounds = {};
    }
    f.format = toJSType(f.type);
    return f;
}

function buildFields(qfields) {
    let fields = [];
    for (let i = 0; i < qfields.length; i++) {
        let f = {};
        let idx = qfields[i].type == null ? -1 : qfields[i].type.indexOf("(");
        if (idx != -1) {
            f.internalType = qfields[i].type.substring(0, idx).toLowerCase();
            let bounds = qfields[i].type.substring(idx + 1, qfields[i].type.length - 1).split(',');
            if (bounds.length == 1) {
                f.bounds = { length: parseInt(bounds[0]) }
            } else {
                let o = {};
                let total = 0;
                for (let i = 0; i < bounds.length; i++) {
                    let k = "slice_" + i;
                    let v = parseInt(bounds[i]);
                    o[k] = v;
                    total += v;
                }
                o.length = total;
                f.bounds = o;
            }

        } else {
            f.internalType = qfields[i].type == null ? "number" : qfields[i].type.toLowerCase(); // null type for aggregate functions => they express numbers
            f.bounds = {};
        }
        f.type = toJSType(f.internalType);
        fields.push({
            name: qfields[i].name,
            internal: qfields[i],
            internalType: f.internalType,
            format: f
        })
    }
    return fields;
}


function toArray(orows, fields) {
    let rows = [];
    for (let i = 0; i < orows.length; i++) {
        let row=[];
        for(let j=0; j<fields.length; j++) {
            if (fields[j].name in orows[i]) {
                row.push(orows[i][fields[j].name]);
            } else {
                // manage repeated names
                let s=fields[j].name.split(':');
                if (s[0] in orows[i]) {
                    fields[j].viewname=fields[j].name;
                    fields[j].name=s[0];
                    row.push(orows[i][s[0]]);
                } else {
                    row.push(null);
                }
            }
        } 
        rows.push(row);
    }
    return rows;
}

module.exports={
    toJSType, types, internalTypeToType, buildFields, toArray
}