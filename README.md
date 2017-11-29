# Modelar-Postgres-Adapter

**This is an adapter for [Modelar](http://modelar.hyurl.com) to connect**
**MicroSoft SQL Server database.**

## Install

```sh
npm install modelar-mssql-adpater
```

## How To Use

```javascript
const { DB } = require("modelar");
const MssqlAdapter = require("modelar-mssql-adpater");

DB.setAdapter("mssql", MssqlAdapter).init({
    type: "mssql",
    database: "modelar",
    host: "127.0.0.1",
    port: 1433,
    user: "sa",
    password: "******"
});
```