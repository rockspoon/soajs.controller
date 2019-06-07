'use strict';
const express = require('express');
const sApp = express();
const mApp = express();

function startServer(serverConfig, callback) {
    let mReply = {
        'result': true,
        'ts': Date.now(),
        'service': {
            'service': serverConfig.name,
            'type': 'rest',
            'route': "/heartbeat"
        }
    };
    let sReply = {
        'result': true,
        'data': {
            'firstname': "antoine",
            'lastname': "hage"
        }
    };

    sApp.get('/user', (req, res) => res.json(sReply));
    sApp.get('/luser', (req, res) => {
        setTimeout(() => {
            res.json(sReply);
        }, 5000);
    });
    mApp.get('/heartbeat', (req, res) => res.json(mReply));

    let sAppServer = sApp.listen(serverConfig.s.port, () => console.log(`${serverConfig.name} service mock listening on port ${serverConfig.s.port}!`));
    let mAppServer = mApp.listen(serverConfig.m.port, () => console.log(`${serverConfig.name} service mock listening on port ${serverConfig.m.port}!`));

    return callback(
        {
            "sAppServer": sAppServer,
            "mAppServer": mAppServer
        }
    )
}

function killServer(config) {
    console.log("killing server ....");

    config.mAppServer.close((err) => {
        console.log("...sAppServer")
    });

    config.sAppServer.close((err) => {
        console.log("...mAppServer")
    });
}

module.exports = {
    startServer: startServer,
    killServer: killServer
};