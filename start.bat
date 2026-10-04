@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   廖老爷中国象棋 - 本地服务器启动器
echo ============================================
echo.

rem 若 8080 被占用则自动向后寻找可用端口
call :find_port 8080

set "SERVER="

where node >nul 2>nul
if %errorlevel%==0 (
    set "SERVER=node"
    set "KIND=Node.js"
    goto :ready
)

where python >nul 2>nul
if %errorlevel%==0 (
    set "SERVER=python"
    set "KIND=Python"
    goto :ready
)

where py >nul 2>nul
if %errorlevel%==0 (
    set "SERVER=py"
    set "KIND=Python (py)"
    goto :ready
)

echo [ERROR] 未找到 Node.js 或 Python。
echo.
echo 请先安装其中之一：
echo   Node.js: https://nodejs.org
echo   Python:  https://www.python.org
echo.
pause
goto :end

:ready
echo [OK] 找到 !KIND!，端口 !FOUND_PORT!。
echo     浏览器访问:  http://localhost:!FOUND_PORT!
echo     按 Ctrl+C 停止服务器。
echo.

rem 后台延迟 2 秒打开浏览器（用独立 cmd 执行，避免嵌套引号被误解析）
start "open-browser" /min cmd /c "timeout /t 2 /nobreak >nul & start "" "http://localhost:!FOUND_PORT!""

if /i "!SERVER!"=="node" (
    node "%~dp0tools\server.js" !FOUND_PORT!
) else if /i "!SERVER!"=="python" (
    python -m http.server !FOUND_PORT! --directory "%~dp0"
) else (
    py -m http.server !FOUND_PORT! --directory "%~dp0"
)

echo.
echo [服务器已停止] 如果上方出现错误信息，请检查安装或端口占用。
pause

:end
endlocal

rem ============================================================
rem  :find_port  <起始端口>
rem  返回第一个未被占用的端口于 FOUND_PORT
rem ============================================================
:find_port
set "FOUND_PORT=%~1"
:find_port_loop
netstat -ano | findstr /r /c:":%FOUND_PORT% .*LISTENING" >nul 2>nul
if errorlevel 1 goto :eof
set /a FOUND_PORT=%FOUND_PORT%+1
goto :find_port_loop
