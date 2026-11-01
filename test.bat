@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

set "LOC=臺北市"

echo Testing 7-Day Forecast for %LOC%...
curl -G -i "http://127.0.0.1:8787/api/7day/forecast" --data-urlencode "location=%LOC%"
echo.
echo.
echo Testing 36-Hour Forecast for %LOC%...
curl -G -i "http://127.0.0.1:8787/api/36hour/forecast" --data-urlencode "location=%LOC%"
echo.
