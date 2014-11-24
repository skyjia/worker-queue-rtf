:: Only show output in console
@echo off

:: hide output
FileOpenEncryptor > nul

IF %ERRORLEVEL% EQU 9009 (

    echo Please install FileOpenEncryptor or add it to your OS environment path

    GOTO end
)

IF "%~1" EQU "" GOTO usage
IF "%~2" EQU "" GOTO usage
IF "%~3" EQU "" GOTO usage

:execute_command

GOTO end

:end
