// deprecated

const { Connection, types: PGTypes, Pool } = require('pg');

async function connect(conf) {
    let pool = null;

    let temp = new Pool({
        user: conf.user,
        host: conf.host,
        database: conf.database,
        password: conf.password,
        port: parseInt("" + conf.port),
        schema: conf.schema
    })
    temp.schema = conf.schema;
    await temp.query("SELECT 1");
    pool = temp;

    async function createDBModel() {
        if (pool == null) throw new Error('DB not connected');
        let schema = pool.schema;
    
        function defcolumn(def) {
            let ret = {};
            ret.name = def.column_name;
            ret.bounds = {};
            ret.type = def.data_type;
            ret.js = ret.type;
            switch (def.data_type) {
                case "integer":
                case "numeric":
                case "smallint":
                case "double precision":
                    ret.js = 'number';
                    break;
                case "varchar":
                case "character":
                case "character varying":
                    ret.js = "string";
                    ret.bounds.length = def.character_maximum_length;
                    break;
                case "text":
                    ret.js = "string";
                    ret.bounds.length = def.character_octet_length / 4;
                    break;
                case "boolean":
                case "bit":
                    ret.js = "boolean";
                    break;
                default:
                    if (def.data_type.indexOf("timestamp") !== -1) {
                        ret.js = "date";
                    } else {
                        ret.js = "unknown";
                    }
            }
            ret.nullable = (def.is_nullable == "YES");
            ret.auto = (def.column_default != null && def.column_default.startsWith('nextval('));
            ret.pk = (def.constraint_type == "PRIMARY KEY");
            ret.unique = ret.pk || (def.constraint_type == "UNIQUE");
            return ret;
        }
    
        let model = {};
        let tables = await pool.query(`SELECT table_name
        FROM information_schema.tables
        WHERE table_schema=$1
         AND table_type='BASE TABLE';`, [schema]);
        for (let i = 0; i < tables.rows.length; i++) {
            model[tables.rows[i]["table_name"]] = {};
        }
        for (let k in model) {
            let table = await pool.query(`SELECT tc.constraint_type, ic.column_name, ic.data_type, ic.is_nullable, ic.column_default, ic.character_maximum_length, ic.character_octet_length
            FROM information_schema.constraint_column_usage ccu JOIN information_schema.table_constraints tc
            ON ccu.constraint_schema=tc.constraint_schema AND ccu.constraint_name=tc.constraint_name 
            RIGHT OUTER JOIN information_schema.columns ic ON tc.table_schema=ic.table_schema AND tc.table_name=ic.table_name AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE') AND ccu.column_name=ic.column_name 
            WHERE ic.table_schema = $1
            AND ic.table_name   = $2`, [schema, k]);
            for (let i = 0; i < table.rows.length; i++) {
                model[k][table.rows[i]["column_name"]] = defcolumn(table.rows[i]);
            }
        }
        for (let k in model) {
            let fk = await pool.query(`SELECT
                tc.constraint_name, 
                kcu.column_name, 
                ccu.table_schema AS foreign_table_schema,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
              AND kcu.constraint_name = tc.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            JOIn information_schema.columns AS cs
            ON cs.column_name=ccu.column_name AND cs.table_name=ccu.table_name AND cs.table_schema=ccu.table_schema
            AND kcu.ordinal_position=cs.ordinal_position
            WHERE tc.table_schema=$1 AND tc.constraint_type = 'FOREIGN KEY' AND kcu.table_name=$2`, [schema, k]);
            for (let i = 0; i < fk.rows.length; i++) {
                let row = fk.rows[i];
                model[k][row["column_name"]].fk = { table: row["foreign_table_name"], column: row["foreign_column_name"] };
            }
        }
        return model;
    }
    
    
    async function disconnect() {
        if (pool == null) return;
        await pool.end();
        pool = null;
    }
    
    
    const invTypes = {
        "16": "BOOL",
        "17": "BYTEA",
        "18": "CHARACTER",
        "20": "INT8",
        "21": "SMALLINT",
        "23": "INT4",
        "24": "REGPROC",
        "25": "TEXT",
        "26": "OID",
        "27": "TID",
        "28": "XID",
        "29": "CID",
        "114": "JSON",
        "142": "XML",
        "194": "PG_NODE_TREE",
        "210": "SMGR",
        "602": "PATH",
        "604": "POLYGON",
        "650": "CIDR",
        "700": "FLOAT4",
        "701": "DOUBLE PRECISION",
        "702": "ABSTIME",
        "703": "RELTIME",
        "704": "TINTERVAL",
        "718": "CIRCLE",
        "774": "MACADDR8",
        "790": "MONEY",
        "829": "MACADDR",
        "869": "INET",
        "1033": "ACLITEM",
        "1042": "CHARACTER",
        "1043": "CHARACTER VARYING",
        "1082": "DATE",
        "1083": "TIME",
        "1114": "TIMESTAMP",
        "1184": "TIMESTAMPTZ",
        "1186": "INTERVAL",
        "1266": "TIMETZ",
        "1560": "BIT",
        "1562": "VARBIT",
        "1700": "NUMERIC",
        "1790": "REFCURSOR",
        "2202": "REGPROCEDURE",
        "2203": "REGOPER",
        "2204": "REGOPERATOR",
        "2205": "REGCLASS",
        "2206": "REGTYPE",
        "2950": "UUID",
        "2970": "TXID_SNAPSHOT",
        "3220": "PG_LSN",
        "3361": "PG_NDISTINCT",
        "3402": "PG_DEPENDENCIES",
        "3614": "TSVECTOR",
        "3615": "TSQUERY",
        "3642": "GTSVECTOR",
        "3734": "REGCONFIG",
        "3769": "REGDICTIONARY",
        "3802": "JSONB",
        "4089": "REGNAMESPACE",
        "4096": "REGROLE"
    }
    
    async function queryDB(sql) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let ret = await client.query({
                text: sql,
                rowMode: 'array'
            });
            let fields = [];
            for (let i = 0; i < ret.fields.length; i++) {
                let hint;
                switch (ret.fields[i].dataTypeID) {
                    case 20:
                    case 21:
                    case 23:
                    case 700:
                    case 701:
                    case 790:
                    case 1560:
                    case 1562:
                    case 1700:
                        hint = "number";
                        break;
                    case 1082:
                        hint = "date";
                        break;
                    case 1083:
                    case 1266:
                        hint = "time";
                        break;
                    case 702:
                    case 703:
                    case 1114:
                    case 1184:
                        hint = "datetime";
                        break;
                    default:
                        hint = "string";
                }
                fields.push({
                    name: ret.fields[i].name,
                    internal: ret.fields[i],
                    internalType: invTypes[ret.fields[i].dataTypeID],
                    format: { type: hint }
                });
            }
            await client.query("ROLLBACK"); // do not commit whatever was in sql
            return {
                rowCount: ret.rowCount,
                rows: ret.rows,
                fields: fields
            };
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    return { createDBModel, disconnect, query: queryDB }
}




module.exports = {connect}