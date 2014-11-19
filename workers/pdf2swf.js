// Common Helper functions
var exec = require('child_process').exec;

function execute(command, callback) {
    return exec(command, function (error, stdout, stderr) {
        callback(stdout);
    });
}

var path = require('path');
var util = require('util');
var fs = require("fs");
var mkdirp = require('mkdirp');

var isWin = /^win/.test(process.platform);

function isPathAvailable(basePath, checkingPath){
    return checkingPath.indexOf(basePath)===0;
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

    this.handler = function (job, done, ctx) {

        var data_path = path.resolve(that.settings.data_path);
        var input_pdf_path = path.resolve(job.data.input);
        var output_swf_path = path.resolve(job.data.output);

        var command = util.format(that.command_format, that.script, input_pdf_path, output_swf_path);

        // security check. avoid access system files
        if(!isPathAvailable(data_path,input_pdf_path)){
            done(new Error('Input file path is invalid.'));

            // TODO: disable retry

            return;
        }

        if(!isPathAvailable(data_path,output_swf_path)){
            done(new Error('Output file path is invalid.'));

            // TODO: disable retry

            return;
        }

        var executeGeneration = function () {
            logger.info("EXEC: %s", command);
            job.progress(2, 3);

            var child_process = exec(command, function (error, stdout, stderr) {
                logger.info(stdout);

                if (stderr.length > 0) {
                    logger.warn(stderr);
                }

                if (error !== null) {
                    logger.error('exec error: ' + error);
                }

                job.progress(3, 3);
                done();
            });
        };

        // Create output folder if not exists
        var output_swf_dir = path.dirname(output_swf_path);
        fs.exists(output_swf_dir, function (exists) {
            if (exists) {
                executeGeneration();
            } else {
                if (job.data.mkdirp) {
                    mkdirp(output_swf_dir, function (err) {
                        if (err) {
                            logger.error(err);
                            done(new Error('Cannot create output directory.'));
                            return;
                        }

                        executeGeneration();
                    });

                } else {
                    done(new Error("Output directory doesn't exist."));

                }
            }
        });
    };

    return this;
};

module.exports = initiliazer;