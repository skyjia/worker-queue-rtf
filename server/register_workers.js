var _ = require('lodash');

function registerWorker(worker, currentQueue) {
    var type = worker.worker_type;
    var concurrencyNumber = worker.concurrency_number;
    var handler = worker.handler;

    currentQueue.process(type, concurrencyNumber, handler);
}


const JOB_ENQUEUE_EVENT_HANDLER = 'job_enqueue_handler';
const JOB_PROMOTION_EVENT_HANDLER = 'job_promotion_handler';
const JOB_FAILED_EVENT_HANDLER = 'job_failed_handler';
const JOB_COMPLETE_EVENT_HANDLER = 'job_complete_handler';
const JOB_FAILED_ATTEMPT_HANDLER = 'job_failed_attempt_handler';

function registerJobEvents(eventsArr, currentQueue, logger) {
    // the job is now queued
    currentQueue.on('job enqueue', function (id, type) {
        logger.info("Job [%d] enqueue.", id);

        _.forEach(eventsArr, function(events){
            if(events[JOB_ENQUEUE_EVENT_HANDLER]){
                events[JOB_ENQUEUE_EVENT_HANDLER].call(events, id, type);
            }
        });
    });

    // the job is promoted from delayed state to queued
    currentQueue.on('job promotion', function (id) {
        logger.info("Job [%d] promoted.", id);

        _.forEach(eventsArr, function(events){
            if(events[JOB_PROMOTION_EVENT_HANDLER]){
                events[JOB_PROMOTION_EVENT_HANDLER].call(events, id);
            }
        });
    });

    // the job has failed and has no remaining attempts
    currentQueue.on('job failed', function (id) {
        logger.error("Job [%d] failed", id);

        _.forEach(eventsArr, function(events){
            if(events[JOB_FAILED_EVENT_HANDLER]){
                events[JOB_FAILED_EVENT_HANDLER].call(events, id);
            }
        });
    });

    // the job has completed
    currentQueue.on('job complete', function (id, result) {
        logger.info("Job [%d] completed.", id);

        _.forEach(eventsArr, function(events){
            if(events[JOB_COMPLETE_EVENT_HANDLER]){
                events[JOB_COMPLETE_EVENT_HANDLER].call(events, id, result);
            }
        });
    });

    // the job has failed, but has remaining attempts yet
    currentQueue.on('job failed attempt', function (id) {
        logger.info("Job [%d] failed attempt.", id);

        _.forEach(eventsArr, function(events){
            if(events[JOB_FAILED_ATTEMPT_HANDLER]){
                events[JOB_FAILED_ATTEMPT_HANDLER].call(events, id);
            }
        });
    });
}

var registerWorkers = function (app, currentQueue) {

    var jobEventsArr = [];
    var logger = app.logger;

    logger.info("Registering workers...");

    // Register pdf2swf worker:
    var pdf2swf_worker = require('../workers/pdf2swf.js')(app);
    registerWorker(pdf2swf_worker, currentQueue);
    if (pdf2swf_worker.events) {
        jobEventsArr.push(pdf2swf_worker.events);
    }
    logger.info("Worker %s is registered.", pdf2swf_worker.name);

    registerJobEvents(jobEventsArr, currentQueue, logger);
    logger.info("Worker events are registered.");

};

module.exports = registerWorkers;
