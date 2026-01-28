#!/bin/bash
# Script para iniciar servidor HTTP local
# Execute: bash start-server.sh ou chmod +x start-server.sh && ./start-server.sh

PORT=8000

echo "=========================================="
echo "🚀 Iniciando servidor HTTP local..."
echo "📂 Diretório: $(pwd)"
echo "🌐 Porta: $PORT"
echo "=========================================="
echo ""

# Verifica se Python 3 está instalado
if command -v python3 &> /dev/null; then
    echo "✅ Python 3 encontrado"
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    echo "✅ Python encontrado"
    python -m http.server $PORT
else
    echo "❌ Python não encontrado. Instalando servidor alternativo..."
    
    # Tenta usar PHP se disponível
    if command -v php &> /dev/null; then
        echo "✅ PHP encontrado"
        php -S localhost:$PORT
    else
        echo "❌ Nenhum servidor HTTP encontrado."
        echo "Por favor, instale Python ou PHP para executar este script."
        exit 1
    fi
fi
