#!/usr/bin/env bash
# Render.com Build Script - Python only (React dist is pre-built and committed)
set -e

echo "===> Installing Python dependencies..."
pip install -r requirements.txt

echo "===> Build complete!"
