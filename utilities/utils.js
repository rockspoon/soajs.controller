'use strict';

const coreModules = require("soajs.core.modules");
let core = coreModules.core;

//-------------------------- ERROR Handling MW - service & controller
/**
 *
 * @param err
 * @param req
 * @param res
 * @param next
 */
function logErrors(err, req, res, next) {
	if (typeof err === "number") {
		req.soajs.log.error(core.error.generate(err));
		return next(err);
	}
	if (typeof err === "object") {
		if (err.code && err.message) {
			req.soajs.log.error(err);
			return next({"code": err.code, "msg": err.message});
		}
		else {
			req.soajs.log.error(err);
			req.soajs.log.error(core.error.generate(164));
		}
	}
	else {
		req.soajs.log.error(err);
		req.soajs.log.error(core.error.generate(164));
	}
	
	return next(core.error.getError(164));
}

//-------------------------- ERROR Handling MW - controller

/**
 *
 * @param err
 * @param req
 * @param res
 * @param next
 */
function controllerClientErrorHandler(err, req, res, next) {
	if (req.xhr) {
		req.soajs.log.error(core.error.generate(150));
		let errObj = core.error.getError(150);
		errObj.status = 500;
		req.soajs.controllerResponse(errObj);
	} else {
		return next(err);
	}
}
/**
 *
 * @param err
 * @param req
 * @param res
 * @param next
 */
function controllerErrorHandler(err, req, res, next) {
	if (err.code && err.msg) {
		err.status = 500;
		req.soajs.controllerResponse(err);
	} else {
		let errObj = core.error.getError(err);
		errObj.status = 500;
		req.soajs.controllerResponse(errObj);
	}
}

module.exports = {
	logErrors, // common for service and controllers\
	controllerClientErrorHandler,
	controllerErrorHandler
};