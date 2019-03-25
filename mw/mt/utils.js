"use strict";

const lib = require("./../../lib");

const coreLibs = require("soajs.core.libs");

const async = require("async");
const Netmask = require('netmask').Netmask;
const useragent = require('useragent');
const merge = require('merge');

const UracDriver = require("./urac.js");

/**
 * Contains functions to calculate and retrieve the ACL based on SOAJS layers
 *
 */
let _system = {
    "getAcl": function (obj) {
        return obj.finalAcl;
    }
};

/**
 * Contains functions to load the profile and group information of the logged in user
 *
 */
let _urac = {
    "getUser": function (req) {
        let urac = null;
        if (req.soajs.uracDriver)
            urac = req.soajs.uracDriver.getProfile();
        return urac;
    },
    "getGroups": function (req) {
        let groups = null;
        if (req.soajs.uracDriver)
            groups = req.soajs.uracDriver.getGroups();
        return groups;
    }
};

/**
 * Contains functions to check the permissions and the access to the requested API
 *
 */
let _api = {
    "checkPermission": function (system, req, api) {
        if ('restricted' === system.apisPermission) {
            if (!api)
                return {"result": false, "error": 159};
            return _api.checkAccess(api.access, req);
        }
        if (!api)
            return {"result": true};
        return _api.checkAccess(api.access, req);
    },
    "checkAccess": function (apiAccess, req) {
        if (!apiAccess)
            return {"result": true};
        if (!_urac.getUser(req))
            return {"result": false, "error": 161};
        if (apiAccess instanceof Array) {
            let userGroups = _urac.getGroups(req);
            if (!userGroups)
                return {"result": false, "error": 160};
            for (let ii = 0; ii < userGroups.length; ii++) {
                if (apiAccess.indexOf(userGroups[ii]) !== -1)
                    return {"result": true};
            }
            return {"result": false, "error": 160};
        }
        else
            return {"result": true};
    }
};

let utils = {
    "aclUrackCheck": (obj, cb) => {
        if (!obj.req.soajs.uracDriver)
            return cb(null, obj);
        let uracACL = obj.req.soajs.uracDriver.getAcl();
        if (!uracACL)
            return cb(null, obj);

        obj.req.soajs.log.debug("Found ACL at URAC level, overriding default ACL configuration.");
        obj.provision.getPackageData(uracACL, (error, pack) => {
            if (pack && pack.acl) {
                obj.finalAcl = pack.acl[obj.req.soajs.controller.serviceParams.name];
                if (obj.finalAcl) {
                    let san_v = coreLibs.version.sanitize(obj.req.soajs.controller.serviceParams.version);
                    obj.finalAcl = obj.finalAcl[san_v] || obj.finalAcl;

                    let method = obj.req.method.toLocaleLowerCase();
                    if (obj.finalAcl && obj.finalAcl[method] && typeof obj.finalAcl[method] === "object") {
                        let newAclObj = {};
                        if (obj.finalAcl.hasOwnProperty('access'))
                            newAclObj.access = obj.finalAcl.access;
                        if (obj.finalAcl[method].hasOwnProperty('apis'))
                            newAclObj.apis = obj.finalAcl[method].apis;
                        if (obj.finalAcl[method].hasOwnProperty('apisRegExp'))
                            newAclObj.apisRegExp = obj.finalAcl[method].apisRegExp;
                        if (obj.finalAcl[method].hasOwnProperty('apisPermission'))
                            newAclObj.apisPermission = obj.finalAcl[method].apisPermission;
                        else if (obj.finalAcl.hasOwnProperty('apisPermission'))
                            newAclObj.apisPermission = obj.finalAcl.apisPermission;

                        obj.finalAcl = lib.apiPathParam2apiRegExp(newAclObj);
                    }
                }
            }
            return cb(null, obj);
        });
    },

    "aclCheck": (obj, cb) => {
        obj.finalAcl = null;
        if (obj.req.soajs.controller.serviceParams.finalAcl)
            obj.finalAcl = obj.req.soajs.controller.serviceParams.finalAcl;

        return cb(null, obj);
    },

    /**
     * Checks if the requested service is accessible based on the ACL configuration
     *
     * @param {Object} obj
     * @param {Function} cb
     * @returns {function}
     */
    "serviceCheck": (obj, cb) => {
        let system = _system.getAcl(obj);
        if (system)
            return cb(null, obj);
        else
            return cb(154);
    },

    /**
     * checks the geo location of the ariving request against the key configuration
     * if there is a conflict, the request is not allowed to proceed
     *
     * @param {Object} obj
     * @param {Function} cb
     * @returns {function}
     */
    "securityGeoCheck": (obj, cb) => {
        let clientIp = obj.req.getClientIP();
        let geoAccess = obj.keyObj.geo; //{"allow": ["127.0.0.1"], "deny": []};
        obj.geo = {"ip": clientIp};

        let checkAccess = (geoAccessArr, ip) => {
            return (geoAccessArr.some(function (addr) {
                try {
                    let block = new Netmask(addr);
                    return block.contains(ip);
                } catch (err) {
                    obj.req.soajs.log.error('Geographic security configuration failed: ', addr);
                    obj.req.soajs.log.error(err);
                }
                return false;
            }));
        };

        if (clientIp && geoAccess && geoAccess.deny && Array.isArray(geoAccess.deny)) {
            let denied = checkAccess(geoAccess.deny, clientIp);
            if (denied)
                return cb(155);
        }

        if (clientIp && geoAccess && geoAccess.allow && Array.isArray(geoAccess.allow)) {
            let allowed = checkAccess(geoAccess.allow, clientIp);
            if (!allowed)
                return cb(155);
        }

        return cb(null, obj);
    },

    /**
     * checks the device from whicht the ariving request was sent against the key configuration
     * if there is a conflict, the request is not allowed to proceed
     *
     * @param {Object} obj
     * @param {Function} cb
     * @returns {function}
     */
    "securityDeviceCheck": (obj, cb) => {
        let clientUA = obj.req.getClientUserAgent();
        let deviceAccess = obj.keyObj.device; //{"allow": [{"family": "chrome"}], "deny": []};
        obj.device = clientUA;

        let validateField = (fieldName, uaObj, da) => {
            if (da[fieldName] && da[fieldName] !== '*' && uaObj[fieldName]) {
                if (typeof (da[fieldName]) === 'string') {
                    if (da[fieldName].trim().toUpperCase() !== uaObj[fieldName].trim().toUpperCase()) {
                        return false;
                    }
                } else { // object
                    if (da[fieldName].min) {
                        if (da[fieldName].min.trim() > uaObj[fieldName].trim()) {
                            return false;
                        }
                    }
                    if (da[fieldName].max) {
                        if (da[fieldName].max.trim() < uaObj[fieldName].trim()) {
                            return false;
                        }
                    }
                }
            }
            return true;
        };

        let checkAccess = (deviceAccessArr, ua) => {
            let uaObj = useragent.lookup(ua);
            //if (uaObj && uaObj.family && uaObj.os && uaObj.os.family) {
            if (uaObj && uaObj.family) {
                return (deviceAccessArr.some(function (da) {
                    if (!da) {
                        return false;
                    }
                    if (da.family && da.family !== '*') {
                        if (da.family.trim().toUpperCase() !== uaObj.family.trim().toUpperCase()) {
                            return false;
                        }
                    }
                    if (da.os && da.os !== '*') {
                        if (uaObj.os && uaObj.os.family) {
                            if (uaObj.os.family.trim().toUpperCase().indexOf(da.os.family.trim().toUpperCase()) === -1) {
                                return false;
                            }
                            if (!validateField('major', uaObj.os, da.os)) {
                                return false;
                            }
                            if (!validateField('minor', uaObj.os, da.os)) {
                                return false;
                            }
                            if (!validateField('patch', uaObj.os, da.os)) {
                                return false;
                            }
                        }
                        else {
                            return false;
                        }
                    }
                    if (!validateField('major', uaObj, da)) {
                        return false;
                    }
                    if (!validateField('minor', uaObj, da)) {
                        return false;
                    }
                    if (!validateField('patch', uaObj, da)) {
                        return false;
                    }
                    return true;
                }));
            }
        };

        if (clientUA && deviceAccess && deviceAccess.deny && Array.isArray(deviceAccess.deny)) {
            let denied = checkAccess(deviceAccess.deny, clientUA);
            if (denied) {
                return cb(156);
            }
        }

        if (clientUA && deviceAccess && deviceAccess.allow && Array.isArray(deviceAccess.allow)) {
            let allowed = checkAccess(deviceAccess.allow, clientUA);
            if (!allowed) {
                return cb(156);
            }
        }

        return cb(null, obj);
    },

    /**
     * Checks if oauth is turned on and the ACL strategy of the API.
     * If the API is public, the request moves forward
     * If the API is private, the oauth is then used along with system to determine if the API is accessible or not
     *
     * oAuth Conf exists in 2 locations:
     *  - registry under: obj.req.soajs.registry.serviceConfig.oauth
     *       type, secret, grants, algorithms, audience, accessTokenLifetime, refreshTokenLifetime, debug
     *  - tenant under: provision.getTenantOauth(obj.req.soajs.tenant.id, (err, tenantOauth))
     *       type, secret, loginMode, disabled
     *
     * @param {Object} obj
     * @param {Function} cb
     * @returns {function}
     */
    "oauthCheck": (obj, cb) => {
        let oAuthTurnedOn = true;
        if (obj.soajs.oauth)
            oAuthTurnedOn = true;
        if (obj.soajs.oauthService && obj.req.soajs.controller.serviceParams.name === obj.soajs.oauthService.name && (obj.req.soajs.controller.serviceParams.path === obj.soajs.oauthService.tokenApi || obj.req.soajs.controller.serviceParams.path === obj.soajs.oauthService.authorizationApi))
            oAuthTurnedOn = false;

        if (oAuthTurnedOn) {
            let oauthExec = function () {
                if (obj.req.soajs.tenantOauth && obj.req.soajs.tenantOauth.disabled)
                //if (obj.req.soajs.servicesConfig && obj.req.soajs.servicesConfig[obj.soajs.oauthService.name] && obj.req.soajs.servicesConfig[obj.soajs.oauthService.name].disabled)
                    return cb(null, obj);

                return obj.soajs.oauth(obj.req, obj.res, function (error) {
                    return cb(error, obj);
                });
            };

            let system = _system.getAcl(obj);
            let api = (system && system.apis ? system.apis[obj.req.soajs.controller.serviceParams.path] : null);
            if (!api && system && system.apisRegExp && Object.keys(system.apisRegExp).length > 0) {
                for (let jj = 0; jj < system.apisRegExp.length; jj++) {
                    if (system.apisRegExp[jj].regExp && obj.req.soajs.controller.serviceParams.path.match(system.apisRegExp[jj].regExp)) {
                        api = system.apisRegExp[jj];
                    }
                }
            }

            //public means:
            //-------------
            //case 0:
            //acl.systemName.access = false
            //no apiName
            //case 1:
            //acl.systemName.access = false
            //acl.systemName.apis.apiName.access = false
            //case 2:
            //acl.systemName.access = true
            //acl.systemName.apisRegExp.access = false
            //case 3:
            //acl.systemName.access = false
            //acl.systemName.apisRegExp.access = false
            //case 4:
            //acl.systemName.access = true
            //acl.systemName.apis.apiName.access = false
            //case 5:
            //acl.systemName.apisPermission = "restricted"
            //acl.systemName.apis.apiName.access = false

            let serviceApiPublic = false;
            if (system) {
                if (system.access) {
                    if (api && !api.access)
                        serviceApiPublic = true; //case 4 & case 2
                }
                else {
                    if (!api || (api && !api.access))
                        serviceApiPublic = true; //case 1 & case 3 & case 0
                }
                if ('restricted' === system.apisPermission) {
                    if (api && !api.access)
                        serviceApiPublic = true; //case 5
                }
            }
            if (serviceApiPublic) {
                if (obj.req && obj.req.query && obj.req.query.access_token)
                    serviceApiPublic = false;
            }
            if (serviceApiPublic)
                return cb(null, obj);
            else
                return oauthExec();
        }
        else
            return cb(null, obj);
    },

    /**
     * Check if the request contains oauth tokens, and calls the urac Driver to retrieve the corresponding user record
     * @param {Object} obj
     * @param {Function} cb
     * @returns {*}
     */
    "uracCheck": (obj, cb) => {
        let callURACDriver = function () {
            obj.req.soajs.uracDriver = new UracDriver({"soajs": obj.req.soajs, "oauth": obj.req.oauth});
            obj.req.soajs.uracDriver.init((error, uracProfile) => {
                if (error)
                    obj.req.soajs.log.error(error);

                let userServiceConf = obj.req.soajs.uracDriver.getConfig();
                userServiceConf = userServiceConf || {};

                let tenantServiceConf = obj.keyObj.config;
                //obj.req.soajs.servicesConfig = merge.recursive(true, tenantServiceConf, userServiceConf);
                obj.servicesConfig = merge.recursive(true, tenantServiceConf, userServiceConf);
                return cb(null, obj);
            });
        };

        /**
         * returns code for the requested tenant.
         * if tenant is the same in the request, returns tenant from request
         * @param {Function} cb
         * @returns {*}
         */
        let getTenantInfo = (cb) => {
            //if tenant id === client id, don't get tenant data
            if (obj.req.soajs.tenant.id === obj.req.oauth.bearerToken.clientId) {
                obj.req.soajs.log.debug("loading tenant data from req.soajs.tenant.id");
                return cb(null, obj.req.soajs.tenant);
            }

            obj.req.soajs.log.debug("loading tenant data from req.oauth.bearerToken.clientId");
            obj.provision.getTenantData(obj.req.oauth.bearerToken.clientId, function (error, tenant) {
                if (error || !tenant) {
                    if (!tenant) {
                        error = new Error("Tenant not found for:" + obj.req.oauth.bearerToken.clientId);
                    }
                    obj.req.soajs.log.error(error);
                    return cb(error);
                }

                return cb(null, tenant);
            });
        };

        /**
         * load the registry of the requested environment.
         * if environment is the same in the request, return registry from request
         * @param {Function} cb
         * @returns {*}
         */
        let getEnvRegistry = (cb) => {
            //if environment is the same as regEnvironment, use it
            if (obj.req.oauth.bearerToken.env === obj.regEnvironment) {
                obj.req.soajs.log.debug("loading env registry from req.soajs.registry");
                return cb(null, obj.req.soajs.registry);
            }

            obj.req.soajs.log.debug("loading env registry from req.oauth.bearerToken.env");
            obj.core.registry.loadByEnv({"envCode": obj.req.oauth.bearerToken.env}, function (error, registry) {
                if (error || !registry) {
                    if (!registry) {
                        error = new Error("Registry not found for:" + obj.req.oauth.bearerToken.env);
                    }
                    obj.req.soajs.log.error(error);
                    return cb(error);
                }
                return cb(null, registry);
            });
        };

        if (obj.req && obj.req.oauth && obj.req.oauth.bearerToken && obj.req.oauth.bearerToken.env === "dashboard") {
            obj.req.soajs.tenant.roaming = {
                "tId": obj.req.oauth.bearerToken.clientId,
                "user": obj.req.oauth.bearerToken.user
            };

            async.parallel({"tenant": getTenantInfo, "registry": getEnvRegistry}, function (error, response) {
                if (error) {
                    return cb(170);
                }

                if (response.registry && response.registry.tenantMetaDB)
                    obj.req.soajs.tenant.roaming.tenantMetaDB = response.registry.tenantMetaDB;
                obj.req.soajs.tenant.roaming.code = response.tenant.code;

                return callURACDriver();
            });
        }
        else {
            if (obj.req && obj.req.oauth && obj.req.oauth.bearerToken)
                return callURACDriver();
            else
                return cb(null, obj);
        }
    },

    /**
     * Checks if the acl permissions allow access to the requested api or not
     * @param {Object} obj
     * @param {Function} cb
     * @returns {function}
     */
    "apiCheck": (obj, cb) => {
        let system = _system.getAcl(obj);
        let api = (system && system.apis ? system.apis[obj.req.soajs.controller.serviceParams.path] : null);
        if (!api && system && system.apisRegExp && Object.keys(system.apisRegExp).length) {
            for (let jj = 0; jj < system.apisRegExp.length; jj++) {
                if (system.apisRegExp[jj].regExp && obj.req.soajs.controller.serviceParams.path.match(system.apisRegExp[jj].regExp)) {
                    api = system.apisRegExp[jj];
                }
            }
        }
        let apiRes = null;
        if (system && system.access) {
            if (api && !api.access)
                obj.req.soajs.controller.serviceParams.isAPIPublic = true;
            if (_urac.getUser(obj.req)) {
                if (system.access instanceof Array) {
                    let checkAPI = false;
                    let userGroups = _urac.getGroups(obj.req);
                    if (userGroups) {
                        for (let ii = 0; ii < userGroups.length; ii++) {
                            if (system.access.indexOf(userGroups[ii]) !== -1)
                                checkAPI = true;
                        }
                    }
                    if (!checkAPI)
                        return cb(157);
                }
            } else {
                if (!api || api.access)
                    return cb(158);
            }
            apiRes = _api.checkPermission(system, obj.req, api);
            if (apiRes.result)
                return cb(null, obj);
            else
                return cb(apiRes.error);
        }
        else {
            if (!api || (api && !api.access))
                obj.req.soajs.controller.serviceParams.isAPIPublic = true;
        }
        if (api || (system && ('restricted' === system.apisPermission))) {
            if (api && !api.access)
                obj.req.soajs.controller.serviceParams.isAPIPublic = true;
            apiRes = _api.checkPermission(system, obj.req, api);
            if (apiRes.result)
                return cb(null, obj);
            else
                return cb(apiRes.error);
        }
        else
            return cb(null, obj);
    }
};

module.exports = utils;