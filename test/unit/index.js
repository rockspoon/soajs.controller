"use strict";

describe("Starting Gateway Unit test", function () {
    it("Init unit test", function (done) {
        done();
    });

    after(function (done) {
        require("./lib/param.js");
        require("./lib/ip.js");
        require("./lib/http.js");
        done();
    });
});