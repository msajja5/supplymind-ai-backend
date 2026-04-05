#!/bin/bash
# SupplyMind AI — Codespaces Setup Script
# Auto-runs after container creation

echo ""
echo "======================================================"
echo "  SupplyMind AI — GitHub Codespaces Setup"
echo "======================================================"

# Install deps
npm install

# Create .env.local from example if not exists
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "✅ Created .env.local from .env.example"
  echo "⚠️  Fill in your credentials in .env.local"
fi

echo ""
echo "Ready! Commands:"
echo "  npm run dev       → Start API server on port 3000"
echo "  npm test          → Run 25 Jest tests (offline)"
echo "  npm run simulate  → Simulate WhatsApp pipeline"
echo ""
