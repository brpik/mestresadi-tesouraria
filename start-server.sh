#!/bin/bash
# Script para iniciar servidor HTTP local (com suporte a PUT)
# Execute: bash start-server.sh ou chmod +x start-server.sh && ./start-server.sh

PORT=8001

echo "=========================================="
echo "🚀 Iniciando servidor HTTP local..."
echo "📂 Diretório: $(pwd)"
echo "🌐 Porta: $PORT"
echo "=========================================="
echo ""

# Verifica se Python 3 está instalado
if command -v python3 &> /dev/null; then
    echo "✅ Python 3 encontrado"
    python3 server.py
elif command -v python &> /dev/null; then
    echo "✅ Python encontrado"
    python server.py
else
    echo "❌ Python não encontrado."
    echo "Instale Python para executar o servidor com suporte a PUT."
    exit 1
fi
