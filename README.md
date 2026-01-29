# Sistema de Gestão de Mensalidades

Sistema web para gerenciamento de mensalidades com autenticação por senha.

## Características

- 🔐 Autenticação por senha mestra
- 📊 Gestão completa de irmãos e pagamentos
- 💰 Cálculo automático de valores em aberto
- 📱 Integração com WhatsApp para cobrança
- 💾 Backup e restauração de dados em JSON
- 📄 Importação de dados via Excel (XLSX)
- 🔍 Busca e filtros avançados
- 📱 Responsivo e funciona como PWA

## Instalação

1. Faça o download de todos os arquivos
2. Certifique-se de ter os seguintes arquivos:
   - `index.html` (tela de login)
   - `dashboard.html` (painel principal)
   - `dashboard.js` (lógica da aplicação)
   - `messages.js` (mensagens personalizáveis)
   - `xlsx.full.min.js` (biblioteca para ler Excel)
   - `manifest.webapp.json` (manifesto PWA)
   - `file.json` (dados dos irmãos e pagamentos)

## Como Usar

### ⚠️ IMPORTANTE: Use um Servidor HTTP Local

**NÃO abra diretamente o arquivo `index.html` no navegador** (protocolo `file://`), pois o CORS bloqueará o carregamento do `file.json`.

### Opção 1: Usar Node.js (Recomendado)

```bash
npm install
node server.js
```
Depois acesse: `http://localhost:8001/index.html`

### Opção 2: Usar o Script Shell

```bash
bash start-server.sh
```

Ou no macOS/Linux:
```bash
chmod +x start-server.sh
./start-server.sh
```
### Observação importante

Servidores estáticos como `python -m http.server` ou `php -S` **não suportam PUT**,
então a confirmação de pagamentos **não será salva**. Use sempre o `server.js`.

### Acesso

1. Inicie um servidor HTTP local (veja opções acima)
2. Acesse `http://localhost:8001/index.html` no navegador
3. Digite a senha: `mestresadi123A@`
4. Clique em "Entrar"

### Funcionalidades

- **Importar Dados**: Carregue um arquivo Excel (.xlsx) com as abas "IRMAOS" e "PAGAMENTOS"
- **Editar Dados**: Clique em qualquer campo para editar diretamente
- **Adicionar Pagamentos**: Use o botão "+ Adicionar Pagamento" no histórico de cada irmão
- **Cobrar via WhatsApp**: Clique no botão "📱 Cobrar" para enviar mensagem automática
- **Backup**: Use o botão "💾 Backup JSON" para salvar seus dados
- **Restaurar**: Use o botão "📥 Restaurar Backup" para carregar dados salvos

## Estrutura de Dados

### Excel (XLSX)

**Aba IRMAOS:**
- nome
- cpf
- whatsapp
- email
- data_nascimento

**Aba PAGAMENTOS:**
- cpf (para vincular ao irmão)
- competencia (formato: YYYY-MM)
- status (EM_ABERTO, PAGO, ISENTO, ACORDO)
- data_pagamento (formato: DD/MM/YYYY)
- obs
- valor

### JSON

```json
{
  "irmaos": [
    {
      "id": 1,
      "nome": "Nome do Irmão",
      "cpf": "000.000.000-00",
      "whatsapp": "5511999999999",
      "email": "email@exemplo.com",
      "data_nascimento": "01/01/1990",
      "ativo": true
    }
  ],
  "pagamentos": [
    {
      "id_irmao": 1,
      "competencia": "2026-01",
      "status": "EM_ABERTO",
      "data_pagamento": "",
      "obs": "",
      "valor": 150.00
    }
  ]
}
```

## Segurança

- A senha é verificada no lado do cliente
- A sessão expira ao fechar o navegador
- Use o botão "🚪 Sair" para encerrar a sessão manualmente

## PWA (Progressive Web App)

O sistema pode ser instalado como um aplicativo web:

1. Abra no navegador
2. No Chrome/Edge: Clique no ícone de instalação na barra de endereços
3. No Safari (iOS): Compartilhar > Adicionar à Tela de Início

## Requisitos

- Navegador moderno (Chrome, Firefox, Safari, Edge)
- JavaScript habilitado
- Para importar Excel: arquivo `.xlsx` válido

## Suporte

Para problemas ou dúvidas, verifique:
- Console do navegador (F12) para erros
- Certifique-se de que todos os arquivos estão na mesma pasta
- Verifique se o arquivo Excel tem as abas corretas

## Notas

- Os dados são salvos no localStorage do navegador
- A sessão expira ao fechar o navegador
- Faça backups regulares dos seus dados
