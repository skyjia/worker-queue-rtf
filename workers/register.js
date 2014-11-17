var app = require('../server/default.js');
var logger = app.logger;

var registerWorkers = function (currentQueue) {

    logger.info("Registering workers...");
    logger.warn("no registers");


    // Register sample worker
    // var sample_worker = require('./sample.js');
    // var type = "email";
    // var concurrencyNumber = 10;
    // currentQueue.process(type, concurrencyNumber, sample_worker);

    // Register other workers...
    // TODO: register workers

};

module.exports = registerWorkers;