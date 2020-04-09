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
	serviceName: "gateway",
	serviceGroup: "SOAJS Core Service",
	servicePort: 3999
};

module.exports = config;
