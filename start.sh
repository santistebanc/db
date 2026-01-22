#!/bin/bash

# Nodes App Startup Guide
# This script provides instructions for running the application

echo "=========================================="
echo "Nodes Management App - Startup Guide"
echo "=========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""
echo "Starting the Nodes Management Application..."
echo ""
echo "This will:"
echo "  1. Start a PostgreSQL database (port 5432)"
echo "  2. Start the backend API server (port 3000)"
echo "  3. Start the React frontend (port 3001)"
echo ""

# Start the services
docker-compose up

# After services are running, show URLs
echo ""
echo "=========================================="
echo "✅ Application is running!"
echo "=========================================="
echo ""
echo "Frontend:  http://localhost:3001"
echo "Backend:   http://localhost:3000"
echo "Database:  postgresql://postgres:postgres@localhost:5432/nodes_db"
echo ""
echo "To stop the application, press Ctrl+C"
echo ""
