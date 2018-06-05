# Modelar-Mssql-Adapter

**This is an adapter for [Modelar](https://github.com/hyurl/modelar) to**
**connect MicroSoft SQL Server database.**

## Install

```sh
npm install modelar-mssql-adapter --save
```

## How To Use

```javascript
const { DB } = require("modelar");
const { MssqlAdapter } = require("modelar-mssql-adapter");

DB.setAdapter("mssql", MssqlAdapter);

// then use type 'mssql' in db.config
DB.init({
    type: "mssql",
    database: "modelar",
    host: "127.0.0.1",
    port: 1433,
    user: "sa",
    password: "******"
});
```

## A Tip

Since [node-mssql](https://github.com/tediousjs/node-mssql) doesn't provide 
methods to manually close and release a pooled connection (it handles 
internally), calling `db.close()` and `db.release()` would not work as 
expected, but that doesn't matter, this adapter still works fine with Modelar
in most cases, you just need to terminate all connections by calling 
`DB.close()` when you're going to exit your program.