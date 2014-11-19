

function registerWorker(worker, currentQueue) {
    var type = worker.worker_type;
    var concurrencyNumber = worker.concurrency_number;
    var handler = worker.handler;

    currentQueue.process(type, concurrencyNumber, handler);
}

var registerWorkers = function (app, currentQueue) {

    var logger = app.logger;

    logger.info("Registering workers...");

    var pdf2swf_worker = require('../workers/pdf2swf.js')(app);
    registerWorker(pdf2swf_worker, currentQueue);
    logger.info("Worker %s is registered.", pdf2swf_worker.name);

    // Register other workers...
    // TODO: register workers

};

module.exports = registerWorkers;
