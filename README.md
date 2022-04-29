# sqlite3Explorer

sqlite3 Explorer is a simple graphical editor for sqlite3 databases. The visual approach to the schema representation makes it easy to see the relationships between the tables, and keep a global overview of the schema.

![sqlite3 Explorer screenshot](https://github.com/GrolauxDonatien/sqlite3Explorer/blob/main/screenshot.png?raw=true)

The main window is a schema editor. Right-click brings a context menu to add, edit, or delete relevant items. The edited schema is, in fact, independent of any actual database. For example, it can be incomplete and a table may not have any column definition yet. Also, there is no data associated to the schema definition, no SQL query. The `File` menu works on the schema level, saving its definition in a file using a JSON notation. 

![Schema synchronization](https://github.com/GrolauxDonatien/sqlite3Explorer/blob/main/resync.png?raw=true)

However sqlite3Explorer is able to synchronize the edited schema to a SQLite3 database. This is achieved by the `Database` menu. The typical workflow would be to start by `Import Schema from SQLite3 DB` to import its schema into the editor, then modify this schema, and push the edits back to the database by using `Resync with database`. This option computes a diff between the actual schema of the database, and the schema in the editor. For each difference between these schemas, the dialog box allows deciding which one to keep. If you just want to propagate the schema from the editor to the database, just click on the `Auto update external DB` button, and then `Proceed`. A transformation SQL script is created, and `Apply Action...` finally updates the SQLite3 database.

![Update SQL script](https://github.com/GrolauxDonatien/sqlite3Explorer/blob/main/updatesql.png?raw=true)

For convenience, once a schema has been imported from an actual database, sqlite3Explorer provides a SQL query builder, an editor to modify the lines of the tables, and a console for running arbitrary SQL commands.

![Query Builder](https://github.com/GrolauxDonatien/sqlite3Explorer/blob/main/querybuilder.png?raw=true)
![Database Editor](https://github.com/GrolauxDonatien/sqlite3Explorer/blob/main/dbeditor.png?raw=true)
![SQL Console](https://github.com/GrolauxDonatien/sqlite3Explorer/blob/main/console.png?raw=true)
