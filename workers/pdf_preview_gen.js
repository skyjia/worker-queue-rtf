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
        "job_enqueue_handler" : function (id, type) {
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

        "job_progress_handler": function(id, progress) {
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

var initiliazer = function (app) {

    this.name = "pdf_preview_gen";
    this.description = "Generate preview pdf.";

    this.settings = app.cfg.workers.pdf_preview_gen;

    this.worker_type = this.settings.worker_type;
    this.concurrency_number = this.settings.concurrency_number;
    this.events = buildEvents(this.settings);

    var logger = app.logger;

    this.handler = function (job, done, ctx) {

        var processHandler = function(job, done, ctx){
            job.log("Processing at %s", new Date());

            var settings = app.cfg.workers.pdf_preview_gen;

            var data_path = path.resolve(settings.data_path);

            var input_pdf_path = path.join(data_path, job.data.input);
            var output_pdf_path = path.join(data_path, job.data.output);
            var output_pdf_dir = path.dirname(output_pdf_path);
            var pageRange = job.data.pageRange;

            var script = isWin ? settings.win_script_path : settings.script_path;
            var command_format = isWin ? "%s \"%s\" \"%s\" \"%s\"" : "sh %s %s %s %s";
            var command = util.format(command_format, script, input_pdf_path, pageRange, output_pdf_path);

            // security check. avoid access system files
            if (!isPathAvailable(data_path, input_pdf_path)) {
                done(new Error('Input file path is invalid.'));

                // TODO: disable retry

                return;
            }

            if (!isPathAvailable(data_path, output_pdf_path)) {
                done(new Error('Output file path is invalid.'));

                // TODO: disable retry

                return;
            }

            // check whether input file exists
            if (!fs.existsSync(input_pdf_path)) {
                done(new Error('Input file does not exist.'));

                // TODO: disable retry

                return;
            }


            // ready
            job.progress(1, 4);

            var preview_lock_path = path.join(output_pdf_dir, '../preview.lock');

            // touch a lock file in parent directory of output_swf_path: "fp.lock"\
            if (!isPathAvailable(data_path, preview_lock_path)) {
                done(new Error('preview lock file path is invalid.'));

                // TODO: disable retry

                return;
            }

            touchFile(preview_lock_path, true, function (err, fd) {
                if (err) {
                    done(new Error('preview lock file already exists. Deny to process current job.'));
                    return;
                }
                fs.closeSync(fd);   //close file handler

                var lockData = {
                    "hostname": app.cfg.name,
                    "process_name": process.title,
                    "process_id": process.pid,
                    "process_exec_path": process.execPath,
                    "process_argv": process.execArgv,
                    "start_time": new Date(),
                    "description": "Generate preview PDF file."
                };

                fs.outputJsonSync(preview_lock_path, lockData);

                job.progress(2, 4);

                fs.mkdirsSync(output_pdf_dir);

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
                        job.progress(4, 4);
                        done();
                    }

                    // remove fp.lock file anyway.
                    fs.removeSync(preview_lock_path);
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
