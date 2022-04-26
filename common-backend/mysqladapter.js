const mysql = require('mysql');


async function connect(confmysql) {

    let pool = null;

    async function createDBModel() {
        return new Promise((resolve, reject) => {
            let model = {};
            function setTables(results, fields) {
                let field = fields[0].name;
                for (let i = 0; i < results.length; i++) {
                    model[results[i][field]] = {};
                }
            }
            function setColumns(table, results) {
                let t = model[table];
                for (let i = 0; i < results.length; i++) {
                    let r = results[i];
                    let f = {};
                    t[r.Field] = f;
                    f.name = r.Field;
                    f.nullable = (r.Field == "YES");
                    f.auto = (r.Extra == "auto_increment");
                    f.pk = (r.Key == "PRI");
                    f.unique = (f.pk || r.Key == "UNI");
                    let idx = r.Type.indexOf("(");
                    if (idx != -1) {
                        f.type = r.Type.substring(0, idx);
                        f.bounds = { length: parseInt(r.Type.substring(idx + 1, r.Type.length - 1)) }
                    } else {
                        f.type = r.Type;
                        f.bounds = {};
                    }
                    switch (f.type) {
                        case "int":
                        case "integer":
                        case "numeric":
                        case "smallint":
                        case "double precision":
                            f.js = 'number';
                            break;
                        case "character":
                        case "varchar":
                        case "character varying":
                            f.js = "string";
                            break;
                        case "text":
                            f.js = "string";
                            break;
                        case "boolean":
                        case "bit":
                            f.js = "boolean";
                            break;
                        default:
                            if (f.type.indexOf("timestamp") !== -1) {
                                f.js = "date";
                            } else {
                                f.js = "unknown";
                            }
                    }
                }
            }
            function setFKs(results) {
                for (let i = 0; i < results.length; i++) {
                    let r = results[i];
                    let t = model[r.TABLE_NAME];
                    if (t == undefined) continue;
                    let f = t[r.COLUMN_NAME];
                    if (f == undefined) continue;
                    f.fk = {
                        table: r.REFERENCED_TABLE_NAME,
                        column: r.REFERENCED_COLUMN_NAME
                    }
                }
            }
            try {
                if (pool == null) throw new Error('DB not connected');
                pool.getConnection((err, conn) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    function processFKs() {
                        conn.query(`SELECT
                        TABLE_NAME,
                        COLUMN_NAME,
                        CONSTRAINT_NAME,
                        REFERENCED_TABLE_NAME,
                        REFERENCED_COLUMN_NAME
                    FROM
                        INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                    WHERE
                        REFERENCED_TABLE_SCHEMA = '${pool.schema}'
                        AND REFERENCED_TABLE_NAME IS NOT NULL
                        AND REFERENCED_COLUMN_NAME IS NOT NULL`, (err, results, fields) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            setFKs(results);
                            resolve(model);
                        })
                    }
                    conn.query("SHOW TABLES", (err, results, fields) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        setTables(results, fields);
                        let count = Object.keys(model).length;
                        for (let k in model) {
                            conn.query("DESCRIBE " + k, (err, results, fields) => {
                                if (count < 0) return;
                                if (err) {
                                    reject(err);
                                    count = -1;
                                    return;
                                }
                                setColumns(k, results);
                                count--;
                                if (count == 0) processFKs();
                            });
                        }
                    });
                })
            } catch (e) {
                reject(e);
            }
        });
    
    }
    
    
    async function disconnect() {
        if (pool == null) return;
        return new Promise((resolve, reject) => {
            pool.end(function (err) {
                pool = null;
                if (err) {
                    reject(err);
                } else {
                    resolve(err);
                }
            });
        });
    }
    
    
    const invTypes = {
        "0": "DECIMAL",
        "1": "TINY",
        "2": "SHORT",
        "3": "LONG",
        "4": "FLOAT",
        "5": "DOUBLE",
        "6": "NULL",
        "7": "TIMESTAMP",
        "8": "LONGLONG",
        "9": "INT24",
        "10": "DATE",
        "11": "TIME",
        "12": "DATETIME",
        "13": "YEAR",
        "14": "NEWDATE",
        "15": "VARCHAR",
        "16": "BIT",
        "17": "TIMESTAMP2",
        "18": "DATETIME2",
        "19": "TIME2",
        "245": "JSON",
        "246": "NEWDECIMAL",
        "247": "ENUM",
        "248": "SET",
        "249": "TINY_BLOB",
        "250": "MEDIUM_BLOB",
        "251": "LONG_BLOB",
        "252": "BLOB",
        "253": "VAR_STRING",
        "254": "STRING",
        "255": "GEOMETRY"
    }
    
    async function queryDB(sql) {
        function formatResults(results, fields) {
            for (let i = 0; i < results.length; i++) {
                let tuple = results[i];
                let array = [];
                for (let j = 0; j < fields.length; j++) {
                    array.push(tuple[fields[j].name]);
                }
                results[i] = array;
            }
            let f = [];
            for (let i = 0; i < fields.length; i++) {
                let t = "unknown";
                switch (fields[i].type) {
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                    case 4:
                    case 5:
                    case 6:
                    case 8:
                    case 9:
                    case 13:
                    case 16:
                    case 246:
                        t = "number";
                        break;
                    case 10:
                    case 14:
                        t = "date";
                        break;
                    case 11:
                    case 19:
                        t = "time";
                        break;
                    case 7:
                    case 12:
                    case 17:
                    case 18:
                        t = "datetime";
                        break;
                    default:
                        t = "string";
                }
                let d = {
                    name: fields[i].name,
                    internal: fields[i],
                    internalType: invTypes[fields[i].type],
                    format: { type: t, length: fields[i].length }
                };
                f.push(d);
            }
            return {
                rowCount: results.length,
                rows: results,
                fields: f
            }
        }
        return new Promise((resolve, reject) => {
            try {
                if (pool == null) throw new Error('DB not connected');
                pool.getConnection((err, conn) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    conn.beginTransaction(function (err) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        conn.query(sql, function (err, results, fields) {
                            if (err) {
                                conn.rollback(function () {
                                    reject(err);
                                });
                                return;
                            }
                            let ret = formatResults(results, fields);
                            conn.rollback(function () {
                                resolve(ret);
                            });
                        });
                    });
                });
            } catch (e) {
                reject(e);
            }
        });
    }
    

    return new Promise((resolve, reject) => {
        try {
            pool = mysql.createPool(confmysql);
            pool.query('SELECT 1', function (error) {
                if (error) {
                    reject(error);
                } else {
                    pool.schema=confmysql.database;
                    resolve({ createDBModel, disconnect, query: queryDB });
                }
            })
        } catch (e) {
            reject(e);
        }
    });
}



module.exports = { connect }