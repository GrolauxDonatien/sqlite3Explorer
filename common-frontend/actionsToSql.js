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

let defaults={}
for(let k in types) {
    for(let k2 in types[k]) {
        for(let i=0; i<types[k][k2].length; i++) {
            defaults[types[k][k2][i]]=(k=="text"?`""`:"0");
        }
    }
}

function schemaToSql(schema) {
    let warnings=[];
    let tables=[];
    for(let table in schema) {
        let dependencies=[];
        let str=[];
        let pks=[];
        for(let column in schema[table]) {
            if (column.endsWith("___")) continue;
            let col=`  ${schema[table][column].name} ${schema[table][column].internalType.toUpperCase()}`;
            if (schema[table][column].pk) {
                pks.push(column);
                if (schema[table][column].internalType=="integer" && !schema[table][column].auto) {
                    warnings.push(`${table}.${column} is forced to be autogenarated because it is integer primary key.`);
                }
            }
            if (!schema[table][column].nullable) {
                let idx=schema[table][column].internalType.indexOf('(');
                let type=(idx==-1?schema[table][column].internalType:schema[table][column].internalType.substring(0,idx))
                col+=` NOT NULL DEFAULT ${defaults[type]}`;
            }
            if (schema[table][column].unique) col+=" UNIQUE";
            if (schema[table][column].auto) {
                if (schema[table][column].internalType!="integer" || !schema[table][column].pk) {
                    warnings.push(`${table}.${column} cannot be auto (integer primary key required).`);
                }
            }
            str.push(col);
        }
        if(pks.length>0) {
            str.push(`  PRIMAY KEY (${pks.join(', ')})`);
        }
        for(let column in schema[table]) {
            if (column.endsWith("___")) continue;
            if ('fk' in schema[table][column]) {
                if (dependencies.indexOf(schema[table][column].fk.table)==-1) {
                    if (table==schema[table][column].fk.table) continue;
                    dependencies.push(schema[table][column].fk.table);
                }
                str.push(`  FOREIGN KEY (${column}) REFERENCES ${schema[table][column].fk.table} (${schema[table][column].fk.column})`)
            }
        }
        debugger;
        tables.push({
            name:table,
            sql:`CREATE TABLE ${table} (
`+str.join(',\n')+`
);`,
            dependencies
        })
    }
    let str=[];
    let defined={};
    if (tables.length>1) { // for multiples tables creation, create them in order according to their dependencies
        while(tables.length>0) {
            let done=false;
            for(let i=0; i<tables.length; i++) {
                let dep=tables[i].dependencies;
                for(let j=dep.length-1; j>=0; j--) {
                    if (dep[j] in defined) dep.splice(j,1);
                }
                if (dep.length==0) {
                    defined[tables[i].name]=true; // mark as defined
                    str.push(tables[i].sql);
                    tables.splice(i,1);
                    done=true;
                    break;
                }
            }
            if (!done) {
                let warning="Could not create these tables because of their dependencies (FK):";
                for(let i=0; i<tables.length; i++) {
                    warning+=tables[i].name+" ";
                }
                warnings.push(warning);
                break;
            }
        }
    } else { // for a single table, do not bother with its dependencies
        str.push(tables[0].sql);
    }

    return {
        warnings,
        sql:str.join('\n\n')
    }
}

function updateSchema(oldschema,diff) {
    let warnings=[];
    let str=[];
    let error=false;
    let destructive=false;
    function fixFKs(tables,oldname,newname) {
        // a table has been renamed, fix all FKs that reference that table
        for(let table in tables) {
            for(let column in tables[table].def) {
                if ("fk" in tables[table].def[column] && tables[table].def[column].table==oldname) {
                    tables[table].def[column].table=newname;
                }
            }
            for(let i=0; i<tables[table].ops.length; i++) {
                if (tables[table].ops[i][0]=="createFK" && tables[table].ops[i][3]==oldname) {
                    tables[table].ops[i][3]=newname;
                }
            }
        }
    }
    try {
        let newTables={}, oldTables={};
        //step 1: split changes according to edit existing tables and add new tables
        for (let i = 0; i < diff.length; i++) {
            let cmd = diff[i];
            if (cmd[0]=="createTable") {
                if (cmd[0] in oldTables || cmd[0] in oldschema) {
                    warnings.push(`Cannot create ${table} because it already exists`);
                    error=true;
                } else {
                    newTables[cmd[1]]={def:{},ops:[]};
                }
            } else { // first parameter is always the table to work on
                if (cmd[1] in newTables) {
                    if (cmd[0]=="renameTable") {
                        newTables[cmd[2]]=newTables[cmd[1]];
                        delete newTables[cmd[1]];
                        // new tables are created with their renamed name directly, other tables should use the final name immediately
                        fixFKs(newTables,cmd[1],cmd[2]);
                        fixFKs(oldTables,cmd[1],cmd[2]);
                    } else {
                        newTables[cmd[1]].ops.push(cmd);
                    }
                }  else if (cmd[1] in schema) {
                    if (cmd[1] in oldTables) {
                        oldTables[cmd[1]].ops.push(cmd);
                    } else {
                        oldTables[cmd[1]]={
                            def:schema[cmd[1]],
                            ops:[cmd]
                        }    
                    }
                    // nothing to do for renames: new tables are created before existing ones, so they don't have to update their FKs yet
                } else {
                    warnings.push(`Cannot ${cmd[0]} on ${cmd[1]} because it is unknown`);
                    error=true;
                }
            }
        }
        function processTable(table, def) {
            let needsRecreate=false;
            let tableSchema={};
            let sql=[];
            for(let k in def.def) tableSchema[k]=def.def[k];

            for(let i=0; i<def.ops.length; i++) {
                ({
                    renameColumn(column,newname) {
                        if (newname in tableSchema) {
                            warnings.push(`Cannot rename ${table}.${column} to ${newname} because it already exists`);
                            error=true;
                        } else {
                            // requires SQLite 3 version 3.25+
                            sql.push(`ALTER TABLE ${table} RENAME COLUMN ${column} TO ${newname};`);
                            tableSchema[newname]=tableSchema[column];
                            delete tableSchema[column];    
                        }
                    },
                    editColumn(column,def) {
                        if (column!=def.name && (def.name in tableSchema)) {
                            warnings.push(`Cannot rename ${table}.${column} to ${newname} because it already exists`);
                            error=true;
                        } else {
                            // not possible to edit a column definition with SQLite 3
                            needsRecreate=true;
                            let fk=null;
                            if ("fk" in tableSchema[column] && !("fk" in def)) def.fk=tableSchema[column][fk];
                            delete tableSchema[column];
                            tableSchema[def.name]=def;
                        }
                    },
                    deleteColumn(column) {
                        // not possible to edit a column definition with SQLite 3
                        needsRecreate=true;
                        if (!(column in tableSchema)) {
                            warnings.push(`Cannot delete ${table}.${column} because it does not exists`);
                            error=true;
                        } else {
                            // not possible to drop a column definition with SQLite 3
                            needsRecreate=true;
                            delete tableSchema[column];
                        }
                    },
                    addColumn(def) {
                        if (def.name in tableSchema) {
                            warnings.push(`Cannot add column ${table}.${column} because it already exists`);
                            error=true;
                        }
                        tableSchema[def.name]=def;
                        if (def.auto || def.pk || def.unique) {
                            // SQLLite 3 does not support add such columns
                            needsRecreate=true;
                        } else {
                            let col=`ALTER TABLE ${table} ADD COLUMN ${def.name}`;
                            if (!def.nullable) {
                                let idx=def.internalType.indexOf('(');
                                let type=(idx==-1?def.internalType:def.internalType.substring(0,idx))
                                col+=` NOT NULL DEFAULT ${defaults[type]}`;
                            }
                            sql.push(col+";");
                        }
                    }, 
                    renameTable(newname) {
                        if (newname in newTables || newname in oldTables) {
                            warnings.push(`Cannot rename table ${table} because it already exists`);
                            error=true;
                        } else {
                            sql.push(`ALTER TABLE ${table} RENAME TO ${newname};`);
                            oldTables[newname]=oldTables[table];
                            delete oldTables[table];
                            table=newname;
                        }
                    },
                    deleteTable() {
                        if (!(table in newTables || table in oldTables)) {
                            warnings.push(`Cannot delete table ${table} because it does not exists`);
                            error=true;
                        } else {
                            sql.push(`DROP TABLE ${table};`);
                            if (table in newTables) {
                                delete newTables[table];
                            } else {
                                delete oldTables[table];
                            }
                        }
                    },
                    deleteFK(column) {
                        if (!("fk" in tableSchema[column])) {
                            warnings.push(`Cannot delete FK on ${table}.${column} because it does not exists`);
                            error=true;
                        } else {
                            needsRecreate=true;
                            delete tableSchema[column].fk;
                        }
                    },
                    createFK(column, fktable, fkcolumn) {
                        needsRecreate=true;
                        tableSchema[column].fk={table:fktable, column:fkcolumn};
                    }
                })[def.ops[i][0]].apply(null,def.ops[i].slice(2));
            }
            return {
                needsRecreate,
                sql,
                originalSchema:def.def,
                tableSchema
            }
        }

        for(let table in newTables) {
            newTables[table]=processTable(table,newTables[table]);
        }

        for(let table in oldTables) {
            oldTables[table]=processTable(table,oldTables[table]);
        }

        let tables=[];
        let idx=0;
        for(table in newTables) {
            let fmt=schemaToSql({[table]:newTables[table].tableSchema});
            warnings.push.apply(warnings,fmt.warnings);
            let dependencies=[];
            for(let column in newTables[table].tableSchema) {
                if("fk" in newTables[table].tableSchema[column] && newTables[table].tableSchema[column].fk.table!=table) {
                    let tgt=newTables[table].tableSchema[column].fk.table;
                    if (tgt in newTables) dependencies.push(tgt);
                }
            }
            tables[idx]={
                sql:fmt.sql,
                dependencies
            }
        }

        let defined={};
        while(tables.length>0) {
            let done=false;
            for(let i=0; i<tables.length; i++) {
                let dep=tables[i].dependencies;
                for(let j=dep.length-1; j>=0; j--) {
                    if (dep[j] in defined) dep.splice(j,1);
                }
                if (dep.length==0) {
                    defined[tables[i].name]=true; // mark as defined
                    str.push(tables[i].sql);
                    tables.splice(i,1);
                    done=true;
                    break;
                }
            }
            if (!done) {
                let warning="Could not create these tables because of their dependencies (FK):";
                for(let i=0; i<tables.length; i++) {
                    warning+=tables[i].name+" ";
                }
                warnings.push(warning);
                break;
            }
        }

        for(table in oldTables) {
            if (oldTables[table].needsRecreate) {
                let fmt=schemaToSql({["___"+table+"_tmp"]:oldTables[table].tableSchema});
                let cols=[];
                for(let k in oldTables[table].originalSchema) {
                    if (k.endsWith("___")) continue;
                    if (k in oldTables[table].tableSchema) cols.push(k);
                }
                str.push(`PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;
${fmt.sql}
INSERT INTO ${"___"+table+"_tmp"} SELECT ${cols.join(', ')} FROM ${table};
DROP TABLE ${table};
ALTER TABLE ${"___"+table+"_tmp"} RENAME TO ${table};
COMMIT;
PRAGMA foreign_keys = ON;
`);
            }
        }

        for(table in oldTables) {
            if (!oldTables[table].needsRecreate) {
                str.push(oldTables[table].sql.join('\n'));
            }
        }


        console.log(JSON.stringify(newTables));
        console.log(JSON.stringify(oldTables));


    } catch (e) {
        console.error(e);
        throw e;
    }
    return {
        warnings,
        destructive,
        error,
        sql:str.join('\n\n')
    }
}

let schema={"artists":{"ArtistId":{"name":"ArtistId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Name":{"name":"Name","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(120)","type":"nvarchar","bounds":{"length":120},"format":"string"},"coords___":{"width":151.8671875,"height":62.6484375,"x":830.255859375,"y":684.6806640625,"columns":{"ArtistId":{"x":832.255859375,"y":708.3427734375,"width":151.8671875,"height":15.662109375},"Name":{"x":832.255859375,"y":724.0048828125,"width":151.8671875,"height":15.662109375}}}},"customers":{"CustomerId":{"name":"CustomerId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"FirstName":{"name":"FirstName","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"LastName":{"name":"LastName","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(20)","type":"nvarchar","bounds":{"length":20},"format":"string"},"Company":{"name":"Company","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(80)","type":"nvarchar","bounds":{"length":80},"format":"string"},"Address":{"name":"Address","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(70)","type":"nvarchar","bounds":{"length":70},"format":"string"},"City":{"name":"City","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"State":{"name":"State","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"Country":{"name":"Country","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"PostalCode":{"name":"PostalCode","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(10)","type":"nvarchar","bounds":{"length":10},"format":"string"},"Phone":{"name":"Phone","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(24)","type":"nvarchar","bounds":{"length":24},"format":"string"},"Fax":{"name":"Fax","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(24)","type":"nvarchar","bounds":{"length":24},"format":"string"},"Email":{"name":"Email","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(60)","type":"nvarchar","bounds":{"length":60},"format":"string"},"SupportRepId":{"name":"SupportRepId","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"employees","column":"EmployeeId"}},"coords___":{"width":189.2529296875,"height":234.931640625,"x":289.9013671875,"y":10,"columns":{"CustomerId":{"x":291.9013671875,"y":33.662109375,"width":189.2529296875,"height":15.662109375},"FirstName":{"x":291.9013671875,"y":49.32421875,"width":189.2529296875,"height":15.662109375},"LastName":{"x":291.9013671875,"y":64.986328125,"width":189.2529296875,"height":15.662109375},"Company":{"x":291.9013671875,"y":80.6484375,"width":189.2529296875,"height":15.662109375},"Address":{"x":291.9013671875,"y":96.310546875,"width":189.2529296875,"height":15.662109375},"City":{"x":291.9013671875,"y":111.97265625,"width":189.2529296875,"height":15.662109375},"State":{"x":291.9013671875,"y":127.634765625,"width":189.2529296875,"height":15.662109375},"Country":{"x":291.9013671875,"y":143.296875,"width":189.2529296875,"height":15.662109375},"PostalCode":{"x":291.9013671875,"y":158.958984375,"width":189.2529296875,"height":15.662109375},"Phone":{"x":291.9013671875,"y":174.62109375,"width":189.2529296875,"height":15.662109375},"Fax":{"x":291.9013671875,"y":190.283203125,"width":189.2529296875,"height":15.662109375},"Email":{"x":291.9013671875,"y":205.9453125,"width":189.2529296875,"height":15.662109375},"SupportRepId":{"x":291.9013671875,"y":221.607421875,"width":189.2529296875,"height":15.662109375}}}},"employees":{"EmployeeId":{"name":"EmployeeId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"LastName":{"name":"LastName","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(20)","type":"nvarchar","bounds":{"length":20},"format":"string"},"FirstName":{"name":"FirstName","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(20)","type":"nvarchar","bounds":{"length":20},"format":"string"},"Title":{"name":"Title","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(30)","type":"nvarchar","bounds":{"length":30},"format":"string"},"ReportsTo":{"name":"ReportsTo","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"employees","column":"EmployeeId"}},"BirthDate":{"name":"BirthDate","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"datetime","type":"datetime","bounds":{},"format":"date"},"HireDate":{"name":"HireDate","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"datetime","type":"datetime","bounds":{},"format":"date"},"Address":{"name":"Address","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(70)","type":"nvarchar","bounds":{"length":70},"format":"string"},"City":{"name":"City","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"State":{"name":"State","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"Country":{"name":"Country","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"PostalCode":{"name":"PostalCode","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(10)","type":"nvarchar","bounds":{"length":10},"format":"string"},"Phone":{"name":"Phone","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(24)","type":"nvarchar","bounds":{"length":24},"format":"string"},"Fax":{"name":"Fax","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(24)","type":"nvarchar","bounds":{"length":24},"format":"string"},"Email":{"name":"Email","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(60)","type":"nvarchar","bounds":{"length":60},"format":"string"},"coords___":{"width":186.9013671875,"height":266.255859375,"x":579.154296875,"y":10,"columns":{"EmployeeId":{"x":581.154296875,"y":33.662109375,"width":186.9013671875,"height":15.662109375},"LastName":{"x":581.154296875,"y":49.32421875,"width":186.9013671875,"height":15.662109375},"FirstName":{"x":581.154296875,"y":64.986328125,"width":186.9013671875,"height":15.662109375},"Title":{"x":581.154296875,"y":80.6484375,"width":186.9013671875,"height":15.662109375},"ReportsTo":{"x":581.154296875,"y":96.310546875,"width":186.9013671875,"height":15.662109375},"BirthDate":{"x":581.154296875,"y":111.97265625,"width":186.9013671875,"height":15.662109375},"HireDate":{"x":581.154296875,"y":127.634765625,"width":186.9013671875,"height":15.662109375},"Address":{"x":581.154296875,"y":143.296875,"width":186.9013671875,"height":15.662109375},"City":{"x":581.154296875,"y":158.958984375,"width":186.9013671875,"height":15.662109375},"State":{"x":581.154296875,"y":174.62109375,"width":186.9013671875,"height":15.662109375},"Country":{"x":581.154296875,"y":190.283203125,"width":186.9013671875,"height":15.662109375},"PostalCode":{"x":581.154296875,"y":205.9453125,"width":186.9013671875,"height":15.662109375},"Phone":{"x":581.154296875,"y":221.607421875,"width":186.9013671875,"height":15.662109375},"Fax":{"x":581.154296875,"y":237.26953125,"width":186.9013671875,"height":15.662109375},"Email":{"x":581.154296875,"y":252.931640625,"width":186.9013671875,"height":15.662109375}}}},"genres":{"GenreId":{"name":"GenreId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Name":{"name":"Name","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(120)","type":"nvarchar","bounds":{"length":120},"format":"string"},"coords___":{"width":153.4462890625,"height":62.6484375,"x":576.037109375,"y":805.16015625,"columns":{"GenreId":{"x":578.037109375,"y":828.822265625,"width":153.4462890625,"height":15.662109375},"Name":{"x":578.037109375,"y":844.484375,"width":153.4462890625,"height":15.662109375}}}},"invoices":{"InvoiceId":{"name":"InvoiceId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"CustomerId":{"name":"CustomerId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"customers","column":"CustomerId"}},"InvoiceDate":{"name":"InvoiceDate","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"datetime","type":"datetime","bounds":{},"format":"date"},"BillingAddress":{"name":"BillingAddress","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(70)","type":"nvarchar","bounds":{"length":70},"format":"string"},"BillingCity":{"name":"BillingCity","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"BillingState":{"name":"BillingState","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"BillingCountry":{"name":"BillingCountry","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"BillingPostalCode":{"name":"BillingPostalCode","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(10)","type":"nvarchar","bounds":{"length":10},"format":"string"},"Total":{"name":"Total","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"numeric(10,2)","type":"numeric","bounds":{"slice_0":10,"slice_1":2,"length":12},"format":"number"},"coords___":{"width":224.2529296875,"height":172.283203125,"x":272.4013671875,"y":294.931640625,"columns":{"InvoiceId":{"x":274.4013671875,"y":318.59375,"width":224.2529296875,"height":15.662109375},"CustomerId":{"x":274.4013671875,"y":334.255859375,"width":224.2529296875,"height":15.662109375},"InvoiceDate":{"x":274.4013671875,"y":349.91796875,"width":224.2529296875,"height":15.662109375},"BillingAddress":{"x":274.4013671875,"y":365.580078125,"width":224.2529296875,"height":15.662109375},"BillingCity":{"x":274.4013671875,"y":381.2421875,"width":224.2529296875,"height":15.662109375},"BillingState":{"x":274.4013671875,"y":396.904296875,"width":224.2529296875,"height":15.662109375},"BillingCountry":{"x":274.4013671875,"y":412.56640625,"width":224.2529296875,"height":15.662109375},"BillingPostalCode":{"x":274.4013671875,"y":428.228515625,"width":224.2529296875,"height":15.662109375},"Total":{"x":274.4013671875,"y":443.890625,"width":224.2529296875,"height":15.662109375}}}},"invoice_items":{"InvoiceLineId":{"name":"InvoiceLineId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"InvoiceId":{"name":"InvoiceId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"invoices","column":"InvoiceId"}},"TrackId":{"name":"TrackId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"tracks","column":"TrackId"}},"UnitPrice":{"name":"UnitPrice","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"numeric(10,2)","type":"numeric","bounds":{"slice_0":10,"slice_1":2,"length":12},"format":"number"},"Quantity":{"name":"Quantity","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"coords___":{"width":185.36328125,"height":109.634765625,"x":291.84619140625,"y":517.21484375,"columns":{"InvoiceLineId":{"x":293.84619140625,"y":540.876953125,"width":185.36328125,"height":15.662109375},"InvoiceId":{"x":293.84619140625,"y":556.5390625,"width":185.36328125,"height":15.662109375},"TrackId":{"x":293.84619140625,"y":572.201171875,"width":185.36328125,"height":15.662109375},"UnitPrice":{"x":293.84619140625,"y":587.86328125,"width":185.36328125,"height":15.662109375},"Quantity":{"x":293.84619140625,"y":603.525390625,"width":185.36328125,"height":15.662109375}}}},"media_types":{"MediaTypeId":{"name":"MediaTypeId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Name":{"name":"Name","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(120)","type":"nvarchar","bounds":{"length":120},"format":"string"},"coords___":{"width":183.0185546875,"height":62.6484375,"x":10,"y":731.6669921875,"columns":{"MediaTypeId":{"x":12,"y":755.3291015625,"width":183.0185546875,"height":15.662109375},"Name":{"x":12,"y":770.9912109375,"width":183.0185546875,"height":15.662109375}}}},"playlists":{"PlaylistId":{"name":"PlaylistId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Name":{"name":"Name","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(120)","type":"nvarchar","bounds":{"length":120},"format":"string"},"coords___":{"width":158.880859375,"height":62.6484375,"x":563.96826171875,"y":899.1328125,"columns":{"PlaylistId":{"x":565.96826171875,"y":922.794921875,"width":158.880859375,"height":15.662109375},"Name":{"x":565.96826171875,"y":938.45703125,"width":158.880859375,"height":15.662109375}}}},"playlist_track":{"PlaylistId":{"name":"PlaylistId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"playlists","column":"PlaylistId"}},"TrackId":{"name":"TrackId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"tracks","column":"TrackId"}},"coords___":{"width":158.880859375,"height":62.6484375,"x":305.08740234375,"y":899.1328125,"columns":{"PlaylistId":{"x":307.08740234375,"y":922.794921875,"width":158.880859375,"height":15.662109375},"TrackId":{"x":307.08740234375,"y":938.45703125,"width":158.880859375,"height":15.662109375}}}},"tracks":{"TrackId":{"name":"TrackId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Name":{"name":"Name","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(200)","type":"nvarchar","bounds":{"length":200},"format":"string"},"AlbumId":{"name":"AlbumId","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"albums","column":"AlbumId"}},"MediaTypeId":{"name":"MediaTypeId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"media_types","column":"MediaTypeId"}},"GenreId":{"name":"GenreId","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"genres","column":"GenreId"}},"Composer":{"name":"Composer","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(220)","type":"nvarchar","bounds":{"length":220},"format":"string"},"Milliseconds":{"name":"Milliseconds","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Bytes":{"name":"Bytes","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"UnitPrice":{"name":"UnitPrice","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"numeric(10,2)","type":"numeric","bounds":{"slice_0":10,"slice_1":2,"length":12},"format":"number"},"coords___":{"x":293.0185546875,"y":676.849609375,"columns":{"TrackId":{"x":295.0185546875,"y":700.51171875,"width":183.0185546875,"height":15.662109375},"Name":{"x":295.0185546875,"y":716.173828125,"width":183.0185546875,"height":15.662109375},"AlbumId":{"x":295.0185546875,"y":731.8359375,"width":183.0185546875,"height":15.662109375},"MediaTypeId":{"x":295.0185546875,"y":747.498046875,"width":183.0185546875,"height":15.662109375},"GenreId":{"x":295.0185546875,"y":763.16015625,"width":183.0185546875,"height":15.662109375},"Composer":{"x":295.0185546875,"y":778.822265625,"width":183.0185546875,"height":15.662109375},"Milliseconds":{"x":295.0185546875,"y":794.484375,"width":183.0185546875,"height":15.662109375},"Bytes":{"x":295.0185546875,"y":810.146484375,"width":183.0185546875,"height":15.662109375},"UnitPrice":{"x":295.0185546875,"y":825.80859375,"width":183.0185546875,"height":15.662109375}},"width":183.0185546875,"height":172.283203125}},"albums":{"AlbumId":{"name":"AlbumId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Title":{"name":"Title","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(160)","type":"nvarchar","bounds":{"length":160},"format":"string"},"ArtistId":{"name":"ArtistId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"artists","column":"ArtistId"}},"coords___":{"x":576.037109375,"y":676.849609375,"width":154.21875,"height":78.310546875,"columns":{"AlbumId":{"x":578.037109375,"y":700.51171875,"width":154.21875,"height":15.662109375},"Title":{"x":578.037109375,"y":716.173828125,"width":154.21875,"height":15.662109375},"ArtistId":{"x":578.037109375,"y":731.8359375,"width":154.21875,"height":15.662109375}}}}}
let oldschema={"albums":{"AlbumId":{"name":"AlbumId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Title":{"name":"Title","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(160)","type":"nvarchar","bounds":{"length":160},"format":"string"},"ArtistId":{"name":"ArtistId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"artists","column":"ArtistId"}},"coords___":{"width":154.21875,"height":78.310546875,"x":576.037109375,"y":676.849609375,"columns":{"AlbumId":{"x":578.037109375,"y":700.51171875,"width":154.21875,"height":15.662109375},"Title":{"x":578.037109375,"y":716.173828125,"width":154.21875,"height":15.662109375},"ArtistId":{"x":578.037109375,"y":731.8359375,"width":154.21875,"height":15.662109375}}}},"artists":{"ArtistId":{"name":"ArtistId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Name":{"name":"Name","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(120)","type":"nvarchar","bounds":{"length":120},"format":"string"},"coords___":{"width":151.8671875,"height":62.6484375,"x":830.255859375,"y":684.6806640625,"columns":{"ArtistId":{"x":832.255859375,"y":708.3427734375,"width":151.8671875,"height":15.662109375},"Name":{"x":832.255859375,"y":724.0048828125,"width":151.8671875,"height":15.662109375}}}},"customers":{"CustomerId":{"name":"CustomerId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"FirstName":{"name":"FirstName","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"LastName":{"name":"LastName","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(20)","type":"nvarchar","bounds":{"length":20},"format":"string"},"Company":{"name":"Company","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(80)","type":"nvarchar","bounds":{"length":80},"format":"string"},"Address":{"name":"Address","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(70)","type":"nvarchar","bounds":{"length":70},"format":"string"},"City":{"name":"City","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"State":{"name":"State","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"Country":{"name":"Country","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"PostalCode":{"name":"PostalCode","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(10)","type":"nvarchar","bounds":{"length":10},"format":"string"},"Phone":{"name":"Phone","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(24)","type":"nvarchar","bounds":{"length":24},"format":"string"},"Fax":{"name":"Fax","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(24)","type":"nvarchar","bounds":{"length":24},"format":"string"},"Email":{"name":"Email","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(60)","type":"nvarchar","bounds":{"length":60},"format":"string"},"SupportRepId":{"name":"SupportRepId","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"employees","column":"EmployeeId"}},"coords___":{"width":189.2529296875,"height":234.931640625,"x":289.9013671875,"y":10,"columns":{"CustomerId":{"x":291.9013671875,"y":33.662109375,"width":189.2529296875,"height":15.662109375},"FirstName":{"x":291.9013671875,"y":49.32421875,"width":189.2529296875,"height":15.662109375},"LastName":{"x":291.9013671875,"y":64.986328125,"width":189.2529296875,"height":15.662109375},"Company":{"x":291.9013671875,"y":80.6484375,"width":189.2529296875,"height":15.662109375},"Address":{"x":291.9013671875,"y":96.310546875,"width":189.2529296875,"height":15.662109375},"City":{"x":291.9013671875,"y":111.97265625,"width":189.2529296875,"height":15.662109375},"State":{"x":291.9013671875,"y":127.634765625,"width":189.2529296875,"height":15.662109375},"Country":{"x":291.9013671875,"y":143.296875,"width":189.2529296875,"height":15.662109375},"PostalCode":{"x":291.9013671875,"y":158.958984375,"width":189.2529296875,"height":15.662109375},"Phone":{"x":291.9013671875,"y":174.62109375,"width":189.2529296875,"height":15.662109375},"Fax":{"x":291.9013671875,"y":190.283203125,"width":189.2529296875,"height":15.662109375},"Email":{"x":291.9013671875,"y":205.9453125,"width":189.2529296875,"height":15.662109375},"SupportRepId":{"x":291.9013671875,"y":221.607421875,"width":189.2529296875,"height":15.662109375}}}},"employees":{"EmployeeId":{"name":"EmployeeId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"LastName":{"name":"LastName","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(20)","type":"nvarchar","bounds":{"length":20},"format":"string"},"FirstName":{"name":"FirstName","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(20)","type":"nvarchar","bounds":{"length":20},"format":"string"},"Title":{"name":"Title","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(30)","type":"nvarchar","bounds":{"length":30},"format":"string"},"ReportsTo":{"name":"ReportsTo","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"employees","column":"EmployeeId"}},"BirthDate":{"name":"BirthDate","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"datetime","type":"datetime","bounds":{},"format":"date"},"HireDate":{"name":"HireDate","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"datetime","type":"datetime","bounds":{},"format":"date"},"Address":{"name":"Address","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(70)","type":"nvarchar","bounds":{"length":70},"format":"string"},"City":{"name":"City","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"State":{"name":"State","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"Country":{"name":"Country","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"PostalCode":{"name":"PostalCode","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(10)","type":"nvarchar","bounds":{"length":10},"format":"string"},"Phone":{"name":"Phone","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(24)","type":"nvarchar","bounds":{"length":24},"format":"string"},"Fax":{"name":"Fax","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(24)","type":"nvarchar","bounds":{"length":24},"format":"string"},"Email":{"name":"Email","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(60)","type":"nvarchar","bounds":{"length":60},"format":"string"},"coords___":{"width":186.9013671875,"height":266.255859375,"x":579.154296875,"y":10,"columns":{"EmployeeId":{"x":581.154296875,"y":33.662109375,"width":186.9013671875,"height":15.662109375},"LastName":{"x":581.154296875,"y":49.32421875,"width":186.9013671875,"height":15.662109375},"FirstName":{"x":581.154296875,"y":64.986328125,"width":186.9013671875,"height":15.662109375},"Title":{"x":581.154296875,"y":80.6484375,"width":186.9013671875,"height":15.662109375},"ReportsTo":{"x":581.154296875,"y":96.310546875,"width":186.9013671875,"height":15.662109375},"BirthDate":{"x":581.154296875,"y":111.97265625,"width":186.9013671875,"height":15.662109375},"HireDate":{"x":581.154296875,"y":127.634765625,"width":186.9013671875,"height":15.662109375},"Address":{"x":581.154296875,"y":143.296875,"width":186.9013671875,"height":15.662109375},"City":{"x":581.154296875,"y":158.958984375,"width":186.9013671875,"height":15.662109375},"State":{"x":581.154296875,"y":174.62109375,"width":186.9013671875,"height":15.662109375},"Country":{"x":581.154296875,"y":190.283203125,"width":186.9013671875,"height":15.662109375},"PostalCode":{"x":581.154296875,"y":205.9453125,"width":186.9013671875,"height":15.662109375},"Phone":{"x":581.154296875,"y":221.607421875,"width":186.9013671875,"height":15.662109375},"Fax":{"x":581.154296875,"y":237.26953125,"width":186.9013671875,"height":15.662109375},"Email":{"x":581.154296875,"y":252.931640625,"width":186.9013671875,"height":15.662109375}}}},"genres":{"GenreId":{"name":"GenreId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Name":{"name":"Name","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(120)","type":"nvarchar","bounds":{"length":120},"format":"string"},"coords___":{"width":153.4462890625,"height":62.6484375,"x":576.037109375,"y":805.16015625,"columns":{"GenreId":{"x":578.037109375,"y":828.822265625,"width":153.4462890625,"height":15.662109375},"Name":{"x":578.037109375,"y":844.484375,"width":153.4462890625,"height":15.662109375}}}},"invoices":{"InvoiceId":{"name":"InvoiceId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"CustomerId":{"name":"CustomerId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"customers","column":"CustomerId"}},"InvoiceDate":{"name":"InvoiceDate","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"datetime","type":"datetime","bounds":{},"format":"date"},"BillingAddress":{"name":"BillingAddress","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(70)","type":"nvarchar","bounds":{"length":70},"format":"string"},"BillingCity":{"name":"BillingCity","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"BillingState":{"name":"BillingState","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"BillingCountry":{"name":"BillingCountry","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(40)","type":"nvarchar","bounds":{"length":40},"format":"string"},"BillingPostalCode":{"name":"BillingPostalCode","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(10)","type":"nvarchar","bounds":{"length":10},"format":"string"},"Total":{"name":"Total","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"numeric(10,2)","type":"numeric","bounds":{"slice_0":10,"slice_1":2,"length":12},"format":"number"},"coords___":{"width":224.2529296875,"height":172.283203125,"x":272.4013671875,"y":294.931640625,"columns":{"InvoiceId":{"x":274.4013671875,"y":318.59375,"width":224.2529296875,"height":15.662109375},"CustomerId":{"x":274.4013671875,"y":334.255859375,"width":224.2529296875,"height":15.662109375},"InvoiceDate":{"x":274.4013671875,"y":349.91796875,"width":224.2529296875,"height":15.662109375},"BillingAddress":{"x":274.4013671875,"y":365.580078125,"width":224.2529296875,"height":15.662109375},"BillingCity":{"x":274.4013671875,"y":381.2421875,"width":224.2529296875,"height":15.662109375},"BillingState":{"x":274.4013671875,"y":396.904296875,"width":224.2529296875,"height":15.662109375},"BillingCountry":{"x":274.4013671875,"y":412.56640625,"width":224.2529296875,"height":15.662109375},"BillingPostalCode":{"x":274.4013671875,"y":428.228515625,"width":224.2529296875,"height":15.662109375},"Total":{"x":274.4013671875,"y":443.890625,"width":224.2529296875,"height":15.662109375}}}},"invoice_items":{"InvoiceLineId":{"name":"InvoiceLineId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"InvoiceId":{"name":"InvoiceId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"invoices","column":"InvoiceId"}},"TrackId":{"name":"TrackId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"tracks","column":"TrackId"}},"UnitPrice":{"name":"UnitPrice","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"numeric(10,2)","type":"numeric","bounds":{"slice_0":10,"slice_1":2,"length":12},"format":"number"},"Quantity":{"name":"Quantity","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"coords___":{"width":185.36328125,"height":109.634765625,"x":291.84619140625,"y":517.21484375,"columns":{"InvoiceLineId":{"x":293.84619140625,"y":540.876953125,"width":185.36328125,"height":15.662109375},"InvoiceId":{"x":293.84619140625,"y":556.5390625,"width":185.36328125,"height":15.662109375},"TrackId":{"x":293.84619140625,"y":572.201171875,"width":185.36328125,"height":15.662109375},"UnitPrice":{"x":293.84619140625,"y":587.86328125,"width":185.36328125,"height":15.662109375},"Quantity":{"x":293.84619140625,"y":603.525390625,"width":185.36328125,"height":15.662109375}}}},"media_types":{"MediaTypeId":{"name":"MediaTypeId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Name":{"name":"Name","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(120)","type":"nvarchar","bounds":{"length":120},"format":"string"},"coords___":{"width":183.0185546875,"height":62.6484375,"x":10,"y":731.6669921875,"columns":{"MediaTypeId":{"x":12,"y":755.3291015625,"width":183.0185546875,"height":15.662109375},"Name":{"x":12,"y":770.9912109375,"width":183.0185546875,"height":15.662109375}}}},"playlists":{"PlaylistId":{"name":"PlaylistId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Name":{"name":"Name","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(120)","type":"nvarchar","bounds":{"length":120},"format":"string"},"coords___":{"width":158.880859375,"height":62.6484375,"x":563.96826171875,"y":899.1328125,"columns":{"PlaylistId":{"x":565.96826171875,"y":922.794921875,"width":158.880859375,"height":15.662109375},"Name":{"x":565.96826171875,"y":938.45703125,"width":158.880859375,"height":15.662109375}}}},"playlist_track":{"PlaylistId":{"name":"PlaylistId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"playlists","column":"PlaylistId"}},"TrackId":{"name":"TrackId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"tracks","column":"TrackId"}},"coords___":{"width":158.880859375,"height":62.6484375,"x":305.08740234375,"y":899.1328125,"columns":{"PlaylistId":{"x":307.08740234375,"y":922.794921875,"width":158.880859375,"height":15.662109375},"TrackId":{"x":307.08740234375,"y":938.45703125,"width":158.880859375,"height":15.662109375}}}},"tracks":{"TrackId":{"name":"TrackId","nullable":false,"auto":true,"pk":true,"unique":true,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Name":{"name":"Name","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(200)","type":"nvarchar","bounds":{"length":200},"format":"string"},"AlbumId":{"name":"AlbumId","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"albums","column":"AlbumId"}},"MediaTypeId":{"name":"MediaTypeId","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"media_types","column":"MediaTypeId"}},"GenreId":{"name":"GenreId","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number","fk":{"table":"genres","column":"GenreId"}},"Composer":{"name":"Composer","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"nvarchar(220)","type":"nvarchar","bounds":{"length":220},"format":"string"},"Milliseconds":{"name":"Milliseconds","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"Bytes":{"name":"Bytes","nullable":true,"auto":false,"pk":false,"unique":false,"internalType":"integer","type":"integer","bounds":{},"format":"number"},"UnitPrice":{"name":"UnitPrice","nullable":false,"auto":false,"pk":false,"unique":false,"internalType":"numeric(10,2)","type":"numeric","bounds":{"slice_0":10,"slice_1":2,"length":12},"format":"number"},"coords___":{"x":293.0185546875,"y":676.849609375,"width":183.0185546875,"height":172.283203125,"columns":{"TrackId":{"x":295.0185546875,"y":700.51171875,"width":183.0185546875,"height":15.662109375},"Name":{"x":295.0185546875,"y":716.173828125,"width":183.0185546875,"height":15.662109375},"AlbumId":{"x":295.0185546875,"y":731.8359375,"width":183.0185546875,"height":15.662109375},"MediaTypeId":{"x":295.0185546875,"y":747.498046875,"width":183.0185546875,"height":15.662109375},"GenreId":{"x":295.0185546875,"y":763.16015625,"width":183.0185546875,"height":15.662109375},"Composer":{"x":295.0185546875,"y":778.822265625,"width":183.0185546875,"height":15.662109375},"Milliseconds":{"x":295.0185546875,"y":794.484375,"width":183.0185546875,"height":15.662109375},"Bytes":{"x":295.0185546875,"y":810.146484375,"width":183.0185546875,"height":15.662109375},"UnitPrice":{"x":295.0185546875,"y":825.80859375,"width":183.0185546875,"height":15.662109375}}}}}

let diff=[
    [
        "editColumn",
        "tracks",
        "Bytes",
        {
            "name": "Bytes",
            "nullable": true,
            "auto": false,
            "pk": false,
            "unique": true,
            "internalType": "integer",
            "type": "integer",
            "bounds": {},
            "format": "number"
        }
    ],
    [
        "deleteColumn",
        "tracks",
        "UnitPrice"
    ],
    [
        "createTable",
        "test",
        10,
        10
    ],
    [
        "addColumn",
        "test",
        {
            "name": "Name",
            "nullable": true,
            "auto": false,
            "pk": false,
            "unique": false,
            "internalType": "nvarchar(120)",
            "type": "nvarchar",
            "bounds": {
                "length": 120
            },
            "format": "string"
        },
        1
    ],
    [
        "deleteTable",
        "albums"
    ],
    [
        "deleteFK",
        "tracks",
        "AlbumId"
    ]
];

/*let result=schemaToSql(schema);
console.log(result.warnings);
console.log(result.sql);*/

let result=updateSchema(oldschema,[]);
console.log(JSON.stringify(result.warnings));
console.log(JSON.stringify({error:result.error, destructive:result.destructive}));
console.log(result.sql);