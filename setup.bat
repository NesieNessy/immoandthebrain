@echo off
echo ================================
echo ImmoAndTheBrain Development Setup
echo ================================
echo.

echo Checking prerequisites...
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js 20+ from https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found:
node --version

REM Check Docker
where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker is not installed. Please install Docker Desktop from https://www.docker.com/
    pause
    exit /b 1
)
echo [OK] Docker found:
docker --version

echo.
echo ================================
echo All prerequisites satisfied!
echo ================================
echo.

echo Setting up environment...
if not exist .env (
    echo Creating .env file from template...
    copy .env.example .env
    echo [OK] .env file created. Please review and update if needed.
) else (
    echo [INFO] .env file already exists
)

echo.
echo Installing dependencies...
echo.

echo Installing web app dependencies...
cd apps\web
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install web app dependencies
    cd ..\..
    pause
    exit /b 1
)
cd ..\..
echo [OK] Web app dependencies installed

echo.
echo Installing shared types dependencies...
cd packages\types
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install types package dependencies
    cd ..\..
    pause
    exit /b 1
)
cd ..\..
echo [OK] Types package dependencies installed

echo.
echo ================================
echo Setup Complete!
echo ================================
echo.
echo You can now start the development servers:
echo.
echo Option 1: Start all services with Docker Compose
echo   docker-compose up --build
echo.
echo Option 2: Start services individually
echo   Terminal 1: docker-compose up supabase-db supabase-kong
echo   Terminal 2: cd apps\web ^&^& npm run dev
echo.
echo Access points:
echo   - Web App: http://localhost:3000
echo   - Supabase Studio: http://localhost:54324
echo.
pause
