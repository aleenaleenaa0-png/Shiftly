#!/bin/bash
# Start Backend Server
# Run this script to start the ASP.NET Core backend server
# The backend will run on http://localhost:5224

echo "Starting Shiftly Backend Server..."
echo "Backend will run on http://localhost:5224"
echo ""

cd Backend/Backend/Backend
dotnet run

