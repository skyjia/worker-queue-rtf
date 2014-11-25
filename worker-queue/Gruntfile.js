module.exports = function (grunt) {
    // Load the plugin that provides the "jshint" task.
    grunt.loadNpmTasks('grunt-contrib-jshint');

    // Load the plugin that provides the "mochaTest" task.
    grunt.loadNpmTasks('grunt-mocha-test');

    // Project configuration.
    grunt.initConfig({

        jshint: {
            options: {
                jshintrc: true,
                reporter: require('jshint-stylish')
            },
            target1: ['Gruntfile.js', 'server/**/*.js', 'workers/**/*.js']
        },


        // Configure a mochaTest task
        mochaTest: {
            test: {
                options: {
                    reporter: 'spec',
                    captureFile: 'test/test_results.txt', // Optionally capture the reporter output to a file
                    quiet: false // Optionally suppress output to standard out (defaults to false)
                },
                src: ['test/**/*.js']
            }
        }
    });

    // Define the default task
    grunt.registerTask('default', ['jshint','mochaTest']);

};
