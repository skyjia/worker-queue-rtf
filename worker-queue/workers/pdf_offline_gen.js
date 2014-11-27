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
        var fd = fs.openSync(filePath, 'wx');
        fs.closeSync(fd);
    } else {
        var fd = fs.openSync(filePath, 'w');
        fs.closeSync(fd);
    }
}

function isPathAvailable(basePath, checkingPath) {
    return checkingPath.indexOf(basePath) === 0;
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

    if (!url) return;

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
        console.log(response.statusCode);
    }).on('error', function (err) {
        console.log('REST request error', err.request.options);
    });
}

function buildEvents(settings) {

    return {
        "job_enqueue_handler": function (id, type) {
            if (type === settings.worker_type) {

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

                    postJobCallback(settings.callback, ctxData);
                });

            }
        },

        "job_progress_handler": function (id, progress) {
            kue.Job.get(id, function (err, job) {
                if (err) return;

                if (job.type === settings.worker_type) {
                    var ctxData = {
                        id: job.id,
                        type: job.type,
                        status: 'progress',
                        updated_at: job.updated_at,
                        data: job.data,
                        result: null,
                        progress: progress
                    };

                    postJobCallback(settings.callback, ctxData);
                }
            });
        },

        "job_promotion_handler": function (id) {

            kue.Job.get(id, function (err, job) {
                if (err) return;

                if (job.type === settings.worker_type) {
                    var ctxData = {
                        id: job.id,
                        type: job.type,
                        status: 'promotion',
                        updated_at: job.updated_at,
                        data: job.data,
                        result: null
                    };

                    postJobCallback(settings.callback, ctxData);
                }
            });
        },

        "job_failed_handler": function (id) {
            kue.Job.get(id, function (err, job) {
                if (err) return;

                if (job.type === settings.worker_type) {
                    var ctxData = {
                        id: job.id,
                        type: job.type,
                        status: 'failed',
                        updated_at: job.updated_at,
                        data: job.data,
                        failed_at: job.failed_at,
                        result: null
                    };

                    postJobCallback(settings.callback, ctxData);
                }
            });
        },

        "job_complete_handler": function (id, result) {

            kue.Job.get(id, function (err, job) {
                if (err) return;

                if (job.type === settings.worker_type) {
                    var ctxData = {
                        id: job.id,
                        type: job.type,
                        status: 'complete',
                        updated_at: job.updated_at,
                        data: job.data,
                        result: result
                    };

                    postJobCallback(settings.callback, ctxData);
                }
            });
        }
    };
}

function PDFOfflineGenWorker(app) {
    this.app = app;
    this.name = "pdf_offline_gen";
    this.description = "Encrypt pdf";
    this.settings = app.cfg.workers.pdf_offline_gen;
    this.worker_type = this.settings.worker_type;
    this.concurrency_number = this.settings.concurrency_number;
    this.events = buildEvents(this.settings);

    var self = this;

    this.handler = function (job, done, ctx) {

        var worker = self;
        var logger = worker.app.logger;

        var processHandler = function (job, done, ctx) {
            logger.info("pdf_offline_gen (job %s) - start processing", job.id);

            var data_path = path.resolve(worker.settings.data_path);

            var input_pdf_path = path.join(data_path, job.data.input);
            var output_pdf_path = path.join(data_path, job.data.output);
            var output_pdf_dir = path.dirname(output_pdf_path);

            var command = "";

            if (isWin) {
                var parts = [];
                parts.push("FileOpenEncryptor");
                parts.push(util.format("-in \"%s\"", input_pdf_path));
                parts.push(util.format("-out \"%s\"", output_pdf_path));
                parts.push(util.format("-logURL \"%s\"", job.data.logURL));
                parts.push(util.format("-permURL \"%s\"", job.data.permURL));
                parts.push(util.format("-permURLDocPerm \"%s\"", job.data.permURLDocPerm));
                parts.push(util.format("-permURLFilePerm \"%s\"", job.data.permURLFilePerm));
                parts.push(util.format("-key \"%s\"", job.data.key));

                if (job.data.docID)
                    parts.push(util.format("-docID \"%s\"", job.data.docID));
                if (job.data.serID)
                    parts.push(util.format("-serID \"%s\"", job.data.serID));
                if (job.data.thirdID)
                    parts.push(util.format("-3rdID \"%s\"", job.data.thirdID));
                if (job.data.forthID)
                    parts.push(util.format("-4thID \"%s\"", job.data.forthID));

                command = parts.join(" ");
            } else {
                // TODO: build command
            }

            if (!fs.existsSync(input_pdf_path)) {
                logger.info("pdf_offline_gen (job %s) - input pdf not exist in %s", job.id, input_pdf_path);
                done(new Error('Input file does not exist.'));

                // TODO: disable retry

                return;
            }

            // security check. avoid access system files
            if (!isPathAvailable(data_path, input_pdf_path)) {
                logger.info("pdf_offline_gen (job %s) - input pdf path is not valid, %s", job.id, input_pdf_path);
                done(new Error('Input file path is invalid.'));

                // TODO: disable retry

                return;
            }

            if (!isPathAvailable(data_path, output_pdf_path)) {
                logger.info("pdf_offline_gen (job %s) - output pdf path is not valid, %s", job.id, output_pdf_path);
                done(new Error('Output file path is invalid.'));

                // TODO: disable retry

                return;
            }

            // ready
            job.progress(1, 2);

            // Create output file directory
            if (!fs.exists(output_pdf_dir)) {
                fs.mkdirsSync(output_pdf_dir);
            }

            // Generate Encrypted file(s)
            logger.info("pdf_offline_gen (job %s) - EXEC: %s", job.id, command);
            var child_process = exec(command, function (error, stdout, stderr) {

                if (stderr.length > 0) {
                    logger.error("pdf_offline_gen (job %s) - Failed to execute command, error: %s", job.id, stderr);
                    job.log(stderr);
                    return;
                }

                if (error !== null) {
                    logger.error("pdf_offline_gen (job %s) - Failed to execute command, error: %s", job.id, error.message);
                    done(error);
                    return;
                }

                // Successfully done
                logger.info("pdf_offline_gen (job %s) - Success execute command, stdout: %s", job.id, stdout);

                job.progress(2, 2);
                done();
            });
        };

        // TODO: fixed sooner or later
        // Due to Kue's bug (https://github.com/LearnBoost/kue/issues/443),
        // we hack it to implement delay attempt.
        if (typeof job._attempts !== 'undefined') {
            // is not the first time attempt
            // _delay in ms
            if (job.data._delay && job.data._delay > 0) {
                setTimeout(function () {
                    processHandler(job, done, ctx);
                }, job.data._delay);
            }
        } else {
            processHandler(job, done, ctx);
        }

    };
}

var initiliazer = function (app) {
    return new PDFOfflineGenWorker(app);
};

module.exports = initiliazer;
