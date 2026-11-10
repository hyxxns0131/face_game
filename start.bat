@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py server.py
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python server.py
  goto :end
)
where npx >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000
  npx --yes serve -l 8000 .
  goto :end
)
echo.
echo  Python 또는 Node.js가 필요해요.
echo  https://www.python.org/downloads/ 에서 Python을 설치한 뒤 다시 실행해 주세요.
:end
pause
