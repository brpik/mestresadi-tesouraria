# Guia de Deploy - Digital Ocean

## Pré-requisitos

### 1. Instalar Python 3

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3 python3-pip -y

# Verificar versão
python3 --version
```

### 2. Instalar Git (se ainda não tiver)

```bash
sudo apt install git -y
```

## Deploy

### 1. Clonar o repositório

```bash
cd /var/www
sudo git clone git@github.com:brpik/mestresadi-tesouraria.git
sudo chown -R $USER:$USER mestresadi-tesouraria
cd mestresadi-tesouraria
```

### 2. Configurar o servidor

O servidor já está configurado para rodar na porta 8001. Você pode alterar no arquivo `server.py` se necessário.

### 3. Opção 1: Rodar com systemd (Recomendado)

Criar serviço systemd para iniciar automaticamente:

```bash
sudo nano /etc/systemd/system/mestresadi.service
```

Conteúdo do arquivo:

```ini
[Unit]
Description=Sistema de Gestão de Mensalidades - Mestre Sadi
After=network.target

[Service]
Type=simple
User=seu_usuario
WorkingDirectory=/var/www/mestresadi-tesouraria
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/python3 /var/www/mestresadi-tesouraria/server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Substitua `seu_usuario` pelo seu usuário do sistema!**

Ativar e iniciar o serviço:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mestresadi.service
sudo systemctl start mestresadi.service
sudo systemctl status mestresadi.service
```

### 4. Opção 2: Rodar com PM2 (Alternativa)

```bash
# Instalar PM2
sudo npm install -g pm2

# Iniciar servidor
pm2 start server.py --name mestresadi --interpreter python3

# Salvar configuração
pm2 save

# Configurar para iniciar no boot
pm2 startup
```

### 5. Configurar Firewall

```bash
# Permitir porta 8001
sudo ufw allow 8001/tcp

# Ou se usar nginx (recomendado), permitir apenas 80 e 443
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Configuração com Nginx (Recomendado)

### 1. Instalar Nginx

```bash
sudo apt install nginx -y
```

### 2. Criar configuração do site

```bash
sudo nano /etc/nginx/sites-available/mestresadi
```

Conteúdo:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;  # Substitua pelo seu domínio ou IP

    location / {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Ativar site

```bash
sudo ln -s /etc/nginx/sites-available/mestresadi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Configurar SSL com Let's Encrypt (Opcional mas recomendado)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d seu-dominio.com
```

## Comandos Úteis

### Ver logs do servidor

```bash
# Com systemd
sudo journalctl -u mestresadi.service -f

# Com PM2
pm2 logs mestresadi
```

### Reiniciar servidor

```bash
# Com systemd
sudo systemctl restart mestresadi.service

# Com PM2
pm2 restart mestresadi
```

### Parar servidor

```bash
# Com systemd
sudo systemctl stop mestresadi.service

# Com PM2
pm2 stop mestresadi
```

## Estrutura de Diretórios

```
/var/www/mestresadi-tesouraria/
├── server.py          # Servidor Python
├── index.html         # Página de login
├── dashboard.html     # Dashboard principal
├── confirmacao.html   # Página de confirmação
├── file.json          # Banco de dados (JSON)
└── ...
```

## Backup do file.json

É importante fazer backup regular do `file.json`:

```bash
# Criar script de backup
sudo nano /usr/local/bin/backup-mestresadi.sh
```

Conteúdo:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/mestresadi"
mkdir -p $BACKUP_DIR
cp /var/www/mestresadi-tesouraria/file.json $BACKUP_DIR/file-$(date +%Y%m%d-%H%M%S).json
# Manter apenas últimos 30 backups
find $BACKUP_DIR -name "file-*.json" -mtime +30 -delete
```

Tornar executável:

```bash
sudo chmod +x /usr/local/bin/backup-mestresadi.sh
```

Adicionar ao crontab (backup diário às 2h da manhã):

```bash
sudo crontab -e
# Adicionar linha:
0 2 * * * /usr/local/bin/backup-mestresadi.sh
```

## Troubleshooting

### Servidor não inicia

```bash
# Verificar logs
sudo journalctl -u mestresadi.service -n 50

# Verificar se porta está em uso
sudo netstat -tulpn | grep 8001
```

### Permissões

```bash
# Garantir que o usuário tem permissão de escrita no file.json
sudo chown -R $USER:$USER /var/www/mestresadi-tesouraria
chmod 644 /var/www/mestresadi-tesouraria/file.json
```

### Atualizar código

```bash
cd /var/www/mestresadi-tesouraria
git pull
sudo systemctl restart mestresadi.service
```
