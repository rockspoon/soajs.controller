'use strict';

/**
 * @license
 * Copyright SOAJS All Rights Reserved.
 *
 * Use of this source code is governed by an Apache license that can be
 * found in the LICENSE file at the root of this repository
 */

const request = require('request');

/**
 *
 * @param req
 * @param res
 * @param cb
 */
module.exports = (req, res, core, cb) => {
	let restServiceParams = req.soajs.controller.serviceParams;
	
	let config = req.soajs.registry.services.controller;
	if (!config) {
		return req.soajs.controllerResponse(core.error.getError(131));
	}
	let nextStep = function (host, port, fullURI) {
		req.soajs.log.info({
			"serviceName": restServiceParams.name,
			"host": host,
			"version": restServiceParams.version,
			"url": restServiceParams.url,
			"port": restServiceParams.registry.port,
			"header": req.headers
		});
		
		let requestTOR = restServiceParams.registry.requestTimeoutRenewal || config.requestTimeoutRenewal;
		let requestTO = restServiceParams.registry.requestTimeout || config.requestTimeout;
		let timeToRenew = requestTO * 100;
		req.soajs.controller.renewalCount = 0;
		req.soajs.controller.monitorEndingReq = false;
		
		let isStream = false;
		
		let renewReqMonitor = function () {
			if (!isStream) {
				req.soajs.log.warn('Request is taking too much time ...');
				req.soajs.controller.renewalCount++;
				
				if (req.soajs.controller.renewalCount < requestTOR) {
					req.soajs.log.info('Trying to keep request alive by checking the service heartbeat ... ' + req.soajs.controller.renewalCount);
					
					let uri = 'http://' + host + ':' + (restServiceParams.registry.port + req.soajs.registry.serviceConfig.ports.maintenanceInc) + '/heartbeat';
					
					if (restServiceParams.registry.maintenance && restServiceParams.registry.maintenance.readiness && restServiceParams.registry.maintenance.port) {
						let maintenancePort = port;
						let path = restServiceParams.registry.maintenance.readiness;
						if ("maintenance" === restServiceParams.registry.maintenance.port.type) {
							maintenancePort = maintenancePort + req.soajs.registry.serviceConfig.ports.maintenanceInc;
						} else if ("inherit" === restServiceParams.registry.maintenance.port.type) {
							maintenancePort = port;
						} else {
							let tempPort = parseInt(restServiceParams.registry.maintenance.port.value);
							if (!isNaN(tempPort)) {
								maintenancePort = restServiceParams.registry.maintenance.port.value;
							}
						}
						uri = 'http://' + host + ':' + maintenancePort + path;
					}
					req.soajs.log.info("heartbeat @: " + uri);
					request({
						'uri': uri,
						'headers': req.headers
					}, function (error, response) {
						let resContentType = res.getHeader('content-type');
						//let isStream = false;
						if (resContentType) {
							isStream = resContentType.match(/stream/i);
						}
						if (!error && response.statusCode === 200) {
							if (isStream) {
								req.soajs.controller.renewalCount--;
								req.soajs.log.info('Stream detected for [' + req.url + ']. Connection will remain open ...');
							} else {
								req.soajs.log.info('... able to renew request for ', requestTO, 'seconds');
								res.setTimeout(timeToRenew, renewReqMonitor);
							}
						} else {
							req.soajs.controller.monitorEndingReq = true;
							req.soajs.log.error('Service heartbeat is not responding');
							req.soajs.controller.redirectedRequest.abort();
							return req.soajs.controllerResponse(core.error.getError(133));
						}
					});
				} else {
					if (req.soajs.controller.redirectedRequest) {
						req.soajs.log.info("Request aborted: " + req.soajs.controller.renewalCount + " ", req.url);
						req.soajs.controller.redirectedRequest.abort();
					}
					if (!req.soajs.controller.monitorEndingReq) {
						req.soajs.controller.monitorEndingReq = true;
						req.soajs.log.error('Request time exceeded the requestTimeoutRenewal:', requestTO + requestTO * requestTOR);
						return req.soajs.controllerResponse(core.error.getError(134));
					}
				}
			}
		};
		if (req.soajs.registry &&
			req.soajs.registry.custom &&
			req.soajs.registry.custom.gateway &&
			req.soajs.registry.custom.gateway.value &&
			req.soajs.registry.custom.gateway.value.gotoService &&
			req.soajs.registry.custom.gateway.value.gotoService.renewReqMonitorOff) {
			req.soajs.log.debug("renewReqMonitor: is OFF");
		} else {
			res.setTimeout(timeToRenew, renewReqMonitor);
		}
		
		return cb({
			'host': host,
			'config': config,
			'requestTO': requestTO,
			'uri': (fullURI ? host + restServiceParams.url : 'http://' + host + ':' + port + restServiceParams.url)
		});
	};
	
	if (restServiceParams.registry.srcType && restServiceParams.registry.srcType === "endpoint") {
		let host = restServiceParams.registry.src.url;
		if (restServiceParams.version && restServiceParams.registry.src.urls) {
			for (let i = 0; i < restServiceParams.registry.src.urls.length; i++) {
				if (restServiceParams.registry.src.urls[i].version === restServiceParams.version) {
					host = restServiceParams.registry.src.urls[i].url;
				}
			}
		}
		if (restServiceParams.keyObj && restServiceParams.keyObj.config) {
			if (restServiceParams.keyObj.config[restServiceParams.name] && restServiceParams.keyObj.config[restServiceParams.name].url) {
				host = restServiceParams.keyObj.config[restServiceParams.name].url;
			}
			if (restServiceParams.version && restServiceParams.keyObj.config[restServiceParams.name] && restServiceParams.keyObj.config[restServiceParams.name].urls) {
				for (let i = 0; i < restServiceParams.keyObj.config[restServiceParams.name].urls.length; i++) {
					if (restServiceParams.keyObj.config[restServiceParams.name].urls[i].version === restServiceParams.version) {
						host = restServiceParams.keyObj.config[restServiceParams.name].urls[i].url;
					}
				}
			}
		}
		return nextStep(host, restServiceParams.registry.port, true);
	}
	else {
		req.soajs.awareness.getHost(restServiceParams.name, restServiceParams.version, function (host) {
			if (!host) {
				req.soajs.log.error('Unable to find any healthy host for service [' + restServiceParams.name + (restServiceParams.version ? ('@' + restServiceParams.version) : '') + ']');
				return req.soajs.controllerResponse(core.error.getError(133));
			}
			return nextStep(host, restServiceParams.registry.port);
		});
	}
}
;
