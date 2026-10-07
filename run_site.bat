@echo off
rem PRISM: one-click start on Windows. Double-click this file (it must sit next to the "backend" and "site" folders).
cd /d "%~dp0backend" || (echo Could not find the "backend" folder next to this file. & pause & exit /b 1)
where python >nul 2>nul || (echo Python 3.11 or newer is needed: https://www.python.org/downloads/  - tick "Add python.exe to PATH" & pause & exit /b 1)
if not exist .venv (
  echo Creating a Python environment, first run only...
  python -m venv .venv || (echo Could not create the environment. & pause & exit /b 1)
)
call .venv\Scripts\activate.bat
echo Installing packages, first run takes a few minutes...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -e ".[dev]" || (echo Package install failed - see the message above. & pause & exit /b 1)
python scripts\seed.py || (echo Database setup failed - see the message above. & pause & exit /b 1)
set MOCK_MODE=false
start "" cmd /c "timeout /t 5 >nul & start http://localhost:8000"
echo.
echo PRISM is running at http://localhost:8000  - close this window to stop it.
python -m uvicorn app.main:app --port 8000
pause
