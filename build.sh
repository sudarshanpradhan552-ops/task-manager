#!/usr/bin/env bash
# Render.com Build Script — builds React frontend then installs Python deps
set -e

echo "===> Installing Python dependencies..."
pip install -r requirements.txt

echo "===> Installing Node.js dependencies for frontend..."
cd task-manager
npm install

echo "===> Building React frontend..."
npm run build

cd ..

echo "===> Build complete! Frontend dist is at task-manager/dist/"
