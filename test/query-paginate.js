var assert = require("assert");
var DB = require("modelar").DB;
var Query = require("modelar").Query;
var config = require("./config/db");
var co = require("co");

describe("Query.prototype.paginate()", function () {
    it("should get paginated users that suit the given condition", function (done) {
        var db = new DB(config),
            query = new Query("users").use(db),
            query2 = new Query("users").use(db),
            data = {
                name: "Ayon Lee",
                email: "i@hyurl.com",
                password: "123456",
                age: 20,
                score: 90
            },
            ids = [];

        co(function* () {
            for (var i = 0; i < 20; i++) {
                yield query.insert(data);
                ids.push(query.insertId);
            }

            var res = yield query.whereIn("id", ids).orderBy("id").limit(10).paginate(1);
            assert.equal(query.sql, 'select top 10 * from [users] where [id] in (' + Array(20).fill("?").join(", ") + ') order by [id]');

            var _data = Array(10).fill({});
            for (var i in _data) {
                _data[i] = Object.assign({
                    id: res.data[0].id + parseInt(i)
                }, data);
            }
            assert.deepStrictEqual(res, {
                page: 1,
                pages: 2,
                limit: 10,
                total: 20,
                data: _data
            });

            var res2 = yield query2.whereIn("id", ids).orderBy("id").paginate(3, 5);
            assert.equal(query2.sql, 'select * from (select *, row_number() over(order by [id]) [_rn] from [users] where [id] in (' + Array(20).fill("?").join(", ") + ')) tmp where tmp.[_rn] > 10 and tmp.[_rn] <= 15');

            var _data = Array(5).fill({});
            for (var i in _data) {
                _data[i] = Object.assign({
                    id: res2.data[0].id + parseInt(i)
                }, data);
            }
            assert.deepStrictEqual(res2, {
                page: 3,
                pages: 4,
                limit: 5,
                total: 20,
                data: _data
            });
        }).then(function () {
            db.close();
            done();
        }).catch(function (err) {
            db.close();
            done(err);
        });
    });
});