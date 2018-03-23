# Modelar-Mssql-Adapter

**This is an adapter for [Modelar](https://github.com/hyurl/modelar) to**
**connect MicroSoft SQL Server database.**

## Install

```sh
npm install modelar-mssql-adapter --save
```

The above command will install the latest version for Modelar 3.0+, if you're 
using Modelar 2.X, use the following command instead:

```sh
npm install modelar-mssql-adapter --tag modelar2 --save
```

## How To Use

```javascript
const { DB } = require("modelar");
const { MssqlAdapter } = require("modelar-mssql-adapter");

DB.setAdapter("mssql", MssqlAdapter).init({
    type: "mssql",
    database: "modelar",
    host: "127.0.0.1",
    port: 1433,
    user: "sa",
    password: "******"
});
```