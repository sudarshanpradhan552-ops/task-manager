#!/usr/bin/env bash
# Render.com Build Script
# This builds BOTH the backend and frontend into one deployable unit.

set -e  # Exit immediately on error

echo "===> Installing Python dependencies..."
pip install -r requirements.txt

echo "===> Installing Node.js dependencies for frontend..."
cd task-manager
npm install

echo "===> Building React frontend..."
npm run build

echo "===> Build complete! dist/ folder is ready."
cd ..
