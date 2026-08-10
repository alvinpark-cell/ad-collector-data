@echo off
REM Launches the scheduler in a fully detached console window, independent of
REM whatever process/session started this batch file. Kills any prior instance
REM (by window title) first to avoid duplicates.
cd /d "%~dp0"
taskkill /F /FI "WINDOWTITLE eq AdCollectorScheduler*" >nul 2>&1
start "AdCollectorScheduler" cmd /k node scheduler.js
echo Scheduler launched in a new window titled "AdCollectorScheduler" - do not close it.
