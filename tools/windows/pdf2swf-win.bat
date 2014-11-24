:: Only show output in console
@echo off

:: hide output
pdf2swf > nul

IF %ERRORLEVEL% EQU 9009 (

    echo Please install pdf2swf or add it to your OS environment path

    GOTO end
)

IF "%~1" EQU "" GOTO usage
IF "%~2" EQU "" GOTO usage

:execute_pdf2swf
pdf2swf "%~1" -o "%~2" -f -T 9 -t -s storeallcharacters
GOTO end

:usage
echo Usage:
echo pdf2swf-win %%1 %%2%
echo Set %%1 to an absolute file path like "D:\WorkingFolder\worker-queue-rtf\data\contentunit\123\origin\default.pdf"
echo Set %%2 to an absolute file path like "D:\WorkingFolder\worker-queue-rtf\data\contentunit\123\fp\%%.swf"
GOTO end

:end
