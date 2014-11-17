var path = require('path');
var fs = require('fs');
var currentEnv = process.env.NODE_ENV || 'development';
// Parsing and checking the arguments from command
var argv = require('optimist')
    .usage('Usage: $0 -c path/to/your_config_file')
    .alias('c', 'config')
    .describe('c', 'Set the config file.')
    .argv;


// Loading configuration
//  1. Loading `./conf/default.yml` (relative to app.js file), the default config file.
//  2.a. Loading `./conf/$NODE_ENV$.yml` (relative to launching path) if `-c` argument is not specified. (NODE_ENV defaults to `development`)
//  2.b. Loading `-c` specified file if using `-c` argument.
var configFiles = [path.resolve(__dirname, "./conf/default.yml")];
var env_config_filepath = path.resolve("./conf/" + currentEnv + ".yml");
if (fs.existsSync(env_config_filepath)) {
    configFiles.push(env_config_filepath);
}

if (argv.config) {
    var user_config_filepath = path.resolve(argv.config);
    if (fs.existsSync(user_config_filepath)) {
        configFiles.push(user_config_filepath)
    }
}

var config_loader = require('configuration-loader').createLoader(configFiles);
var cfg = config_loader.reload();


// Init Queue options
var kue = require('kue');
var DEFAULT_HTTP_PORT = 3000;
var port = cfg.http.port || process.env.PORT || DEFAULT_HTTP_PORT;
var redis_options = cfg.redis_conn;

// Create Queue
var jobs = kue.createQueue({
    prefix: cfg.job_prefix,
    redis: redis_options
});


if (cfg.cluster_mode) {
    // Working in cluster mode

    var cluster = require('cluster');
    var maxClusterWorkerSize = require('os').cpus().length;
    var workerSize = cfg.cluster_worker_size > maxClusterWorkerSize ? maxClusterWorkerSize : cfg.cluster_worker_size;

    if (cluster.isMaster) {
        console.log("Kue is connectint to", redis_options.host + ":" + redis_options.port);
        console.log("Queue prefix:", cfg.job_prefix);

        console.log("Kue is working in cluster mode.");
        console.log("Cluster size is ", workerSize);

        // Start RESTful API listerning
        kue.app.listen(port);
        console.log("Kue RESTful API is listening on port", port);

        for (var i = 0; i < workerSize; i++) {
            cluster.fork();
        }
    } else if (cluster.isWorker) {
        // Register workers
        var registerWorkers = require('../workers/register.js');
        registerWorkers(jobs);
    }

} else {
    // Working in single process mode.

    console.log("Kue is connectint to", redis_options.host + ":" + redis_options.port);
    console.log("Queue prefix:", cfg.job_prefix);

    console.log("Kue is working in single process mode.");

    // Start RESTful API listerning
    kue.app.listen(port);
    console.log("Kue RESTful API is listening on port", port);

    // Register workers
    var registerWorkers = require('../workers/register.js');
    registerWorkers(jobs);
}
