'use strict';

const soajsRes = require("./response.js");

/**
 *
 * @param configuration
 * @returns {Function}
 */
module.exports = (configuration) => {
    return (req, res, next) => {
        if (!req.soajs) {
            req.soajs = {};
        }
        req.soajs.buildResponse = function (error, data) {
            let response = null;
            if (error) {
                response = new soajsRes(false);
                if (Array.isArray(error)) {
                    let len = error.length;
                    for (let i = 0; i < len; i++) {
                        response.addErrorCode(error[i].code, error[i].msg);
                    }
                }
                else {
                    response.addErrorCode(error.code, error.msg);
                }
            }
            else {
                response = new soajsRes(true, data);
            }

            return response;
        };
        if (configuration && configuration.controllerResponse) {
            req.soajs.controllerResponse = function (jsonObj) {
                if (req.soajs.buildResponse && jsonObj.code && jsonObj.msg)
                    jsonObj = req.soajs.buildResponse(jsonObj);


                let headObj = jsonObj.headObj || {};
                headObj['Content-Type'] = 'application/json';
                if (jsonObj.status)
                    res.writeHead(jsonObj.status, headObj);
                else
                    res.writeHead(200, headObj);

                res.end(JSON.stringify(jsonObj));
            };
        }
        return next();
    };
};

