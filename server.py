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

def parse_multipart_form_data(rfile, headers):
    """Parse multipart/form-data manualmente (compatível com Python 3.13+)"""
    content_type = headers.get('Content-Type', '')
    if not content_type.startswith('multipart/form-data'):
        raise ValueError('Content-Type deve ser multipart/form-data')
    
    # Extrai o boundary
    boundary = None
    for part in content_type.split(';'):
        part = part.strip()
        if part.startswith('boundary='):
            boundary = part[9:].strip('"')
            break
    
    if not boundary:
        raise ValueError('Boundary não encontrado no Content-Type')
    
    # Lê todo o conteúdo
    content_length = int(headers.get('Content-Length', 0))
    if content_length == 0:
        raise ValueError('Content-Length é 0')
    
    body = rfile.read(content_length)
    
    # Separa as partes usando o boundary
    boundary_bytes = f'--{boundary}'.encode()
    parts = body.split(boundary_bytes)
    
    form_data = {}
    
    for part in parts[1:-1]:  # Ignora primeira e última parte (vazias)
        if not part.strip():
            continue
        
        # Separa headers do conteúdo
        header_end = part.find(b'\r\n\r\n')
        if header_end == -1:
            continue
        
        headers_part = part[:header_end]
        content = part[header_end + 4:].rstrip(b'\r\n')
        
        # Parse dos headers
        headers_dict = {}
        for line in headers_part.split(b'\r\n'):
            if b':' in line:
                key, value = line.split(b':', 1)
                headers_dict[key.strip().decode().lower()] = value.strip().decode()
        
        # Extrai o nome do campo
        content_disposition = headers_dict.get('content-disposition', '')
        name = None
        filename = None
        
        for item in content_disposition.split(';'):
            item = item.strip()
            if item.startswith('name='):
                name = item[5:].strip('"')
            elif item.startswith('filename='):
                filename = item[9:].strip('"')
        
        if name:
            if filename:
                # É um arquivo
                content_type_field = headers_dict.get('content-type', 'application/octet-stream')
                form_data[name] = {
                    'filename': filename,
                    'type': content_type_field,
                    'file': content
                }
            else:
                # É um campo de texto
                form_data[name] = content.decode('utf-8', errors='ignore')
    
    return form_data

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

    def do_POST(self):
        # Endpoint para upload de comprovantes
        if self.path == '/api/upload-comprovante':
            try:
                # Lê o conteúdo multipart/form-data
                form = parse_multipart_form_data(self.rfile, self.headers)
                
                if 'comprovante' not in form:
                    raise ValueError('Arquivo de comprovante não encontrado')
                
                file_item = form['comprovante']
                id_irmao = form.get('id_irmao', '')
                competencia = form.get('competencia', '')
                cpf = form.get('cpf', '')
                
                if not id_irmao or not competencia:
                    raise ValueError('id_irmao e competencia são obrigatórios')
                
                # Cria diretório de comprovantes se não existir
                comprovantes_dir = Path(__file__).parent / 'comprovantes'
                comprovantes_dir.mkdir(exist_ok=True)
                
                # Determina extensão do arquivo
                filename_base = f"{id_irmao}_{competencia}"
                original_filename = file_item.get('filename', 'comprovante')
                file_ext = Path(original_filename).suffix or ('.jpg' if file_item.get('type', '').startswith('image/') else '.pdf')
                
                # Salva o arquivo
                filename = f"{filename_base}{file_ext}"
                file_path = comprovantes_dir / filename
                
                with open(file_path, 'wb') as f:
                    f.write(file_item['file'])
                
                print(f'✅ Comprovante salvo: {file_path}')
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'message': 'Comprovante enviado com sucesso',
                    'filename': filename,
                    'url': f'/comprovantes/{filename}'
                }).encode())
                
            except Exception as e:
                print(f'❌ Erro ao fazer upload de comprovante: {e}')
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': str(e)
                }).encode())
        
        # Endpoint para upload de boletos
        elif self.path == '/api/upload-boleto':
            try:
                # Lê o conteúdo multipart/form-data
                form = parse_multipart_form_data(self.rfile, self.headers)
                
                if 'boleto' not in form:
                    raise ValueError('Arquivo de boleto não encontrado')
                
                file_item = form['boleto']
                id_irmao = form.get('id_irmao', '')
                competencia = form.get('competencia', '')
                cpf = form.get('cpf', '')
                
                if not id_irmao or not competencia:
                    raise ValueError('id_irmao e competencia são obrigatórios')
                
                # Cria diretório de boletos se não existir
                boletos_dir = Path(__file__).parent / 'boletos'
                boletos_dir.mkdir(exist_ok=True)
                
                # Salva o arquivo
                filename = f"{id_irmao}_{competencia}.pdf"
                file_path = boletos_dir / filename
                
                with open(file_path, 'wb') as f:
                    f.write(file_item['file'])
                
                print(f'✅ Boleto salvo: {file_path}')
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'message': 'Boleto enviado com sucesso',
                    'filename': filename
                }).encode())
                
            except Exception as e:
                print(f'❌ Erro ao fazer upload de boleto: {e}')
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': str(e)
                }).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_GET(self):
        # Serve arquivos de comprovantes
        if self.path.startswith('/comprovantes/'):
            filename = self.path.replace('/comprovantes/', '')
            file_path = Path(__file__).parent / 'comprovantes' / filename
            
            if file_path.exists():
                try:
                    with open(file_path, 'rb') as f:
                        content = f.read()
                    
                    # Determina content-type baseado na extensão
                    content_type = 'application/octet-stream'
                    if filename.lower().endswith('.pdf'):
                        content_type = 'application/pdf'
                    elif filename.lower().endswith(('.jpg', '.jpeg')):
                        content_type = 'image/jpeg'
                    elif filename.lower().endswith('.png'):
                        content_type = 'image/png'
                    elif filename.lower().endswith('.gif'):
                        content_type = 'image/gif'
                    
                    self.send_response(200)
                    self.send_header('Content-type', content_type)
                    self.send_header('Content-Disposition', f'inline; filename="{filename}"')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(content)
                    print(f'✅ Comprovante servido: {filename}')
                except Exception as e:
                    print(f'❌ Erro ao servir comprovante: {e}')
                    import traceback
                    traceback.print_exc()
                    self.send_response(500)
                    self.end_headers()
            else:
                # Retorna 404 silenciosamente para não poluir o console
                self.send_response(404)
                self.end_headers()
        
        # Serve arquivos de boletos
        elif self.path.startswith('/boletos/'):
            filename = self.path.replace('/boletos/', '')
            file_path = Path(__file__).parent / 'boletos' / filename
            
            if file_path.exists() and file_path.suffix == '.pdf':
                try:
                    with open(file_path, 'rb') as f:
                        content = f.read()
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/pdf')
                    self.send_header('Content-Disposition', f'inline; filename="{filename}"')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(content)
                    print(f'✅ Boleto servido: {filename}')
                except Exception as e:
                    print(f'❌ Erro ao servir boleto: {e}')
                    self.send_response(500)
                    self.end_headers()
            else:
                self.send_response(404)
                self.end_headers()
        else:
            # Serve arquivos estáticos normalmente
            super().do_GET()
    
    def log_message(self, format, *args):
        # Personaliza mensagens de log
        print(f"[{self.address_string()}] {format % args}")

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

def main():
    # Muda para o diretório do script
    os.chdir(Path(__file__).parent)
    
    Handler = MyHTTPRequestHandler
    
    with ReusableTCPServer(("", PORT), Handler) as httpd:
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
