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
which pdf2swf
OUT=$?

if [ $OUT -eq 0 ];then
   pdf2swf $1 -o $2 -f -T 9 -t -s storeallcharacters
else
   error "pdf2swf tool is not found!"
fi
