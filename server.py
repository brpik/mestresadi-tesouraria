#!/usr/bin/env python3
"""
Servidor HTTP simples para servir os arquivos do sistema de gestão de mensalidades.
Execute: python3 server.py
Depois acesse: http://localhost:8000
"""

import http.server
import socketserver
import os
import webbrowser
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs

PORT = 8001

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Adiciona headers CORS para permitir requisições
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        # Responde a requisições OPTIONS (preflight)
        self.send_response(200)
        self.end_headers()
    
    def do_PUT(self):
        # Endpoint para salvar file.json
        print(f'🔵 Recebida requisição PUT para: {self.path}')
        
        if self.path == '/api/save-file.json' or self.path.startswith('/api/save-file.json'):
            try:
                # Lê o conteúdo da requisição
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length == 0:
                    raise ValueError('Content-Length é 0')
                
                print(f'🔵 Content-Length: {content_length}')
                post_data = self.rfile.read(content_length)
                print(f'🔵 Dados recebidos (primeiros 200 chars): {post_data[:200]}')
                
                data = json.loads(post_data.decode('utf-8'))
                
                # Valida a estrutura dos dados
                if 'irmaos' not in data or 'pagamentos' not in data:
                    raise ValueError('Estrutura de dados inválida: deve conter "irmaos" e "pagamentos"')
                
                if not isinstance(data['irmaos'], list) or not isinstance(data['pagamentos'], list):
                    raise ValueError('"irmaos" e "pagamentos" devem ser arrays')
                
                print(f'💾 Salvando file.json: {len(data["irmaos"])} irmãos, {len(data["pagamentos"])} pagamentos')
                
                # Verifica se há pagamentos com status PAGO
                pagamentosPagos = [p for p in data['pagamentos'] if p.get('status') == 'PAGO']
                print(f'💾 Pagamentos com status PAGO: {len(pagamentosPagos)}')
                
                # Mostra alguns exemplos de pagamentos
                if len(pagamentosPagos) > 0:
                    print(f'💾 Exemplo de pagamento PAGO: {pagamentosPagos[0]}')
                
                # Salva o file.json
                file_path = Path(__file__).parent / 'file.json'
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                print(f'✅ file.json salvo com sucesso em {file_path}')
                
                # Envia resposta de sucesso
                response_data = {
                    'success': True, 
                    'message': 'file.json atualizado com sucesso',
                    'irmaos': len(data['irmaos']),
                    'pagamentos': len(data['pagamentos']),
                    'pagamentosPagos': len(pagamentosPagos)
                }
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode())
                print(f'✅ Resposta enviada: {response_data}')
                
            except Exception as e:
                print(f'❌ Erro ao salvar file.json: {e}')
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                error_response = {'success': False, 'error': str(e)}
                self.wfile.write(json.dumps(error_response).encode())
                print(f'❌ Resposta de erro enviada: {error_response}')
        else:
            print(f'❌ Rota não encontrada: {self.path}')
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

    def log_message(self, format, *args):
        # Personaliza mensagens de log
        print(f"[{self.address_string()}] {format % args}")

def main():
    # Muda para o diretório do script
    os.chdir(Path(__file__).parent)
    
    Handler = MyHTTPRequestHandler
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("=" * 60)
        print(f"🚀 Servidor HTTP iniciado!")
        print(f"📂 Diretório: {os.getcwd()}")
        print(f"🌐 Acesse: {url}")
        print("=" * 60)
        print("Pressione Ctrl+C para parar o servidor")
        print("=" * 60)
        
        # Abre o navegador automaticamente
        try:
            webbrowser.open(url)
        except:
            pass
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n🛑 Servidor parado.")

if __name__ == "__main__":
    main()
