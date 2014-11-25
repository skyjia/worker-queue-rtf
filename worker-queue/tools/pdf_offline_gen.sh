#!/bin/bash

# Any subsequent commands which fail will cause the shell script to exit immediately
set -e

# folder path for current script file
DIR=`dirname $0`
cd $DIR

# Get absolute path of current working folder
PWD=`pwd -P`

echo "Generating PDF $2 from $1"