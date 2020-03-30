"use strict";

/**
 * @license
 * Copyright SOAJS All Rights Reserved.
 *
 * Use of this source code is governed by an Apache license that can be
 * found in the LICENSE file at the root of this repository
 */

let config = {
	type: 'service',
	prerequisites: {
		cpu: '',
		memory: ''
	},
	serviceVersion: "1",
	serviceName: "controller",
	serviceGroup: "SOAJS Core Service",
	servicePort: 4000
};

process.env.SOAJS_GATEWAY_VER = config.serviceVersion;
process.env.SOAJS_GATEWAY_NAME = config.serviceName;
module.exports = config;