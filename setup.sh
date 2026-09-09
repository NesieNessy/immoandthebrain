#!/bin/bash

echo "================================"
echo "ImmoAndTheBrain Development Setup"
echo "================================"
echo ""

echo "Checking prerequisites..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed. Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi
echo "[OK] Node.js found: $(node --version)"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed. Please install Docker Desktop from https://www.docker.com/"
    exit 1
fi
echo "[OK] Docker found: $(docker --version)"

echo ""
echo "================================"
echo "All prerequisites satisfied!"
echo "================================"
echo ""

echo "Setting up environment..."
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "[OK] .env file created. Please review and update if needed."
else
    echo "[INFO] .env file already exists"
fi

echo ""
echo "Installing dependencies..."
echo ""

echo "Installing web app dependencies..."
cd apps/web
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install web app dependencies"
    cd ../..
    exit 1
fi
cd ../..
echo "[OK] Web app dependencies installed"

echo ""
echo "Installing shared types dependencies..."
cd packages/types
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install types package dependencies"
    cd ../..
    exit 1
fi
cd ../..
echo "[OK] Types package dependencies installed"

echo ""
echo "================================"
echo "Setup Complete!"
echo "================================"
echo ""
echo "You can now start the development servers:"
echo ""
echo "Option 1: Start all services with Docker Compose"
echo "  docker-compose up --build"
echo ""
echo "Option 2: Start services individually"
echo "  Terminal 1: docker-compose up supabase-db supabase-kong"
echo "  Terminal 2: cd apps/web && npm run dev"
echo ""
echo "Access points:"
echo "  - Web App: http://localhost:3000"
echo "  - Supabase Studio: http://localhost:54324"
echo ""
