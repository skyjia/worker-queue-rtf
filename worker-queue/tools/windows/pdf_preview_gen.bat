:: Only show output in console
@echo off

:: hide output
pdftk > nul

IF %ERRORLEVEL% EQU 9009 (

    echo Please install pdftk or add it to your OS environment path

    GOTO end
)

IF "%~1" EQU "" GOTO usage
IF "%~2" EQU "" GOTO usage
IF "%~3" EQU "" GOTO usage

:execute_pdftk
pdftk "%~1" cat %~2 output "%~3"
GOTO end

:usage
echo Usage:
echo pdf_preview_gen %%1 %%2 %%3
echo Set %%1 to source PDF file path like "D:\WorkingFolder\worker-queue-rtf\data\contentunit\123\origin\default.pdf"
echo Set %%2 to page range like "1-2 5-6"
echo Set %%3 to output PDF file path like "D:\WorkingFolder\worker-queue-rtf\data\mproduct\3\preview\1.pdf"
GOTO end

:end
