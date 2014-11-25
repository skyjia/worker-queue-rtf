#!/bin/bash

# Any subsequent commands which fail will cause the shell script to exit immediately
#set -e

# folder path for current script file
DIR=`dirname $0`

# Get absolute path of current working folder
PWD=`pwd -P`

error() {
	echo "ERROR: $*" 1>&2
	exit 2
}

# check pdf2swf tool exists
which pdftk
OUT=$?

if [ $OUT -eq 0 ];then
   pdftk "$1" cat $2 output "$3"
else
   error "pdftk tool is not found!"
fi