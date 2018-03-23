"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const modelar_1 = require("modelar");
const mssql_1 = require("mssql");
class MssqlAdapter extends modelar_1.Adapter {
    constructor() {
        super(...arguments);
        this.backquote = "[]";
    }
    connect(db) {
        return new Promise((resolve, reject) => {
            if (MssqlAdapter.Pools[db.dsn] === undefined) {
                let config = Object.assign({}, db.config);
                config.server = db.config.host;
                config.connectionTimeout = db.config.timeout;
                config.requestTimeout = db.config.timeout;
                config.pool = {
                    max: db.config.max,
                    min: 0,
                    idleTimeoutMillis: db.config.timeout
                };
                var pool = new mssql_1.ConnectionPool(config, err => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        MssqlAdapter.Pools[db.dsn] = pool;
                        this.connection = pool.request();
                        resolve(db);
                    }
                });
            }
            else {
                this.connection = MssqlAdapter.Pools[db.dsn].request();
                resolve(db);
            }
        });
    }
    query(db, sql, bindings) {
        for (let i in bindings) {
            sql = sql.replace("?", `@param${i}`);
            this.connection.input(`param${i}`, bindings[i]);
        }
        return this.connection.query(sql).then(res => {
            if (res.rowsAffected) {
                db.affectedRows = res.rowsAffected.length;
            }
            if (res.recordset) {
                if (res.recordsets && res.recordsets.length === 1) {
                    db.data = res.recordset;
                }
                else {
                    db.data = res.recordsets;
                }
            }
            return db;
        }).then(db => {
            if (db.command == "insert") {
                return this.connection.query("select @@identity as insertId")
                    .then(res => {
                    db.insertId = res.recordset[0].insertId;
                    return db;
                });
            }
            else {
                return db;
            }
        });
    }
    transaction(db, cb) {
        this._transaction = new mssql_1.Transaction(MssqlAdapter.Pools[db.dsn]);
        var promise = this._transaction.begin().then(() => {
            this.oldcon = this.connection;
            this.connection = new mssql_1.Request(this._transaction);
            return db;
        });
        if (typeof cb == "function") {
            return promise.then(db => {
                let res = cb.call(db, db);
                if (res.then instanceof Function) {
                    return res.then(() => db);
                }
                else {
                    return db;
                }
            }).then(db => {
                return this.commit(db);
            }).catch(err => {
                return this.rollback(db).then(() => {
                    throw err;
                });
            });
        }
        else {
            return promise;
        }
    }
    commit(db) {
        return this._transaction.commit().then(() => {
            this.connection = this.oldcon;
            this.oldcon = null;
            return db;
        });
    }
    rollback(db) {
        return this._transaction.rollback().then(() => {
            this.connection = this.oldcon;
            this.oldcon = null;
            return db;
        });
    }
    release() {
        this.connection = null;
    }
    close() { }
    static close() {
        for (let i in MssqlAdapter.Pools) {
            MssqlAdapter.Pools[i].close();
            delete MssqlAdapter.Pools[i];
        }
    }
    getDDL(table) {
        let numbers = ["int", "integer"];
        let columns = [];
        let foreigns = [];
        let primary;
        let autoIncrement;
        for (let key in table.schema) {
            let field = table.schema[key];
            if (field.primary && field.autoIncrement) {
                if (!numbers.includes(field.type.toLowerCase())) {
                    field.type = "int";
                }
                autoIncrement = " identity(" + field.autoIncrement.toString() + ")";
                field.length = 0;
            }
            else {
                autoIncrement = null;
            }
            if (field.length instanceof Array) {
                field.type += "(" + field.length.join(",") + ")";
            }
            else if (field.length) {
                field.type += "(" + field.length + ")";
            }
            let column = table.backquote(field.name) + " " + field.type;
            if (autoIncrement)
                column += autoIncrement;
            if (field.primary)
                primary = field.name;
            if (field.default === null)
                column += " default null";
            else if (field.default !== undefined)
                column += " default " + table.quote(field.default);
            if (field.notNull)
                column += " not null";
            if (field.unsigned)
                column += " unsigned";
            if (field.unique)
                column += " unique";
            if (field.comment)
                column += " comment " + table.quote(field.comment);
            if (field.foreignKey.table) {
                let foreign = `foreign key (${table.backquote(field.name)})` +
                    " references " + table.backquote(field.foreignKey.table) +
                    " (" + table.backquote(field.foreignKey.field) + ")" +
                    " on delete " + field.foreignKey.onDelete +
                    " on update " + field.foreignKey.onUpdate;
                foreigns.push(foreign);
            }
            ;
            columns.push(column);
        }
        let sql = "create table " + table.backquote(table.name) +
            " (\n\t" + columns.join(",\n\t");
        if (primary)
            sql += ",\n\tprimary key(" + table.backquote(primary) + ")";
        if (foreigns.length)
            sql += ",\n\t" + foreigns.join(",\n\t");
        return sql += "\n)";
    }
    random(query) {
        query["_orderBy"] = "NewId()";
        return query;
    }
    limit(query, length, offset) {
        if (!offset) {
            query["_limit"] = length;
        }
        else {
            query["_limit"] = [offset, length];
        }
        return query;
    }
    getSelectSQL(query) {
        let selects = query["_selects"];
        let distinct = query["_distinct"];
        let join = query["_join"];
        let where = query["_where"];
        let orderBy = query["_orderBy"];
        let groupBy = query["_groupBy"];
        let having = query["_having"];
        let union = query["_union"];
        let limit = query["_limit"];
        let isCount = (/count\(distinct\s\S+\)/i).test(selects);
        let paginated = limit instanceof Array;
        let sql = "select ";
        distinct = distinct && !isCount ? "distinct " : "";
        where = where ? ` where ${where}` : "";
        orderBy = orderBy ? `order by ${orderBy}` : "";
        groupBy = groupBy ? ` group by ${groupBy}` : "";
        having = having ? ` having ${having}` : "";
        union = union ? ` union ${union}` : "";
        if (limit && !paginated)
            sql += `top ${limit} `;
        sql += distinct + selects;
        if (paginated)
            sql += ", row_number() over(" + (orderBy || "order by [id]") + ") _rn";
        sql += " from " +
            (!join ? query.backquote(query.table) : "") + join + where;
        if (!paginated && orderBy)
            sql += ` ${orderBy}`;
        sql += groupBy + having;
        if (paginated) {
            sql = `select * from (${sql}) tmp where tmp._rn > ${limit[0]} and tmp._rn <= ${limit[0] + limit[1]}`;
        }
        return sql += union;
    }
    static get MssqlAdapter() {
        return MssqlAdapter;
    }
}
MssqlAdapter.Pools = {};
exports.MssqlAdapter = MssqlAdapter;
//# sourceMappingURL=index.js.map