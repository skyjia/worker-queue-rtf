// Common Helper functions
var kue = require('kue');
var exec = require('child_process').exec;
var path = require('path');
var util = require('util');
var fs = require("fs-extra");
var RestClient = require('node-rest-client').Client;

var isWin = /^win/.test(process.platform);

function touchFile(filePath, errorOnExist, cb) {
    if (errorOnExist) {
        fs.open(filePath, 'wx', function (err, fd) {
            if (cb) {
                cb(err, fd);
            }
        });
    } else {
        fs.open(filePath, 'w', function (err, fd) {
            if (cb) {
                cb(err, fd);
            }
        });
    }
}

function touchFileSync(filePath, errorOnExist) {
    if (errorOnExist) {
        fs.openSync(filePath, 'wx');
    } else {
        fs.openSync(filePath, 'w');
    }
}

function isPathAvailable(basePath, checkingPath) {
    return checkingPath.indexOf(basePath) === 0;
}

function isGeneratingMultipleFiles(output_swf_path) {
    return path.basename(output_swf_path).indexOf('%') >= 0;
}

function createRestClient() {
    var options = {
        /**
         * Set mimetypes because node-rest-client doesn't automatically recognize "application/json; charset=utf-8"
         * Refer to https://github.com/aacerox/node-rest-client/issues/39
         */
        mimetypes: {
            json: ["application/json", "application/json;charset=utf-8", "application/json; charset=utf-8"],
            xml: ["application/xml", "application/xml;charset=utf-8", "application/xml; charset=utf-8"]
        }
    };

    var restClient = new RestClient(options);

    restClient.on('error', function (err) {
        console.log("RESTClient error:", err);
    });

    return restClient;
}

function postJobCallback(url, ctxData) {

    var client = createRestClient();

    // set content-type header and data as json in args parameter
    var args = {
        data: ctxData,
        headers: {"Content-Type": "application/json"},
        requestConfig: {
            timeout: 1000, //request timeout in milliseconds
            noDelay: true, //Enable/disable the Nagle algorithm
            keepAlive: true, //Enable/disable keep-alive functionalityidle socket.
            keepAliveDelay: 1000 //and optionally set the initial delay before the first keepalive probe is sent
        }
    };

    client.post(url, args, function (data, response) {
        // parsed response body as js object
        console.log(data);
        // raw response
        console.log(response);
    }).on('error', function (err) {
        console.log('REST request error', err.request.options);
    });
}

function bindQueueEvents(queue, worker, logger) {
    // Bind enqueue event
    queue.on('job enqueue', function (id, type) {
        if (type === worker.worker_type) {

            kue.Job.get(id, function (err, job) {
                if (err) return;

                var ctxData = {
                    id: job.id,
                    type: job.type,
                    status: 'enqueue',
                    updated_at: job.updated_at,
                    data: job.data,
                    result: null
                };

                logger.info("Job [%d] enqueue.", job.id, ctxData);

                postJobCallback(worker.settings.callback, ctxData);
            });

        }
    });


    queue.on('job promotion', function (id) {
        // the job is promoted from delayed state to queued

        kue.Job.get(id, function (err, job) {
            if (err) return;

            if (job.type === worker.worker_type) {
                var ctxData = {
                    id: job.id,
                    type: job.type,
                    status: 'promotion',
                    updated_at: job.updated_at,
                    data: job.data,
                    result: null
                };

                logger.error("Job [%d] promotion", job.id, ctxData);

                postJobCallback(worker.settings.callback, ctxData);
            }

        });
    });
    // Bind failed event
    queue.on('job failed', function (id) {
        // the job has failed and has no remaining attempts

        kue.Job.get(id, function (err, job) {
            if (err) return;

            if (job.type === worker.worker_type) {
                var ctxData = {
                    id: job.id,
                    type: job.type,
                    status: 'failed',
                    updated_at: job.updated_at,
                    data: job.data,
                    failed_at: job.failed_at,
                    result: null
                };

                logger.error("Job [%d] failed", job.id, ctxData);

                postJobCallback(worker.settings.callback, ctxData);
            }

        });
    });

    // Bind complete event
    queue.on('job complete', function (id, result) {
        // the job has completed

        kue.Job.get(id, function (err, job) {
            if (err) return;

            if (job.type === worker.worker_type) {
                var ctxData = {
                    id: job.id,
                    type: job.type,
                    status: 'complete',
                    updated_at: job.updated_at,
                    data: job.data,
                    result: result
                };

                logger.info("Job [%d] completed.", job.id, ctxData);

                postJobCallback(worker.settings.callback, ctxData);
            }
        });

    });
}

var initiliazer = function (app) {

    this.name = "pdf2swf";
    this.description = "Convert PDF file to SWF file.";

    this.settings = app.cfg.workers.pdf2swf;

    this.worker_type = this.settings.worker_type;
    this.concurrency_number = this.settings.concurrency_number;

    this.script = isWin ? this.settings.win_script_path : this.settings.script_path;
    this.command_format = isWin ? "%s %s %s" : "sh %s %s %s";

    var that = this;
    var logger = app.logger;
    var queue = app.queue;

    bindQueueEvents(queue, that, logger);

    this.handler = function (job, done, ctx) {

        var processHandler = function(job, done, ctx){
            job.log("Processing at %s", new Date());

            var data_path = path.resolve(that.settings.data_path);

            var input_pdf_path = path.join(data_path, job.data.input);
            var output_swf_path = path.join(data_path, job.data.output);
            var output_swf_dir = path.dirname(output_swf_path);

            var isMultiGen = isGeneratingMultipleFiles(output_swf_path);

            var command = util.format(that.command_format, that.script, input_pdf_path, output_swf_path);

            // security check. avoid access system files
            if (!isPathAvailable(data_path, input_pdf_path)) {
                done(new Error('Input file path is invalid.'));

                // TODO: disable retry

                return;
            }

            if (!isPathAvailable(data_path, output_swf_path)) {
                done(new Error('Output file path is invalid.'));

                // TODO: disable retry

                return;
            }


            // ready
            job.progress(1, 4);

            var fp_lock_path = path.join(output_swf_dir, '../fp.lock');
            var fp_complete_path = path.join(output_swf_dir, "../fp.complete");


            // touch a lock file in parent directory of output_swf_path: "fp.lock"\
            if (!isPathAvailable(data_path, fp_lock_path)) {
                done(new Error('FP lock file path is invalid.'));

                // TODO: disable retry

                return;
            }

            touchFile(fp_lock_path, true, function (err, fd) {
                if (err) {
                    done(new Error('FP lock file already exists. Deny to process current job.'));
                    return;
                }

                var lockData = {
                    "hostname": app.cfg.name,
                    "process_name": process.title,
                    "process_id": process.pid,
                    "process_exec_path": process.execPath,
                    "process_argv": process.execArgv,
                    "start_time": new Date(),
                    "description": "Generate FP SWF files."
                };

                fs.outputJsonSync(fp_lock_path, lockData);

                job.progress(2, 4);


                // clear fp.complete and fp/ directory.
                fs.removeSync(fp_complete_path);

                if (isMultiGen) {
                    // Re-create output directory if not exists
                    fs.removeSync(output_swf_dir);
                }

                fs.mkdirsSync(output_swf_dir);

                job.progress(3, 4);

                // Generate SWF file(s)
                logger.info("EXEC: %s", command);
                var child_process = exec(command, function (error, stdout, stderr) {
                    logger.info(stdout);

                    if (stderr.length > 0) {
                        logger.error(stderr);
                        job.log(stderr);
                    }

                    if (error !== null) {
                        // error occurs
                        done(error);
                    } else {
                        // Successfully done

                        // mark an fs.complete file in parent directory of output_swf_path: "fp.complete"
                        touchFileSync(fp_complete_path, false);

                        job.progress(4, 4);
                        done();
                    }

                    // remove fp.lock file anyway.
                    fs.removeSync(fp_lock_path);

                });

            });
        };

        // TODO: fixed sooner or later
        // Due to Kue's bug (https://github.com/LearnBoost/kue/issues/443),
        // we hack it to implement delay attempt.
        if(typeof job._attempts !== 'undefined'){
            // is not the first time attempt
            // _delay in ms
            if(job.data._delay && job.data._delay > 0){
                setTimeout(function () {
                    processHandler(job,done,ctx);
                }, job.data._delay);
            }
        } else {
            processHandler(job,done,ctx);
        }

    };

    return this;
};

module.exports = initiliazer;