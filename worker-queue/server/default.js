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

var isWin = /^win/.test(process.platform);

// Init logger
var winston = require('winston');
winston.cli();

// TODO: support write log in MongoDB.
// TODO: support write log in Kafka.
// TODO: support enable/disable a transport according to settings.
// FIXME: support file transport in Windows.
var winstonOptions;
if(isWin){
    winstonOptions = {
        transports: [
            // Console logger
            new (winston.transports.Console)({
                colorize: true,
                timestamp: true
            })
        ],
        exceptionHandlers: [
            new (winston.transports.Console)({
                colorize: true,
                timestamp: true
            })
        ]
    }
} else {
    winstonOptions = {
        transports: [
            // Console logger
            new (winston.transports.Console)({
                colorize: true,
                timestamp: true
            }),

            // File logger
            new winston.transports.File({
                filename: cfg.logger.run_log_file.path,
                maxsize: cfg.logger.run_log_file.maxsize,
                maxFiles: cfg.logger.run_log_file.maxFiles
            })
        ],
        exceptionHandlers: [
            new winston.transports.File({
                filename: cfg.logger.exception_log_file.path,
                maxsize: cfg.logger.exception_log_file.maxsize,
                maxFiles: cfg.logger.exception_log_file.maxFiles
            })
        ]
    };
}

var logger = new (winston.Logger)(winstonOptions);

// Init Queue options
var kue = require('kue');
var DEFAULT_HTTP_PORT = 3000;
var port = cfg.http.port || process.env.PORT || DEFAULT_HTTP_PORT;
var redis_options = cfg.redis_conn;

// Create Queue
var queue = kue.createQueue({
    disableSearch: true,
    prefix: cfg.job_prefix,
    redis: redis_options
});

// Graceful shutdown
process.once('SIGINT', function () {
    queue.shutdown(function (err) {
        logger.info('Kue is shutting down.', err || null);
        process.exit(0);
    }, 5000);
});


// Export application
var app = {
    cfg: cfg,
    logger: logger,
    queue: queue
};

module.exports = app;

if (cfg.cluster_mode) {
    // Working in cluster mode

    var cluster = require('cluster');
    var maxClusterWorkerSize = require('os').cpus().length;
    var workerSize = cfg.cluster_worker_size > maxClusterWorkerSize ? maxClusterWorkerSize : cfg.cluster_worker_size;

    if (cluster.isMaster) {
        logger.info("Node [%s] is working",cfg.name);
        logger.info("Kue is working in cluster mode.");
        logger.info("Cluster size is ", workerSize);
        logger.info("Kue is connecting to", redis_options.host + ":" + redis_options.port);
        logger.info("Queue prefix:", cfg.job_prefix);

        for (var i = 0; i < workerSize; i++) {
            cluster.fork();
        }

        queue.promote();

        // Start RESTful API listerning
        kue.app.listen(port);
        logger.info("Kue RESTful API is listening on port", port);


    } else if (cluster.isWorker) {

        // Register workers
        var registerWorkers = require('./register_workers.js');
        registerWorkers(app, queue);
    }

} else {
    // Working in single process mode.
    logger.info("Node [%s] is working",cfg.name);
    logger.info("Kue is working in single process mode.");
    logger.info("Kue is connecting to", redis_options.host + ":" + redis_options.port);
    logger.info("Queue prefix:", cfg.job_prefix);

    // Register workers
    var registerWorkers = require('./register_workers.js');
    registerWorkers(app, queue);

    queue.promote();

    // Start RESTful API listerning
    kue.app.listen(port);
    logger.info("Kue RESTful API is listening on port", port);
}

