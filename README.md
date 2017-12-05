# Modelar-Mssql-Adapter

**This is an adapter for [Modelar](http://modelar.hyurl.com) to connect**
**MicroSoft SQL Server database.**

## Install

```sh
npm install modelar-mssql-adapter
```

## How To Use

```javascript
const { DB } = require("modelar");
const MssqlAdapter = require("modelar-mssql-adapter");

DB.setAdapter("mssql", MssqlAdapter).init({
    type: "mssql",
    database: "modelar",
    host: "127.0.0.1",
    port: 1433,
    user: "sa",
    password: "******"
});
```