@echo off
REM Start SmartQ Development Servers
REM This batch file starts both backend and frontend in separate windows

echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║         SmartQ Development Environment Starter                ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

REM Start Backend
echo Starting Backend Server...
start "SmartQ Backend" cmd /k "cd backend && npm run dev"

REM Wait a moment for backend to start
timeout /t 3 /nobreak

REM Start Frontend
echo Starting Frontend Server...
start "SmartQ Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ✓ Both servers started in separate windows
echo.
echo Backend:  http://localhost:5001
echo Frontend: http://localhost:5173
echo.
echo Close either window to stop that server
echo.
timeout /t 5
