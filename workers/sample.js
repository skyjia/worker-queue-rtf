// Common Helper functions
var exec = require('child_process').exec;

function execute(command, callback) {
    exec(command, function (error, stdout, stderr) {
        callback(stdout);
    });
}

var path = require('path');

var sample_worker = function (job, done, ctx) {

    var script_path = path.resolve(__dirname, "../tools/pdf2swf.sh");
    var command = 'sh ' + script_path;
    execute(command, function (echo_string) {
        job.progress(1, 2);
        job.log("Script output: %s %s", echo_string, job.data.title);
        job.progress(2, 2);
        job.log("Processed on port %d", process.env.PORT);
        done();
    });

};

module.exports = sample_worker;