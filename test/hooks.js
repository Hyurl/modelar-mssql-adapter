var DB = require("modelar").DB;

after(function () {
    DB.close(); // closes all connections.
});
