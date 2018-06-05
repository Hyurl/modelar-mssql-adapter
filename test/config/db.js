var DB = require("modelar").DB;
var MssqlAdapter = require("../../").default;

module.exports = {
    type: "mssql",
    database: "modelar",
    host: "127.0.0.1",
    port: 1433,
    user: "sa",
    password: "Password12!"
};

DB.setAdapter("mssql", MssqlAdapter);
DB.init(module.exports);