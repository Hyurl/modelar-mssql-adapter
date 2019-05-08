"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var modelar_1 = require("modelar");
var mssql_1 = require("mssql");
var assign = require("lodash/assign");
var MssqlAdapter = (function (_super) {
    tslib_1.__extends(MssqlAdapter, _super);
    function MssqlAdapter() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.backquote = "[]";
        return _this;
    }
    MssqlAdapter.prototype.connect = function (db) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (MssqlAdapter.Pools[db.dsn] === undefined) {
                var config = void 0;
                if (db.config["connectionString"]) {
                    config = db.config["connectionString"];
                }
                else {
                    config = assign({}, db.config);
                    config.server = db.config.host;
                    config.connectionTimeout = db.config.timeout;
                    config.requestTimeout = db.config.timeout;
                    config.pool = {
                        max: db.config.max,
                        min: 0,
                        idleTimeoutMillis: db.config.timeout
                    };
                }
                var pool = new mssql_1.ConnectionPool(config, function (err) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        MssqlAdapter.Pools[db.dsn] = pool;
                        _this.connection = pool.request();
                        resolve(db);
                    }
                });
            }
            else {
                _this.connection = MssqlAdapter.Pools[db.dsn].request();
                resolve(db);
            }
        });
    };
    MssqlAdapter.prototype.query = function (db, sql, bindings) {
        var _this = this;
        for (var i in bindings) {
            sql = sql.replace("?", "@param" + i);
            this.connection.input("param" + i, bindings[i]);
        }
        return this.connection.query(sql).then(function (res) {
            if (res.rowsAffected) {
                db.affectedRows = res.rowsAffected.length;
            }
            if (res.recordset) {
                if (res.recordsets && res.recordsets.length === 1) {
                    db.data = res.recordset;
                    for (var i in db.data) {
                        delete db.data[i]["_rn"];
                    }
                }
                else {
                    db.data = res.recordsets;
                }
            }
            return db;
        }).then(function (db) {
            if (db.command == "insert") {
                return _this.connection.query("select @@identity as insertId")
                    .then(function (res) {
                    db.insertId = res.recordset[0].insertId;
                    return db;
                });
            }
            else {
                return db;
            }
        });
    };
    MssqlAdapter.prototype.transaction = function (db, cb) {
        var _this = this;
        this._transaction = new mssql_1.Transaction(MssqlAdapter.Pools[db.dsn]);
        var promise = this._transaction.begin().then(function () {
            _this.oldcon = _this.connection;
            _this.connection = new mssql_1.Request(_this._transaction);
            return db;
        });
        if (typeof cb == "function") {
            return promise.then(function (db) {
                var res = cb.call(db, db);
                if (res.then instanceof Function) {
                    return res.then(function () { return db; });
                }
                else {
                    return db;
                }
            }).then(function (db) {
                return _this.commit(db);
            }).catch(function (err) {
                return _this.rollback(db).then(function () {
                    throw err;
                });
            });
        }
        else {
            return promise;
        }
    };
    MssqlAdapter.prototype.commit = function (db) {
        var _this = this;
        return this._transaction.commit().then(function () {
            _this.connection = _this.oldcon;
            _this.oldcon = null;
            return db;
        });
    };
    MssqlAdapter.prototype.rollback = function (db) {
        var _this = this;
        return this._transaction.rollback().then(function () {
            _this.connection = _this.oldcon;
            _this.oldcon = null;
            return db;
        });
    };
    MssqlAdapter.prototype.release = function () {
        this.connection = null;
    };
    MssqlAdapter.prototype.close = function () {
        this.connection = null;
    };
    MssqlAdapter.close = function () {
        for (var i in MssqlAdapter.Pools) {
            MssqlAdapter.Pools[i].close();
            delete MssqlAdapter.Pools[i];
        }
    };
    MssqlAdapter.prototype.getDDL = function (table) {
        var numbers = ["int", "integer"];
        var columns = [];
        var foreigns = [];
        var primary;
        var autoIncrement;
        for (var key in table.schema) {
            var field = table.schema[key];
            if (field.primary && field.autoIncrement) {
                if (numbers.indexOf(field.type.toLowerCase()) === -1) {
                    field.type = "int";
                }
                autoIncrement = " identity(" + field.autoIncrement.toString() + ")";
                field.length = 0;
            }
            else {
                autoIncrement = null;
            }
            var type = field.type;
            if (field.length instanceof Array) {
                type += "(" + field.length.join(",") + ")";
            }
            else if (field.length) {
                type += "(" + field.length + ")";
            }
            var column = table.backquote(field.name) + " " + type;
            if (autoIncrement)
                column += autoIncrement;
            if (field.primary)
                primary = field.name;
            if (field.unique)
                column += " unique";
            if (field.unsigned)
                column += " unsigned";
            if (field.notNull)
                column += " not null";
            if (field.default === null)
                column += " default null";
            else if (field.default !== undefined)
                column += " default " + table.quote(field.default);
            if (field.comment)
                column += " comment " + table.quote(field.comment);
            if (field.foreignKey && field.foreignKey.table) {
                var foreign = "constraint " + table.backquote(field.name + "_frk")
                    + (" foreign key (" + table.backquote(field.name) + ")")
                    + " references " + table.backquote(field.foreignKey.table)
                    + " (" + table.backquote(field.foreignKey.field) + ")"
                    + " on delete " + field.foreignKey.onDelete
                    + " on update " + field.foreignKey.onUpdate;
                foreigns.push(foreign);
            }
            ;
            columns.push(column);
        }
        var sql = "create table " + table.backquote(table.name)
            + " (\n  " + columns.join(",\n  ");
        if (primary)
            sql += ",\n  primary key (" + table.backquote(primary) + ")";
        if (foreigns.length)
            sql += ",\n  " + foreigns.join(",\n  ");
        return sql += "\n)";
    };
    MssqlAdapter.prototype.random = function (query) {
        query["_orderBy"] = "NewId()";
        return query;
    };
    MssqlAdapter.prototype.limit = function (query, length, offset) {
        if (!offset) {
            query["_limit"] = length;
        }
        else {
            query["_limit"] = [offset, length];
        }
        return query;
    };
    MssqlAdapter.prototype.getSelectSQL = function (query) {
        var selects = query["_selects"];
        var distinct = query["_distinct"];
        var join = query["_join"];
        var where = query["_where"];
        var orderBy = query["_orderBy"];
        var groupBy = query["_groupBy"];
        var having = query["_having"];
        var union = query["_union"];
        var limit = query["_limit"];
        var isCount = (/count\(distinct\s\S+\)/i).test(selects);
        var paginated = limit instanceof Array;
        var sql = "select ";
        distinct = distinct && !isCount ? "distinct " : "";
        where = where ? " where " + where : "";
        orderBy = orderBy ? "order by " + orderBy : "";
        groupBy = groupBy ? " group by " + groupBy : "";
        having = having ? " having " + having : "";
        union = union ? " union " + union : "";
        if (limit && !paginated)
            sql += "top " + limit + " ";
        sql += distinct + selects;
        if (paginated)
            sql += ", row_number() over(" + (orderBy || "order by @@identity") + ") [_rn]";
        sql += " from " +
            (!join ? query.backquote(query.table) : "") + join + where;
        sql += groupBy + having + union;
        if (!paginated && orderBy)
            sql += " " + orderBy;
        if (paginated) {
            sql = "select * from (" + sql + ") tmp where tmp.[_rn] > " + limit[0] + " and tmp.[_rn] <= " + (limit[0] + limit[1]);
        }
        return sql;
    };
    MssqlAdapter.Pools = {};
    return MssqlAdapter;
}(modelar_1.Adapter));
exports.MssqlAdapter = MssqlAdapter;
exports.default = MssqlAdapter;
//# sourceMappingURL=index.js.map