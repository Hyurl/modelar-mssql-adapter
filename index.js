const mssql = require("mssql");
const { ConnectionPool, Transaction } = mssql;
const { Adapter } = require("modelar");
const Pools = {};

class MssqlAdapter extends Adapter {
    constructor() {
        super();
        this.backquote = "[]";
        this.oldcon = null;
        this._transaction = null;
    }

    /** Methods for DB */

    connect(db) {
        return new Promise((resolve, reject) => {
            if (Pools[db._dsn] === undefined) {
                var config = Object.assign({}, db._config);
                config.server = config.host;
                config.connectionTimeout = config.timeout;
                config.requestTimeout = config.timeout;
                config.pool = {
                    max: config.max,
                    min: 0,
                    idleTimeoutMillis: config.timeout
                };
                var pool = new ConnectionPool(config, err => {
                    if (err) {
                        reject(err);
                    } else {
                        Pools[db._dsn] = pool;
                        this.connection = pool.request();
                        resolve(db);
                    }
                });
            } else {
                this.connection = Pools[db._dsn].request();
                resolve(db);
            }
        });
    }

    query(db, sql, bindings) {
        if (this.connection === null) {
            return this.connect(db).then(db => {
                return this.query(db, sql, bindings);
            });
        }
        for (let i in bindings) {
            sql = sql.replace("?", `@param${i}`);
            this.connection.input(`param${i}`, bindings[i]);
        }
        return this.connection.query(sql).then(res => {
            if (res.rowsAffected) {
                db.affectedRows = res.rowsAffected;
            }
            if (res.recordset) {
                if (res.recordsets && res.recordsets.length === 1) {
                    db._data = res.recordset;
                } else {
                    db._data = res.recordsets;
                }
            }
            return db;
        }).then(db => {
            if (db._command == "insert") {
                return this.connection.query("select @@identity as insertId")
                    .then(res => {
                        db.insertId = res.recordset[0].insertId;
                        return db;
                    });
            } else {
                return db;
            }
        });
    }

    transaction(db, callback = null) {
        this._transaction = new Transaction(Pools[db._dsn]);
        var promise = this._transaction.begin().then(() => {
            this.oldcon = this.connection;
            this.connection = new mssql.Request(this._transaction);
            return db;
        });
        if (typeof callback == "function") {
            return promise.then(db => {
                return callback.call(db, db);
            }).then(db => {
                return this.commit();
            }).catch(err => {
                return this.rollback().then(db => {
                    throw err;
                });
            });
        } else {
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

    closeAll() {
        for (let i in Pools) {
            Pools[i].close();
            delete Pools[i];
        }
    }

    /** Methods for Table */

    getDDL(table) {
        var numbers = ["int", "integer"],
            columns = [],
            foreigns = [],
            primary,
            autoIncrement,
            sql;

        for (let field of table._fields) {
            if (field.primary && field.autoIncrement) {
                if (!numbers.includes(field.type.toLowerCase())) {
                    field.type = "int";
                }
                autoIncrement = " identity(" + field.autoIncrement.join(",") + ")";
                field.length = 0;
            } else {
                autoIncrement = null;
            }
            if (field.length instanceof Array) {
                field.length = field.length.join(",");
            }
            if (field.length)
                field.type += "(" + field.length + ")";

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
            };
            columns.push(column);
        }

        sql = "create table " + table.backquote(table._table) +
            " (\n\t" + columns.join(",\n\t");

        if (primary)
            sql += ",\n\tprimary key(" + table.backquote(primary) + ")";

        if (foreigns.length)
            sql += ",\n\t" + foreigns.join(",\n\t");

        sql += "\n)";

        return sql;
    }

    /** Methods for Query */

    random(query) {
        query._orderBy = "NewId()";
        return query;
    }

    limit(query, length, offset = 0) {
        if (offset === 0) {
            query._limit = length;
        } else {
            query._limit = [offset, length];
        }
        return query;
    }

    getSelectSQL(query) {
        var isCount = (/count\(distinct\s\S+\)/i).test(query._selects),
            orderBy = query._orderBy ? `order by ${query._orderBy}` : "",
            paginated = query._limit instanceof Array,
            sql = "select ";

        if (query._limit && !paginated)
            sql += `top ${query._limit} `;

        sql += (query._distinct && !isCount ? "distinct " : "") + `${query._selects}`;

        if (paginated)
            sql += ", row_number() over(" + (orderBy || "order by [id]") + ") rn";

        sql += " from " +
            (!query._join ? query.backquote(query._table) : "") +
            query._join +
            (query._where ? " where " + query._where : "");

        if (!paginated && orderBy)
            sql += ` ${orderBy}`;

        sql += (query._groupBy ? " group by " + query._groupBy : "") +
            (query._having ? " having " + query._having : "");

        if (paginated)
            sql = `select * from (${sql}) tmp where tmp.rn > ${query._limit[0]} and tmp.rn <= ${query._limit[0] + query._limit[1]}`;
        
        if (query._union)
            sql += ` union ${query._union}`;
        return sql;
    }
}

module.exports = new MssqlAdapter;