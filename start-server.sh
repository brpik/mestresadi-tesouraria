#!/bin/bash
# Script para iniciar servidor HTTP local (Node.js)
# Execute: bash start-server.sh ou chmod +x start-server.sh && ./start-server.sh

PORT=8001

echo "=========================================="
echo "🚀 Iniciando servidor HTTP local..."
echo "📂 Diretório: $(pwd)"
echo "🌐 Porta: $PORT"
echo "=========================================="
echo ""

# Verifica se Python 3 está instalado
if command -v node &> /dev/null; then
    echo "✅ Node.js encontrado"
    if [ -f "package.json" ]; then
        if [ ! -d "node_modules" ]; then
            echo "📦 Instalando dependências..."
            npm install
        fi
    fi
    node server.js
else
    echo "❌ Node.js não encontrado."
    echo "Instale Node.js para executar o servidor."
    exit 1
fi
