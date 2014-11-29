:: Only show output in console
@echo off

:: Record current directory
set OLDDIR=%CD%

:: Change to script file directory "%~dp0"
CD /d %~dp0

:: current folder
set CURRENT_DIR=%CD%

echo CURRENT_DIR=%CURRENT_DIR%

:: folder to extract nar file
set EXTRACT_FOLDER=%TEMP%\nar_ext_pkg
set WORKER_QUEUE_FOLDER=%EXTRACT_FOLDER%\worker_queue

echo WORKER_QUEUE_FOLDER=%WORKER_QUEUE_FOLDER%
echo.

IF "%1" == "" goto usage

:: email-service
IF "%1" == "worker-queue" (

	IF EXIST %WORKER_QUEUE_FOLDER% (
		rmdir /S /Q %WORKER_QUEUE_FOLDER%
	)

	nar extract worker_queue-0.1.1.nar -o %WORKER_QUEUE_FOLDER%
	pushd %WORKER_QUEUE_FOLDER% && node %WORKER_QUEUE_FOLDER%\server\default.js --config %CURRENT_DIR%\job_queue_dev_win.yml && popd

	goto end
)

:usage
:: usage help
echo Usage run.bat ^<command^>
echo.
echo where command is one of:
echo worker-queue
echo.
echo Examples:
echo   .\run.bat worker-queue
echo   set PORT=3003 ^&^& .\run.bat worker-queue

:end
:: restore to old directory
chdir /d %OLDDIR%