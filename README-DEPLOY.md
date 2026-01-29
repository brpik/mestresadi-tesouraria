# 🚀 Guia Rápido de Deploy - Digital Ocean

## Passo a Passo Rápido

### 1. Conectar ao servidor

```bash
ssh root@seu-ip-do-digital-ocean
```

### 2. Executar script de setup (mais fácil)

```bash
cd /tmp
wget https://raw.githubusercontent.com/brpik/mestresadi-tesouraria/main/setup-server.sh
chmod +x setup-server.sh
sudo bash setup-server.sh
```

### 3. Ou fazer manualmente

#### Instalar dependências

```bash
sudo apt update
sudo apt install python3 python3-pip git -y
```

#### Clonar repositório

```bash
cd /var/www
sudo git clone git@github.com:brpik/mestresadi-tesouraria.git
cd mestresadi-tesouraria
sudo chown -R www-data:www-data .
```

#### Criar serviço systemd

```bash
sudo nano /etc/systemd/system/mestresadi.service
```

Cole:

```ini
[Unit]
Description=Sistema de Gestão de Mensalidades - Mestre Sadi
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/mestresadi-tesouraria
ExecStart=/usr/bin/node /var/www/mestresadi-tesouraria/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### Ativar serviço

```bash
sudo systemctl daemon-reload
sudo systemctl enable mestresadi.service
sudo systemctl start mestresadi.service
sudo systemctl status mestresadi.service
```

#### Configurar firewall

```bash
sudo ufw allow 8001/tcp
sudo ufw enable
```

### 4. Acessar

Acesse: `http://seu-ip:8001`

## Configurar Nginx (Recomendado)

### 1. Instalar Nginx

```bash
sudo apt install nginx -y
```

### 2. Copiar configuração

```bash
sudo cp /var/www/mestresadi-tesouraria/nginx-config.conf /etc/nginx/sites-available/mestresadi
sudo nano /etc/nginx/sites-available/mestresadi
# Edite e substitua "seu-dominio.com" pelo seu domínio ou IP
```

### 3. Ativar site

```bash
sudo ln -s /etc/nginx/sites-available/mestresadi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Configurar SSL (Opcional)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d seu-dominio.com
```

## Comandos Úteis

```bash
# Ver logs
sudo journalctl -u mestresadi.service -f

# Reiniciar
sudo systemctl restart mestresadi.service

# Parar
sudo systemctl stop mestresadi.service

# Status
sudo systemctl status mestresadi.service

# Atualizar código
cd /var/www/mestresadi-tesouraria
sudo git pull
sudo systemctl restart mestresadi.service
```

## Backup Automático

Criar script de backup:

```bash
sudo nano /usr/local/bin/backup-mestresadi.sh
```

Cole:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/mestresadi"
mkdir -p $BACKUP_DIR
cp /var/www/mestresadi-tesouraria/file.json $BACKUP_DIR/file-$(date +%Y%m%d-%H%M%S).json
find $BACKUP_DIR -name "file-*.json" -mtime +30 -delete
```

Tornar executável e agendar:

```bash
sudo chmod +x /usr/local/bin/backup-mestresadi.sh
sudo crontab -e
# Adicionar: 0 2 * * * /usr/local/bin/backup-mestresadi.sh
```

## Troubleshooting

### Servidor não inicia

```bash
sudo journalctl -u mestresadi.service -n 50
```

### Porta em uso

```bash
sudo netstat -tulpn | grep 8001
sudo kill -9 PID_DO_PROCESSO
```

### Permissões

```bash
sudo chown -R www-data:www-data /var/www/mestresadi-tesouraria
sudo chmod 644 /var/www/mestresadi-tesouraria/file.json
```
