#!/bin/bash
# Script de setup para Digital Ocean
# Execute: bash setup-server.sh

set -e

echo "🚀 Configurando servidor para Sistema de Gestão de Mensalidades..."

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  Este script precisa ser executado como root ou com sudo"
    exit 1
fi

# 1. Atualizar sistema
echo -e "${YELLOW}📦 Atualizando sistema...${NC}"
apt update
apt upgrade -y

# 2. Instalar Python 3 e pip
echo -e "${YELLOW}🐍 Instalando Python 3...${NC}"
apt install -y python3 python3-pip

# 3. Instalar Git (se não tiver)
echo -e "${YELLOW}📥 Instalando Git...${NC}"
apt install -y git

# 4. Criar diretório para aplicação
echo -e "${YELLOW}📁 Criando diretório...${NC}"
mkdir -p /var/www
cd /var/www

# 5. Clonar repositório (se ainda não tiver)
if [ ! -d "mestresadi-tesouraria" ]; then
    echo -e "${YELLOW}📥 Clonando repositório...${NC}"
    git clone git@github.com:brpik/mestresadi-tesouraria.git
else
    echo -e "${GREEN}✅ Repositório já existe${NC}"
fi

cd mestresadi-tesouraria

# 6. Configurar permissões
echo -e "${YELLOW}🔐 Configurando permissões...${NC}"
chown -R www-data:www-data /var/www/mestresadi-tesouraria
chmod 755 /var/www/mestresadi-tesouraria
chmod 644 /var/www/mestresadi-tesouraria/file.json

# 7. Criar serviço systemd
echo -e "${YELLOW}⚙️  Criando serviço systemd...${NC}"
cat > /etc/systemd/system/mestresadi.service << 'EOF'
[Unit]
Description=Sistema de Gestão de Mensalidades - Mestre Sadi
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/mestresadi-tesouraria
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/python3 /var/www/mestresadi-tesouraria/server.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 8. Ativar e iniciar serviço
echo -e "${YELLOW}🔄 Ativando serviço...${NC}"
systemctl daemon-reload
systemctl enable mestresadi.service
systemctl start mestresadi.service

# 9. Configurar firewall
echo -e "${YELLOW}🔥 Configurando firewall...${NC}"
ufw allow 8001/tcp
ufw --force enable

# 10. Verificar status
echo -e "${GREEN}✅ Verificando status do serviço...${NC}"
sleep 2
systemctl status mestresadi.service --no-pager

echo ""
echo -e "${GREEN}✅ Setup concluído!${NC}"
echo ""
echo "📋 Próximos passos:"
echo "1. Configure o Nginx (opcional mas recomendado)"
echo "2. Configure SSL com Let's Encrypt"
echo "3. Acesse: http://seu-ip:8001"
echo ""
echo "📝 Comandos úteis:"
echo "  - Ver logs: sudo journalctl -u mestresadi.service -f"
echo "  - Reiniciar: sudo systemctl restart mestresadi.service"
echo "  - Status: sudo systemctl status mestresadi.service"
