@echo off
cd /d C:\Users\Corsair\Desktop\smm-dev
if not exist .tmp mkdir .tmp
del /q .tmp\next-start.out.log 2>nul
del /q .tmp\next-start.err.log 2>nul
"C:\Program Files\nodejs\node.exe" ".\node_modules\next\dist\bin\next" start --port 3196 1>> ".tmp\next-start.out.log" 2>> ".tmp\next-start.err.log"
