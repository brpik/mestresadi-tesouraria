// Estrutura do Banco de Dados
let db = {
    irmaos: [],     // { id, nome, whatsapp, cpf, email, data_nascimento, ativo }
    pagamentos: []  // { id_irmao, competencia, status, data_pagamento, obs, valor }
};

// Mapa CPF -> ID para facilitar conversão
let cpfToIdMap = {};
let serverAvailable = null;

function getApiBaseUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const apiParam = String(urlParams.get('api') || '').trim();
    if (apiParam) {
        try {
            localStorage.setItem('apiBaseUrl', apiParam);
        } catch (e) {
            console.warn('⚠️ Não foi possível salvar apiBaseUrl no localStorage.');
        }
    }

    let storedApi = '';
    try {
        storedApi = String(localStorage.getItem('apiBaseUrl') || '').trim();
    } catch (e) {
        storedApi = '';
    }

    const appConfig = window.AppConfig || {};
    const configured = String(appConfig.apiBaseUrl || '').trim();
    const fromConfig = apiParam || storedApi || configured;
    if (fromConfig) return fromConfig.replace(/\/+$/, '');

    const origin = String(window.location.origin || '').trim();
    const isStaticSpace = origin.includes('digitaloceanspaces.com');
    if (!isStaticSpace && origin && origin !== 'null') {
        return origin.replace(/\/+$/, '');
    }
    return '';
}

function buildApiUrl(path) {
    const base = getApiBaseUrl();
    if (!base) return path;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
}

// --- ABSTRAÇÃO DE STORAGE (funciona como extensão ou localmente) ---
const Storage = {
    // Verifica se está rodando como extensão Chrome
    isExtension: () => {
        return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    },
    
    // Salva dados
    save: (key, data) => {
        if (Storage.isExtension()) {
            chrome.storage.local.set({ [key]: data }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Erro ao salvar no chrome.storage:', chrome.runtime.lastError);
                    throw chrome.runtime.lastError;
                }
            });
            // Salva também timestamp
            chrome.storage.local.set({ 'db_azzil_lastUpdate': new Date().toISOString() });
        } else {
            // Usa localStorage quando rodando localmente
            try {
                localStorage.setItem(key, JSON.stringify(data));
                localStorage.setItem('db_azzil_lastUpdate', new Date().toISOString());
            } catch (e) {
                console.error('Erro ao salvar no localStorage:', e);
                // Se exceder o limite, tenta limpar dados antigos
                if (e.name === 'QuotaExceededError') {
                    console.warn('⚠️ Limite de armazenamento excedido. Limpando dados antigos...');
                    try {
                        // Remove backups antigos se existirem
                        for (let i = 0; i < localStorage.length; i++) {
                            const storageKey = localStorage.key(i);
                            if (storageKey && storageKey.startsWith('backup_')) {
                                localStorage.removeItem(storageKey);
                                break;
                            }
                        }
                        // Tenta salvar novamente
                        localStorage.setItem(key, JSON.stringify(data));
                        localStorage.setItem('db_azzil_lastUpdate', new Date().toISOString());
                    } catch (e2) {
                        throw e2;
                    }
                } else {
                    throw e;
                }
            }
        }
    },
    
    // Carrega dados
    load: (key, callback) => {
        if (Storage.isExtension()) {
            chrome.storage.local.get([key], (result) => {
                callback(result[key] || null);
            });
        } else {
            // Usa localStorage quando rodando localmente
            try {
                const data = localStorage.getItem(key);
                if (!data) {
                    callback(null);
                    return;
                }
                // Tenta fazer parse do JSON
                try {
                    const parsed = JSON.parse(data);
                    callback(parsed);
                } catch (parseError) {
                    console.error(`Erro ao fazer parse do JSON para a chave "${key}":`, parseError);
                    console.log('Dados brutos:', data.substring(0, 100));
                    // Se não conseguir fazer parse, limpa a chave corrompida
                    localStorage.removeItem(key);
                    callback(null);
                }
            } catch (e) {
                console.error('Erro ao carregar do localStorage:', e);
                callback(null);
            }
        }
    }
};

// --- ABSTRAÇÃO PARA CARREGAR ARQUIVOS ---
const FileLoader = {
    // Verifica se está rodando via file:// protocol
    isFileProtocol: () => {
        return window.location.protocol === 'file:';
    },
    
    // Carrega arquivo JSON usando FileReader (para file://)
    loadJsonViaFileReader: (filename) => {
        return new Promise((resolve, reject) => {
            // Cria um input file oculto
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';
            
            // Tenta carregar automaticamente se possível
            // Para file://, precisamos que o usuário selecione o arquivo uma vez
            // Mas vamos tentar usar um input oculto que é acionado programaticamente
            
            // Como não podemos selecionar arquivo automaticamente por segurança,
            // vamos tentar usar fetch primeiro e só usar FileReader como último recurso
            reject(new Error('FileReader requer seleção manual do arquivo'));
        });
    },
    
    // Carrega arquivo JSON
    loadJson: (filename) => {
        // Remove query string para extensão Chrome, mas mantém para HTTP (evita cache)
        const cleanFilename = filename.split('?')[0];
        const fullFilename = filename; // Mantém timestamp para evitar cache
        
        if (Storage.isExtension() && chrome.runtime && chrome.runtime.getURL) {
            // Como extensão Chrome
            return fetch(chrome.runtime.getURL(cleanFilename))
                .then(response => {
                    if (!response.ok) throw new Error('Arquivo não encontrado');
                    return response.json();
                });
        } else if (FileLoader.isFileProtocol()) {
            // Para file:// protocol, não podemos usar fetch devido ao CORS
            // Retorna uma Promise que será resolvida via input file manual
            return Promise.reject(new Error('file:// protocol detectado - use servidor HTTP ou selecione arquivo manualmente'));
        } else {
            // HTTP/HTTPS - pode usar fetch normalmente
            // Usa o filename completo com timestamp para evitar cache
            return fetch(fullFilename, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            })
                .then(response => {
                    if (!response.ok) throw new Error('Arquivo não encontrado');
                    return response.text().then(text => {
                        console.log('📄 Arquivo JSON recebido (primeiros 500 chars):', text.substring(0, 500));
                        try {
                            const parsed = JSON.parse(text);
                            console.log('✅ JSON parseado:', {
                                irmaos: parsed.irmaos ? parsed.irmaos.length : 0,
                                pagamentos: parsed.pagamentos ? parsed.pagamentos.length : 0
                            });
                            return parsed;
                        } catch (e) {
                            console.error('❌ Erro ao fazer parse do JSON:', e);
                            console.log('Texto recebido:', text.substring(0, 1000));
                            throw e;
                        }
                    });
                })
                .catch(() => {
                    // Se fetch falhar, tenta com caminho relativo
                    return fetch('./' + cleanFilename, {
                        cache: 'no-store'
                    })
                        .then(response => {
                            if (!response.ok) throw new Error('Arquivo não encontrado');
                            return response.text().then(text => {
                                const parsed = JSON.parse(text);
                                console.log('✅ JSON parseado (fallback):', {
                                    irmaos: parsed.irmaos ? parsed.irmaos.length : 0,
                                    pagamentos: parsed.pagamentos ? parsed.pagamentos.length : 0
                                });
                                return parsed;
                            });
                        });
                });
        }
    }
};

// Detecta se o servidor com endpoint de salvamento está disponível
async function detectServerAvailability() {
    // Se estiver em file://, não há servidor
    if (FileLoader.isFileProtocol()) {
        serverAvailable = false;
        console.warn('⚠️ Protocolo file:// detectado. Servidor indisponível.');
        updateServerStatusIndicator();
        return serverAvailable;
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    
    try {
        const response = await fetch(buildApiUrl('/api/save-file.json'), {
            method: 'OPTIONS',
            cache: 'no-store',
            signal: controller.signal
        });
        serverAvailable = response.ok;
    } catch (error) {
        serverAvailable = false;
    } finally {
        clearTimeout(timeout);
    }
    
    console.log(`🌐 Servidor ${serverAvailable ? 'disponível' : 'indisponível'} para salvamento`);
    updateServerStatusIndicator();
    return serverAvailable;
}

function updateServerStatusIndicator() {
    const lastUpdateEl = document.getElementById('lastUpdate');
    if (!lastUpdateEl) return;
    
    if (serverAvailable === true) {
        lastUpdateEl.innerHTML = '🟢 Servidor OK';
        lastUpdateEl.style.color = '#28a745';
    } else if (serverAvailable === false) {
        lastUpdateEl.innerHTML = '🟠 Sem servidor (usando storage)';
        lastUpdateEl.style.color = '#ff8c00';
    }
}

// Aguarda carregamento completo
async function init() {
    // Verifica se XLSX está disponível (pode levar um tempo para carregar)
    if (typeof XLSX === 'undefined') {
        console.warn('XLSX ainda não está carregado, tentando novamente...');
        setTimeout(init, 100);
        return;
    }
    
    console.log('XLSX carregado com sucesso');
    
    // Inicializa event listeners
    initEventListeners();
    await detectServerAvailability();
    loadDB();
}

// Aguarda carregamento do XLSX e DOM
function waitForXLSX() {
    if (typeof XLSX !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    } else {
        setTimeout(waitForXLSX, 50);
    }
}

// Inicia o processo quando o script carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForXLSX);
} else {
    waitForXLSX();
}

function initEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const searchInput = document.getElementById('searchInput');
    const filterOpenOnly = document.getElementById('filterOpenOnly');
    const filterAlphabet = document.getElementById('filterAlphabet');
    const btnBackup = document.getElementById('btnBackup');
    const btnRestore = document.getElementById('btnRestore');
    const btnLoadFileJson = document.getElementById('btnLoadFileJson');
    const btnCopyData = document.getElementById('btnCopyData');
    const jsonInput = document.getElementById('jsonInput');
    
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    if (searchInput) searchInput.addEventListener('input', renderTable);
    if (filterOpenOnly) filterOpenOnly.addEventListener('change', renderTable);
    if (filterAlphabet) filterAlphabet.addEventListener('change', renderTable);
    const btnLogout = document.getElementById('btnLogout');
    const btnReloadFileJson = document.getElementById('btnReloadFileJson');
    const btnSyncConfirmacoes = document.getElementById('btnSyncConfirmacoes');
    
    if (btnBackup) btnBackup.addEventListener('click', downloadBackup);
    if (btnRestore) btnRestore.addEventListener('click', () => jsonInput && jsonInput.click());
    if (btnLoadFileJson) btnLoadFileJson.addEventListener('click', loadFileJson);
    if (btnReloadFileJson) btnReloadFileJson.addEventListener('click', () => {
        console.log('🔄 Recarregando file.json...');
        loadDB();
    });
    if (btnSyncConfirmacoes) btnSyncConfirmacoes.addEventListener('click', syncConfirmacoes);
    if (btnCopyData) btnCopyData.addEventListener('click', copyAllData);
    if (btnLogout) btnLogout.addEventListener('click', () => {
        sessionStorage.removeItem('gestao_mensalidades_authenticated');
        window.location.href = 'index.html';
    });
    if (jsonInput) jsonInput.addEventListener('change', restoreBackup);
    
    // Event delegation para elementos dinâmicos
    document.addEventListener('click', handleDynamicClick);
    document.addEventListener('change', handleDynamicChange);
    document.addEventListener('blur', handleDynamicBlur, true);
}

// --- CORE: Carregar e Salvar ---

function loadDB() {
    console.log('🔄 Carregando dados...');
    
    // Se estiver rodando via file://, carrega do storage
    if (FileLoader.isFileProtocol()) {
        console.warn('⚠️ Detectado protocolo file://. Carregando dados do storage...');
    loadFromStorage();
        return;
    }
    
    // Se não há servidor, prioriza storage para não sobrescrever alterações locais
    if (serverAvailable === false) {
        console.warn('⚠️ Servidor indisponível. Usando storage como fonte principal.');
        Storage.load('db_azzil', (data) => {
            if (data && data.irmaos && data.pagamentos) {
                db = data;
                rebuildCpfMap();
                console.log(`✅ Dados carregados do storage: ${db.irmaos.length} irmãos, ${db.pagamentos.length} pagamentos`);
                renderTable();
            } else {
                console.warn('⚠️ Storage vazio. Tentando carregar file.json...');
                loadFromFileJson();
            }
        });
        return;
    }
    
    // Se há servidor, carrega file.json normalmente
    loadFromFileJson();
}

function loadFromFileJson() {
    console.log('🔄 Carregando file.json...');
    
    // Adiciona timestamp para evitar cache do navegador
    const timestamp = new Date().getTime();
    FileLoader.loadJson(`file.json?t=${timestamp}`)
        .then(json => {
            console.log('📦 JSON recebido:', {
                temIrmaos: !!json.irmaos,
                temPagamentos: !!json.pagamentos,
                qtdIrmaos: json.irmaos ? json.irmaos.length : 0,
                qtdPagamentos: json.pagamentos ? json.pagamentos.length : 0,
                tipoPagamentos: typeof json.pagamentos,
                pagamentosIsArray: Array.isArray(json.pagamentos),
                pagamentosRaw: json.pagamentos ? JSON.stringify(json.pagamentos).substring(0, 200) : 'null'
            });
            
            if (json.irmaos && Array.isArray(json.irmaos) && json.pagamentos !== undefined && Array.isArray(json.pagamentos)) {
                // Garante que o campo 'ativo' existe para todos os irmãos (padrão true)
                json.irmaos.forEach(irmao => {
                    if (irmao.ativo === undefined) {
                        irmao.ativo = true;
                    }
                });
                
                // Garante que pagamentos têm o campo valor
                if (json.pagamentos && json.pagamentos.length > 0) {
                    json.pagamentos.forEach(pag => {
                        if (pag.valor === undefined) {
                            pag.valor = 0;
                        }
                    });
                }
                
                // Atribui os dados ao db de forma explícita
                db.irmaos = Array.isArray(json.irmaos) ? json.irmaos : [];
                db.pagamentos = Array.isArray(json.pagamentos) ? json.pagamentos : [];
                
                console.log('📊 Dados atribuídos ao DB:', {
                    irmaos: db.irmaos.length,
                    pagamentos: db.pagamentos.length,
                    primeiroPagamento: db.pagamentos.length > 0 ? db.pagamentos[0] : 'nenhum',
                    dbObject: db
                });
                
                rebuildCpfMap();
                
                // Salva no storage apenas como backup
                saveDB();
                
                renderTable();
                console.log(`✅ file.json carregado e sincronizado: ${db.irmaos.length} irmãos e ${db.pagamentos.length} pagamentos.`);
                
                lastSaveTime = new Date();
                updateLastSaveIndicator();
            } else {
                console.error('❌ file.json formato inválido:', {
                    irmaos: json.irmaos ? 'existe' : 'não existe',
                    pagamentos: json.pagamentos ? 'existe' : 'não existe',
                    irmaosIsArray: Array.isArray(json.irmaos),
                    pagamentosIsArray: Array.isArray(json.pagamentos)
                });
                console.warn('⚠️ file.json carregado mas está vazio ou formato inválido. Tentando carregar do storage...');
                loadFromStorage();
            }
        })
        .catch(error => {
            console.error('❌ Erro ao carregar file.json:', error);
            console.log('ℹ️ Tentando carregar do storage...');
            loadFromStorage();
        });
}

// Função auxiliar para carregar do storage (fallback)
function loadFromStorage() {
    Storage.load('db_azzil', (data) => {
        if (data) {
            db = data;
            rebuildCpfMap();
            console.log(`✅ Dados carregados do storage: ${db.irmaos.length} irmãos, ${db.pagamentos.length} pagamentos`);
            
            // Carrega timestamp da última atualização
            Storage.load('db_azzil_lastUpdate', (timestamp) => {
                if (timestamp) {
                    lastSaveTime = new Date(timestamp);
                    updateLastSaveIndicator();
                }
            });
            
            renderTable();
        } else {
            console.log('ℹ️ Nenhum dado encontrado. Iniciando com dados vazios.');
            db = { irmaos: [], pagamentos: [] };
            renderTable();
        }
    });
}

// Tenta carregar file.json automaticamente (sem alertas)
function tryLoadFileJsonAuto() {
    FileLoader.loadJson('file.json')
        .then(json => {
            if (json.irmaos && json.pagamentos && json.irmaos.length > 0) {
                // Garante que o campo 'ativo' existe para todos os irmãos (padrão true)
                json.irmaos.forEach(irmao => {
                    if (irmao.ativo === undefined) {
                        irmao.ativo = true;
                    }
                });
                db = json;
                rebuildCpfMap();
                saveDB();
                renderTable();
                console.log(`✅ file.json carregado automaticamente: ${db.irmaos.length} irmãos e ${db.pagamentos.length} pagamentos.`);
            } else {
                console.warn('file.json carregado mas está vazio ou formato inválido');
            }
        })
        .catch(error => {
            // Silencioso - apenas loga no console
            console.log('ℹ️ file.json não encontrado ou não pôde ser carregado automaticamente. Use o botão "Carregar file.json" para importar manualmente.');
        });
}

// Variável para controlar debounce do salvamento
let saveTimeout = null;
let lastSaveTime = null;

// Função para sincronizar com o servidor (file.json)
async function syncToServer() {
    try {
        // Verifica se há pagamentos antes de sincronizar
        const pagamentosComValor = db.pagamentos.filter(p => p.valor && p.valor > 0);
        console.log('🔄 Sincronizando com servidor:', {
            totalPagamentos: db.pagamentos.length,
            pagamentosComValor: pagamentosComValor.length,
            exemplo: pagamentosComValor[0]
        });
        
        const response = await fetch(buildApiUrl('/api/save-file.json'), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(db)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Dados sincronizados com servidor:', {
                ...result,
                pagamentosComValorEnviados: pagamentosComValor.length
            });
            
            // Verifica se os dados foram salvos corretamente
            if (result.pagamentos !== undefined) {
                console.log('✅ Servidor confirmou salvamento de', result.pagamentos, 'pagamentos');
            }
            
            return true;
        } else {
            const errorText = await response.text();
            console.error('❌ Erro ao sincronizar com servidor:', response.status, errorText);
            return false;
        }
    } catch (error) {
        console.error('❌ Erro de rede ao sincronizar:', error);
        return false;
    }
}

function saveDB(showFeedback = false, syncServer = false) {
    // Cancela salvamento anterior se ainda não executou
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    // Debounce: salva após 300ms de inatividade
    saveTimeout = setTimeout(async () => {
        try {
            // Salva no localStorage primeiro
            Storage.save('db_azzil', db);
            rebuildCpfMap();
            lastSaveTime = new Date();
            
            // Sincroniza com servidor se solicitado
            if (syncServer) {
                if (serverAvailable === false) {
                    console.log('💡 Servidor indisponível. Sincronização ignorada.');
                } else {
                    await syncToServer();
                }
            }
            
            // Atualiza indicador de última atualização
            updateLastSaveIndicator();
            
            if (showFeedback) {
                showSaveFeedback();
            }
            
            console.log('✅ Dados salvos com sucesso' + (syncServer ? ' e sincronizados' : ''));
        } catch (error) {
            console.error('❌ Erro ao salvar dados:', error);
            showSaveError();
        }
    }, 300);
}

// Salva imediatamente sem debounce (para ações críticas)
async function saveDBImmediate(showFeedback = false, syncServer = false) {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    try {
        // Salva no localStorage primeiro
        Storage.save('db_azzil', db);
        rebuildCpfMap();
        lastSaveTime = new Date();
        
        // Sincroniza com servidor se solicitado
        if (syncServer) {
            if (serverAvailable === false) {
                console.log('💡 Servidor indisponível. Sincronização ignorada.');
            } else {
                await syncToServer();
            }
        }
        
        updateLastSaveIndicator();
        
        if (showFeedback) {
            showSaveFeedback();
        }
        
        console.log('✅ Dados salvos imediatamente' + (syncServer ? ' e sincronizados' : ''));
    } catch (error) {
        console.error('❌ Erro ao salvar dados:', error);
        showSaveError();
    }
}

// Atualiza indicador de última atualização
function updateLastSaveIndicator() {
    const lastUpdateEl = document.getElementById('lastUpdate');
    if (lastUpdateEl && lastSaveTime) {
        const timeStr = lastSaveTime.toLocaleTimeString('pt-BR');
        lastUpdateEl.innerHTML = `💾 Salvo: ${timeStr}`;
        lastUpdateEl.style.color = '#28a745';
        
        // Volta para cor padrão após 3 segundos
        setTimeout(() => {
            if (lastUpdateEl) {
                lastUpdateEl.style.color = '#666';
            }
        }, 3000);
    }
}

// Mostra feedback visual de salvamento
function showSaveFeedback() {
    const feedback = document.createElement('div');
    feedback.id = 'save-feedback';
    feedback.style.cssText = 'position:fixed; top:20px; right:20px; background:#28a745; color:white; padding:12px 20px; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.3); z-index:10001; font-weight:bold; animation:slideIn 0.3s ease;';
    feedback.textContent = '✅ Dados salvos!';
    
    // Adiciona animação CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    if (!document.querySelector('#save-feedback-style')) {
        style.id = 'save-feedback-style';
        document.head.appendChild(style);
    }
    
    document.body.appendChild(feedback);
    
    // Remove após 2 segundos
    setTimeout(() => {
        if (feedback.parentElement) {
            feedback.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (feedback.parentElement) {
                    feedback.remove();
                }
            }, 300);
        }
    }, 2000);
}

// Mostra erro de salvamento
function showSaveError() {
    const feedback = document.createElement('div');
    feedback.style.cssText = 'position:fixed; top:20px; right:20px; background:#dc3545; color:white; padding:12px 20px; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.3); z-index:10001; font-weight:bold;';
    feedback.textContent = '❌ Erro ao salvar!';
    document.body.appendChild(feedback);
    
    setTimeout(() => {
        if (feedback.parentElement) {
            feedback.remove();
        }
    }, 3000);
}

// Salvamento automático periódico (a cada 30 segundos)
function startAutoSave() {
    setInterval(() => {
        if (db.irmaos.length > 0 || db.pagamentos.length > 0) {
            saveDB(false); // Salva silenciosamente
        }
    }, 30000); // 30 segundos
}

// Inicia salvamento automático quando a página carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAutoSave);
} else {
    startAutoSave();
}

function rebuildCpfMap() {
    cpfToIdMap = {};
    db.irmaos.forEach(irmao => {
        const cpfLimpo = String(irmao.cpf || '').replace(/\D/g, '');
        if (cpfLimpo) cpfToIdMap[cpfLimpo] = irmao.id;
    });
}

// --- IMPORTAR EXCEL ---

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (typeof XLSX === 'undefined') {
        alert('Erro: Biblioteca XLSX não está carregada. Verifique se o arquivo xlsx.full.min.js está presente.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
            
        if (!workbook.Sheets['IRMAOS'] || !workbook.Sheets['PAGAMENTOS']) {
                const msg = typeof Messages !== 'undefined' ? Messages.errors.excelMissingTabs : 'Erro: O Excel precisa ter as abas "IRMAOS" e "PAGAMENTOS".';
                alert(msg);
            return;
        }
            
        const rawIrmaos = XLSX.utils.sheet_to_json(workbook.Sheets['IRMAOS']);
        const rawPagamentos = XLSX.utils.sheet_to_json(workbook.Sheets['PAGAMENTOS']);
            
            processExcelData(rawIrmaos, rawPagamentos);
            const msg = typeof Messages !== 'undefined' ? 
                Messages.success.dataImported(db.irmaos.length, db.pagamentos.length) :
                `Dados importados: ${db.irmaos.length} irmãos e ${db.pagamentos.length} pagamentos.`;
            alert(msg);
        } catch (error) {
            alert('Erro ao processar arquivo Excel: ' + error.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function processExcelData(rawIrmaos, rawPagamentos) {
    db = { irmaos: [], pagamentos: [] };
    cpfToIdMap = {};
    
    rawIrmaos.forEach((row, index) => {
        const cpfLimpo = String(row.cpf || '').replace(/\D/g, '');
        if (!cpfLimpo || !row.nome) return;
        
        const irmao = {
            id: Date.now() + index,
            nome: String(row.nome || '').trim(),
            cpf: String(row.cpf || '').trim(),
            whatsapp: row.whatsapp ? String(row.whatsapp).replace(/\D/g, '') : '',
            email: row.email ? String(row.email).trim() : '',
            data_nascimento: row.data_nascimento ? String(row.data_nascimento).trim() : '',
            ativo: row.ativo !== undefined ? Boolean(row.ativo) : true // Padrão true
        };
        
        db.irmaos.push(irmao);
        cpfToIdMap[cpfLimpo] = irmao.id;
    });
    
    rawPagamentos.forEach(row => {
        const cpfLimpo = String(row.cpf || '').replace(/\D/g, '');
        const idIrmao = cpfToIdMap[cpfLimpo];
        
        if (!idIrmao || !row.competencia) return;
        
        const pagamento = {
            id_irmao: idIrmao,
            competencia: String(row.competencia).trim(),
            status: row.status ? String(row.status).toUpperCase().trim() : 'EM_ABERTO',
            data_pagamento: row.data_pagamento ? String(row.data_pagamento).trim() : '',
            obs: row.obs ? String(row.obs).trim() : '',
            valor: row.valor ? parseFloat(String(row.valor).replace(',', '.')) || 0 : 0
        };
        
        db.pagamentos.push(pagamento);
    });
    
    saveDB();
    renderTable();
}

// --- EVENT DELEGATION ---

function handleDynamicClick(event) {
    const target = event.target;
    
    // Toggle status badge
    if (target.classList.contains('badge') && target.dataset.irmaoId && target.dataset.competencia) {
        event.preventDefault();
        toggleStatus(parseInt(target.dataset.irmaoId), target.dataset.competencia);
        return;
    }
    
    // Delete pagamento
    if (target.classList.contains('btn-delete-pagamento') && target.dataset.irmaoId && target.dataset.competencia) {
        event.preventDefault();
        deletePagamento(parseInt(target.dataset.irmaoId), target.dataset.competencia);
        return;
    }
    
    // Add pagamento
    if (target.classList.contains('btn-add-pagamento') && target.dataset.irmaoId) {
        event.preventDefault();
        addPagamento(parseInt(target.dataset.irmaoId));
        return;
    }
    
    // Toggle ativo/inativo
    if (target.type === 'checkbox' && target.classList.contains('toggle-ativo')) {
        const irmaoId = parseInt(target.dataset.irmaoId);
        const irmao = db.irmaos.find(i => i.id === irmaoId);
        if (irmao) {
            irmao.ativo = target.checked;
            saveDB(true);
            renderTable();
        }
        return;
    }
    
    // Add new row
    if (target.classList.contains('btn-add-row')) {
        event.preventDefault();
        addNewRow();
        return;
    }
    
    // Delete irmao
    if (target.classList.contains('btn-delete-irmao') && target.dataset.irmaoId) {
        event.preventDefault();
        deleteIrmao(parseInt(target.dataset.irmaoId));
        return;
    }
}

function handleDynamicChange(event) {
    const target = event.target;
    
    // Status select
    if (target.classList.contains('select-status') && target.dataset.irmaoId && target.dataset.competencia) {
        const statusValue = target.value;
        const idIrmao = parseInt(target.dataset.irmaoId);
        const competencia = target.dataset.competencia;
        
        // CRÍTICO: Busca o pagamento ANTES de atualizar para preservar o valor
        const pagamentoAtual = db.pagamentos.find(p => p.id_irmao === idIrmao && p.competencia === competencia);
        const valorAtual = pagamentoAtual ? (pagamentoAtual.valor || 0) : 0;
        
        console.log('🔵 Status alterado no select:', {
            idIrmao,
            competencia,
            novoStatus: statusValue,
            statusAntigo: pagamentoAtual?.status || 'não definido',
            valorAtual: valorAtual,
            pagamentoCompleto: pagamentoAtual
        });
        
        // Atualiza preservando o valor
        updatePagamento(idIrmao, competencia, 'status', statusValue);
        return;
    }

    // Upload de boleto (dashboard)
    if (target.classList.contains('input-boleto') && target.dataset.irmaoId && target.dataset.competencia) {
        const file = target.files && target.files[0];
        if (!file) return;
        uploadBoletoFromDashboard(parseInt(target.dataset.irmaoId), target.dataset.competencia, file);
        // limpa o input para permitir reenvio do mesmo arquivo
        target.value = '';
        return;
    }
}

function handleDynamicBlur(event) {
    const target = event.target;
    
    // Update irmao fields (só permite se ativo)
    if (target.classList.contains('editable-irmao-nome') && target.dataset.irmaoId) {
        const irmao = db.irmaos.find(i => i.id === parseInt(target.dataset.irmaoId));
        if (irmao && irmao.ativo === false) {
            return; // Não permite editar se inativo
        }
        updateIrmao(parseInt(target.dataset.irmaoId), 'nome', target.innerText);
        return;
    }
    
    if (target.classList.contains('editable-irmao-cpf') && target.dataset.irmaoId) {
        const irmao = db.irmaos.find(i => i.id === parseInt(target.dataset.irmaoId));
        if (irmao && irmao.ativo === false) {
            return; // Não permite editar se inativo
        }
        updateIrmao(parseInt(target.dataset.irmaoId), 'cpf', target.innerText);
        return;
    }
    
    if (target.classList.contains('editable-irmao-whatsapp') && target.dataset.irmaoId) {
        const irmao = db.irmaos.find(i => i.id === parseInt(target.dataset.irmaoId));
        if (irmao && irmao.ativo === false) {
            return; // Não permite editar se inativo
        }
        updateIrmao(parseInt(target.dataset.irmaoId), 'whatsapp', target.innerText);
        return;
    }
    
    // Update pagamento fields
    if (target.classList.contains('editable-pagamento-competencia') && target.dataset.irmaoId && target.dataset.competencia) {
        updatePagamento(parseInt(target.dataset.irmaoId), target.dataset.competencia, 'competencia', target.innerText);
        return;
    }
    
    if (target.classList.contains('editable-pagamento-data') && target.dataset.irmaoId && target.dataset.competencia) {
        // Converte DD/MM/YYYY para YYYY-MM-DD ao salvar
        const dateValue = parseDateForSave(target.innerText);
        updatePagamento(parseInt(target.dataset.irmaoId), target.dataset.competencia, 'data_pagamento', dateValue);
        return;
    }
    
    if (target.classList.contains('editable-pagamento-obs') && target.dataset.irmaoId && target.dataset.competencia) {
        updatePagamento(parseInt(target.dataset.irmaoId), target.dataset.competencia, 'obs', target.innerText);
        return;
    }
    
    if (target.classList.contains('editable-pagamento-valor') && target.dataset.irmaoId && target.dataset.competencia) {
        // Converte valor formatado para número ao salvar
        const valorValue = parseCurrency(target.innerText);
        updatePagamento(parseInt(target.dataset.irmaoId), target.dataset.competencia, 'valor', valorValue);
        // Atualiza a formatação visual após salvar
        setTimeout(() => {
            const pag = db.pagamentos.find(p => p.id_irmao === parseInt(target.dataset.irmaoId) && p.competencia === target.dataset.competencia);
            if (pag) {
                target.innerText = `R$ ${formatCurrency(pag.valor || 0)}`;
            }
        }, 100);
        return;
    }
}

// --- FUNÇÕES AUXILIARES DE FORMATAÇÃO ---

// Retorna HTML do comprovante sem gerar chamadas 404 em massa
function getComprovanteHtml(pagamento) {
    const comprovanteUrl = pagamento?.comprovante;
    if (!comprovanteUrl) {
        return '<span style="color:#ccc;">-</span>';
    }
    const lower = comprovanteUrl.toLowerCase();
    const isImage = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.gif');
    const icon = isImage ? '📷' : '📄';
    return `<a href="${comprovanteUrl}" target="_blank" style="text-decoration:none; color:#28a745; font-size:1.2em;" title="Ver comprovante">${icon}</a>`;
}

function getBoletoHtml(pagamento) {
    const boletoUrl = pagamento?.boleto;
    if (!boletoUrl) {
        return '<span style="color:#ccc;">-</span>';
    }
    return `<a href="${boletoUrl}" target="_blank" style="text-decoration:none; color:#28a745; font-size:1.2em;" title="Ver boleto">📄</a>`;
}

// Formata data para exibição (DD/MM/YYYY)
function formatDateForDisplay(dateString) {
    if (!dateString || dateString.trim() === '') return '';
    
    // Converte para string se necessário
    const dateStr = String(dateString).trim();
    
    // Se Messages está disponível, usa a função dele
    if (typeof Messages !== 'undefined' && Messages.dateFormat && Messages.dateFormat.format) {
        const formatted = Messages.dateFormat.format(dateStr);
        if (formatted) return formatted;
    }
    
    // Fallback: converte manualmente
    try {
        // Se já está no formato YYYY-MM-DD (ex: 2026-01-15 ou 2026-1-5)
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts.length >= 3) {
                const year = parts[0];
                const month = parts[1];
                const day = parts[2].split(' ')[0].split('T')[0]; // Remove hora se houver
                if (year && month && day) {
                    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
                }
            }
        }
        
        // Se está no formato ISO (ex: 2026-01-15T00:00:00.000Z)
        if (dateStr.includes('T')) {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}/${month}/${year}`;
            }
        }
        
        // Se já está no formato DD/MM/YYYY, retorna como está
        if (dateStr.includes('/') && dateStr.length >= 8) {
            return dateStr;
        }
        
        // Tenta parsear como data genérica
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
        
        return dateStr;
    } catch (e) {
        console.warn('Erro ao formatar data:', dateString, e);
        return dateStr;
    }
}

// Converte data de DD/MM/YYYY para YYYY-MM-DD (para salvar)
function parseDateForSave(dateString) {
    if (!dateString) return '';
    
    // Se Messages está disponível, usa a função dele
    if (typeof Messages !== 'undefined' && Messages.dateFormat && Messages.dateFormat.parse) {
        return Messages.dateFormat.parse(dateString);
    }
    
    // Fallback: converte manualmente
    try {
        // Se está no formato DD/MM/YYYY
        if (dateString.includes('/') && dateString.length === 10) {
            const [day, month, year] = dateString.split('/');
            return `${year}-${month}-${day}`;
        }
        // Se já está no formato YYYY-MM-DD, retorna como está
        if (dateString.includes('-') && dateString.length === 10) {
            return dateString;
        }
        return dateString;
    } catch (e) {
        return dateString;
    }
}

// Formata competência de YYYY-MM para MM/YYYY
function formatCompetencia(competencia) {
    if (!competencia) return '';
    
    const competenciaStr = String(competencia).trim();
    
    // Se já está no formato MM/YYYY, retorna como está
    if (competenciaStr.includes('/') && competenciaStr.length >= 7) {
        return competenciaStr;
    }
    
    // Se está no formato YYYY-MM (ex: 2026-01)
    if (competenciaStr.includes('-') && competenciaStr.length >= 7) {
        const parts = competenciaStr.split('-');
        if (parts.length >= 2) {
            const year = parts[0];
            const month = parts[1];
            return `${month}/${year}`;
        }
    }
    
    return competenciaStr;
}

// Converte competência de MM/YYYY para YYYY-MM (para salvar)
function parseCompetencia(competencia) {
    if (!competencia) return '';
    
    const competenciaStr = String(competencia).trim();
    
    // Se já está no formato YYYY-MM, retorna como está
    if (competenciaStr.includes('-') && competenciaStr.length >= 7) {
        return competenciaStr;
    }
    
    // Se está no formato MM/YYYY (ex: 01/2026)
    if (competenciaStr.includes('/') && competenciaStr.length >= 7) {
        const parts = competenciaStr.split('/');
        if (parts.length >= 2) {
            const month = parts[0];
            const year = parts[1];
            return `${year}-${month.padStart(2, '0')}`;
        }
    }
    
    return competenciaStr;
}

// Formata valor monetário (R$ 1.234,56)
function formatCurrency(value) {
    if (!value && value !== 0) return '0,00';
    const numValue = typeof value === 'string' ? parseFloat(value.replace(',', '.')) || 0 : (value || 0);
    return numValue.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Converte valor de string para número (R$ 1.234,56 -> 1234.56)
function parseCurrency(value) {
    if (!value) return 0;
    const strValue = String(value).trim();
    // Remove R$, espaços e pontos (separadores de milhar)
    const cleaned = strValue.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

// --- RENDERIZAÇÃO ---

function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    const searchVal = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const onlyOpen = document.getElementById('filterOpenOnly')?.checked || false;
    const filterLetter = document.getElementById('filterAlphabet')?.value || '';
    tbody.innerHTML = '';
    
    const today = new Date();
    const currentComp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    // Contador de resultados
    let totalIrmaos = db.irmaos.length;
    let resultadosExibidos = 0;
    let resultadosFiltrados = 0;

    db.irmaos.forEach(irmao => {
        // Filtro alfabético
        if (filterLetter) {
            const firstLetter = irmao.nome.trim().charAt(0).toUpperCase();
            if (firstLetter !== filterLetter) {
                resultadosFiltrados++;
                return;
            }
        }
        
        // Filtro de busca
        const nomeMatch = irmao.nome.toLowerCase().includes(searchVal);
        const cpfMatch = String(irmao.cpf || '').replace(/\D/g, '').includes(searchVal);
        if (searchVal && !nomeMatch && !cpfMatch) {
            resultadosFiltrados++;
            return;
        }
        
        // Verifica se está ativo antes de calcular pendências
        const isAtivo = irmao.ativo !== false; // Padrão true se não definido
        
        // Filtro de pendências (só calcula se estiver ativo)
        const pendencias = isAtivo ? calculateOpenMonths(irmao.id) : [];
        if (onlyOpen && pendencias.length === 0) {
            resultadosFiltrados++;
            return;
        }
        
        resultadosExibidos++;
        
        const tr = document.createElement('tr');
        
        // Se não estiver ativo, não mostra status nem pendências
        let statusBadge = '';
        let pendenciasHtml = '';
        let pendenciasComValores = [];
        let totalPendencias = 0;
        
        if (isAtivo) {
            const pagouHoje = db.pagamentos.find(p => p.id_irmao === irmao.id && p.competencia === currentComp && (p.status === 'PAGO' || p.status === 'ISENTO'));
            statusBadge = pagouHoje 
                ? `<span class="badge bg-green" data-irmao-id="${irmao.id}" data-competencia="${currentComp}" title="Clique para alterar">PAGO ✅</span>`
                : `<span class="badge bg-red" data-irmao-id="${irmao.id}" data-competencia="${currentComp}" title="Clique para alterar">PENDENTE ❌</span>`;

            // Calcula valores das pendências - busca TODOS os pagamentos em aberto, independente do ano
            const pagamentosEmAberto = db.pagamentos.filter(p => 
                p.id_irmao === irmao.id && 
                !['PAGO', 'ISENTO', 'ACORDO'].includes(p.status)
            );
            
            // Mapeia pendências com valores (incluindo pagamentos criados manualmente)
            pendenciasComValores = pendencias.map(comp => {
                const pag = pagamentosEmAberto.find(p => p.competencia === comp);
        return {
                    competencia: comp,
                    valor: pag ? (pag.valor || 0) : 0
        };
    });

            // Adiciona pagamentos em aberto que não estão na lista de pendências calculadas (meses futuros ou passados)
            pagamentosEmAberto.forEach(pag => {
                if (!pendencias.includes(pag.competencia)) {
                    pendenciasComValores.push({
                        competencia: pag.competencia,
                        valor: pag.valor || 0
                    });
                }
            });
            
            // Soma TODOS os valores em aberto
            totalPendencias = pendenciasComValores.reduce((sum, p) => sum + (p.valor || 0), 0);
            
            // Ordena por competência (mais recente primeiro) e formata para exibição
            const pendenciasOrdenadas = pendenciasComValores
                .sort((a, b) => b.competencia.localeCompare(a.competencia))
                .map(p => formatCompetencia(p.competencia));
            
            pendenciasHtml = pendenciasComValores.length > 0 
                ? `<span style="color:red; font-size:0.85rem">${pendenciasOrdenadas.join(', ')}</span><br><small style="color:#856404; font-weight:bold;">Total: R$ ${formatCurrency(totalPendencias)}</small>`
                : `<span style="color:green; font-size:0.85rem">Em dia</span>`;
        } else {
            // Contato inativo - não mostra status nem pendências
            statusBadge = '<span style="color:#999; font-size:0.85rem">Inativo</span>';
            pendenciasHtml = '<span style="color:#999; font-size:0.85rem">-</span>';
        }

        const historico = db.pagamentos.filter(p => p.id_irmao === irmao.id).sort((a, b) => b.competencia.localeCompare(a.competencia));
        const historyHtml = `
            <details style="margin-top:5px">
                <summary style="cursor:pointer; color:#007bff; font-weight:600">Histórico (${historico.length})</summary>
                <table class="history-table" style="margin-top:10px; width:100%; font-size:0.85rem; border:1px solid #ddd">
                    <tr>
                        <th>Mês</th>
                        <th>Status</th>
                        <th>Valor</th>
                        <th>Data Pag.</th>
                        <th>Obs</th>
                        <th>Comprovante</th>
                        <th>Boleto</th>
                        <th>Ações</th>
                    </tr>
                    ${historico.map(p => {
                        // Formata a data antes de inserir no HTML
                        const dataFormatada = formatDateForDisplay(p.data_pagamento || '');
                        const valorFormatado = formatCurrency(p.valor || 0);
                        
                        const comprovanteHtml = getComprovanteHtml(p);
                        const boletoHtml = getBoletoHtml(p);
                        const boletoInputId = `boleto_dash_${irmao.id}_${p.competencia}`;
                        
                        return `
                        <tr>
                            <td class="editable-pagamento-competencia" contenteditable="true" data-irmao-id="${irmao.id}" data-competencia="${p.competencia}">${formatCompetencia(p.competencia)}</td>
                            <td>
                                <select class="select-status" data-irmao-id="${irmao.id}" data-competencia="${p.competencia}" data-status-antigo="${(p.status || 'EM_ABERTO').toUpperCase()}" style="padding:4px; border:1px solid #ddd; border-radius:4px">
                                    <option value="EM_ABERTO" ${(p.status || '').toUpperCase() === 'EM_ABERTO' ? 'selected' : ''}>EM_ABERTO</option>
                                    <option value="PAGO" ${(p.status || '').toUpperCase() === 'PAGO' ? 'selected' : ''}>PAGO</option>
                                    <option value="ISENTO" ${(p.status || '').toUpperCase() === 'ISENTO' ? 'selected' : ''}>ISENTO</option>
                                    <option value="ACORDO" ${(p.status || '').toUpperCase() === 'ACORDO' ? 'selected' : ''}>ACORDO</option>
                                </select>
                            </td>
                            <td class="editable-pagamento-valor" contenteditable="true" data-irmao-id="${irmao.id}" data-competencia="${p.competencia}" style="text-align:right; font-weight:bold;">R$ ${valorFormatado}</td>
                            <td class="editable-pagamento-data" contenteditable="true" data-irmao-id="${irmao.id}" data-competencia="${p.competencia}">${dataFormatada}</td>
                            <td class="editable-pagamento-obs" contenteditable="true" data-irmao-id="${irmao.id}" data-competencia="${p.competencia}">${p.obs || ''}</td>
                            <td style="text-align:center;">
                                ${comprovanteHtml}
                            </td>
                            <td style="text-align:center;">
                                ${boletoHtml}
                                <div style="margin-top:6px;">
                                    <label for="${boletoInputId}" style="cursor:pointer; color:#28a745; font-weight:600; font-size:0.75rem; display:inline-block; padding:4px 8px; border:1px dashed #28a745; border-radius:6px;">
                                        📄 Enviar
                                    </label>
                                    <input type="file" id="${boletoInputId}" class="input-boleto" accept=".pdf" data-irmao-id="${irmao.id}" data-competencia="${p.competencia}" style="display:none;">
                                </div>
                            </td>
                            <td>
                                <button class="btn btn-danger btn-small btn-delete-pagamento" data-irmao-id="${irmao.id}" data-competencia="${p.competencia}">🗑️</button>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                    <tr>
                        <td colspan="7" style="text-align:center; padding:8px">
                            <button class="btn btn-success btn-add-pagamento" data-irmao-id="${irmao.id}" style="font-size:0.8rem">+ Adicionar Pagamento</button>
                        </td>
                    </tr>
                </table>
            </details>`;

        let waBtn = '';
        // Só mostra botão de WhatsApp se estiver ativo
        if (isAtivo) {
            if(irmao.whatsapp && pendenciasComValores.length > 0) {
                // Usa mensagem do Messages.js se disponível
                let msg = '';
                if (typeof Messages !== 'undefined' && Messages.whatsapp && Messages.whatsapp.message) {
                    // Prepara dados com valores - ordena por competência (mais recente primeiro)
                    const mesesComValores = pendenciasComValores
                        .sort((a, b) => b.competencia.localeCompare(a.competencia))
                        .map(p => ({
                            mes: formatCompetencia(p.competencia),
                            valor: p.valor || 0
                        }));
                    // Gera link de confirmação com CPF codificado (encurtado)
                    const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
                    const cpfLimpo = (irmao.cpf || '').replace(/\D/g, '');
                    // Codifica o CPF em base64 para não aparecer diretamente no link
                    const cpfCodificado = btoa(cpfLimpo).replace(/[+/=]/g, (m) => {
                        return {'+': '-', '/': '_', '=': ''}[m];
                    });
                    const linkConfirmacao = `${baseUrl}confirmacao.html?c=${cpfCodificado}`;
                    // Gera link dos boletos (abertos e pagos)
                    const linkBoletos = `${baseUrl}boletos.html?c=${cpfCodificado}#abertos`;
                    const linkBoletosPagos = `${baseUrl}boletos.html?c=${cpfCodificado}#pagos`;
                    msg = Messages.whatsapp.message(irmao.nome, mesesComValores, totalPendencias, linkConfirmacao, linkBoletos, linkBoletosPagos);
                } else {
                    // Fallback para mensagem padrão - ordena por competência
                    const pendenciasFormatadas = pendenciasComValores
                        .sort((a, b) => b.competencia.localeCompare(a.competencia))
                        .map(p => formatCompetencia(p.competencia));
                    msg = `Olá ${irmao.nome.split(' ')[0]}, constam em aberto: ${pendenciasFormatadas.join(', ')}. Total: R$ ${formatCurrency(totalPendencias)}. Favor regularizar.`;
                }
                const link = `https://wa.me/55${irmao.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;
                waBtn = `<a href="${link}" target="_blank" class="btn-wa">📱 Cobrar</a>`;
            } else if (irmao.whatsapp) {
                const okText = typeof Messages !== 'undefined' ? Messages.labels.ok : '✅ OK';
                waBtn = `<span style="color:#28a745; font-size:0.8rem">${okText}</span>`;
            } else {
                const noWaText = typeof Messages !== 'undefined' ? Messages.labels.withoutWhatsApp : 'Sem WhatsApp';
                waBtn = `<span style="color:#999; font-size:0.8rem">${noWaText}</span>`;
            }
        } else {
            // Contato inativo - não mostra botão de WhatsApp
            waBtn = '<span style="color:#999; font-size:0.8rem">Inativo</span>';
        }
        const editableAttr = isAtivo ? 'contenteditable="true"' : 'contenteditable="false"';
        const disabledStyle = isAtivo ? '' : 'opacity:0.5; pointer-events:none;';
        
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                    <label style="display:flex; align-items:center; gap:4px; cursor:pointer; user-select:none;">
                        <input type="checkbox" class="toggle-ativo" data-irmao-id="${irmao.id}" ${isAtivo ? 'checked' : ''} style="cursor:pointer; width:18px; height:18px;">
                        <span style="font-size:0.75rem; color:#666;">Ativo</span>
                    </label>
                </div>
                <div class="editable-irmao-nome" ${editableAttr} data-irmao-id="${irmao.id}" style="font-weight:bold; margin-bottom:4px; ${disabledStyle}">${irmao.nome}</div>
                <div class="editable-irmao-cpf" ${editableAttr} data-irmao-id="${irmao.id}" style="font-size:0.85rem; color:#666; margin-bottom:4px; ${disabledStyle}">CPF: ${irmao.cpf || ''}</div>
                <div class="editable-irmao-whatsapp" ${editableAttr} data-irmao-id="${irmao.id}" style="font-size:0.85rem; color:#666; margin-bottom:4px; ${disabledStyle}">WhatsApp: ${irmao.whatsapp || ''}</div>
                ${historyHtml}
            </td>
            <td style="text-align:center">${statusBadge}</td>
            <td>${pendenciasHtml}</td>
            <td class="actions-cell" style="text-align:center">
                ${waBtn}
                <button class="btn btn-add-row" style="margin-top:5px; font-size:0.8rem; display:block; width:100%">+ Novo</button>
                <button class="btn btn-danger btn-delete-irmao" data-irmao-id="${irmao.id}" style="margin-top:5px; font-size:0.8rem; display:block; width:100%" title="Excluir">🗑️ Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Sem verificação automática de comprovantes para evitar 404 em massa
    
    // Remove informações anteriores se existirem
    const existingInfo = document.getElementById('resultados-info');
    if (existingInfo) existingInfo.remove();
    
    // Mensagem quando não há resultados
    if (resultadosExibidos === 0 && totalIrmaos > 0) {
        const noResultsRow = document.createElement('tr');
        noResultsRow.innerHTML = `
            <td colspan="4" style="text-align:center; padding: 40px; color: #666;">
                <div style="font-size: 1.1rem; margin-bottom: 10px;">${typeof Messages !== 'undefined' ? Messages.info.noResults : '🔍 Nenhum resultado encontrado'}</div>
                <div style="font-size: 0.9rem;">
                    ${typeof Messages !== 'undefined' ? Messages.info.noResultsInstructions(onlyOpen, searchVal) : 
                        (onlyOpen ? '• Desmarque "Apenas com pendências" para ver todos os irmãos<br>' : '') +
                        (searchVal ? '• Limpe a busca para ver todos os resultados<br>' : '') +
                        (!onlyOpen && !searchVal ? 'Verifique se os dados foram carregados corretamente' : '')}
                </div>
            </td>
        `;
        tbody.appendChild(noResultsRow);
    }
    
    // Mensagem quando não há dados no banco
    if (totalIrmaos === 0) {
        const noDataRow = document.createElement('tr');
        noDataRow.innerHTML = `
            <td colspan="4" style="text-align:center; padding: 40px; color: #666;">
                <div style="font-size: 1.1rem; margin-bottom: 10px;">📋 ${typeof Messages !== 'undefined' ? Messages.info.noData : 'Nenhum dado carregado'}</div>
                <div style="font-size: 0.9rem;">
                    ${typeof Messages !== 'undefined' ? Messages.info.noDataInstructions : 'Clique em "📄 Carregar file.json" ou importe um arquivo Excel para começar'}
                </div>
            </td>
        `;
        tbody.appendChild(noDataRow);
    }
    
    // Exibe informações sobre os resultados
    if (totalIrmaos > 0) {
        const infoDiv = document.createElement('div');
        infoDiv.id = 'resultados-info';
        infoDiv.style.cssText = 'padding: 10px; margin: 10px 0; background: #e7f3ff; border-left: 4px solid #007bff; border-radius: 4px; font-size: 0.9rem;';
        infoDiv.innerHTML = `
            <strong>📊 Resultados:</strong> ${resultadosExibidos} de ${totalIrmaos} irmãos exibidos
            ${resultadosFiltrados > 0 ? ` <span style="color: #dc3545;">(${resultadosFiltrados} ocultos por filtros)</span>` : ''}
            ${onlyOpen ? ' <span style="color: #856404;">| Filtro: Apenas com pendências</span>' : ''}
            ${searchVal ? ` <span style="color: #856404;">| Busca: "${searchVal}"</span>` : ''}
            ${filterLetter ? ` <span style="color: #856404;">| Letra: ${filterLetter}</span>` : ''}
        `;
        const table = document.querySelector('table');
        if (table && table.parentElement) {
            table.parentElement.insertBefore(infoDiv, table.nextSibling);
        }
    }
    
    // Log para debug
    console.log(`✅ Renderização: ${resultadosExibidos} de ${totalIrmaos} irmãos exibidos. Total no DB: ${db.irmaos.length}`);
    if (db.irmaos.length === 0) {
        console.warn('⚠️ ATENÇÃO: Nenhum irmão encontrado no banco de dados!');
    }
}

// --- LÓGICA DE NEGÓCIO ---

function calculateOpenMonths(idIrmao) {
    const startYear = 2026;
    const startMonth = 1; 
    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;

    let mesesDevidos = [];
    for (let y = startYear; y <= endYear; y++) {
        let mStart = (y === startYear) ? startMonth : 1;
        let mEnd = (y === endYear) ? endMonth : 12;
        for (let m = mStart; m <= mEnd; m++) {
            mesesDevidos.push(`${y}-${String(m).padStart(2, '0')}`);
        }
    }

    return mesesDevidos.filter(mes => {
        const pag = db.pagamentos.find(p => p.id_irmao === idIrmao && p.competencia === mes);
        return !pag || !['PAGO', 'ISENTO', 'ACORDO'].includes(pag.status);
    });
}

// --- AÇÕES DO USUÁRIO ---

function toggleStatus(idIrmao, competencia) {
    const index = db.pagamentos.findIndex(p => p.id_irmao === idIrmao && p.competencia === competencia);
    const statusAtual = index >= 0 ? (db.pagamentos[index].status || 'EM_ABERTO') : 'EM_ABERTO';
    const novoStatus = (statusAtual === 'PAGO' || statusAtual === 'ISENTO') ? 'EM_ABERTO' : 'PAGO';
    // Usa o fluxo central de update para garantir preservação e sincronização
    updatePagamento(idIrmao, competencia, 'status', novoStatus);
}

function updateIrmao(id, field, value) {
    const irmao = db.irmaos.find(i => i.id === id);
    if (irmao) {
        if (field === 'cpf') {
            const oldCpf = String(irmao.cpf || '').replace(/\D/g, '');
            irmao.cpf = value.trim();
            const newCpf = String(value).replace(/\D/g, '');
            if (oldCpf && cpfToIdMap[oldCpf] === id) {
                delete cpfToIdMap[oldCpf];
            }
            if (newCpf) {
                cpfToIdMap[newCpf] = id;
            }
        } else if (field === 'whatsapp') {
            irmao.whatsapp = String(value).replace(/\D/g, '');
        } else {
            irmao[field] = value.trim();
        }
        saveDB(true); // Salva com feedback visual
            renderTable();
        }
}

function updatePagamento(idIrmao, competenciaAntiga, field, value) {
    // SOLUÇÃO DEFINITIVA: Busca o pagamento ANTES de qualquer modificação e preserva TODOS os dados
    const index = db.pagamentos.findIndex(p => p.id_irmao === idIrmao && p.competencia === competenciaAntiga);
    
    // CRÍTICO: Preserva TODOS os dados do pagamento ANTES de qualquer modificação
    let dadosPreservados = null;
    if (index >= 0) {
        // Cria uma cópia profunda do pagamento atual
        dadosPreservados = JSON.parse(JSON.stringify(db.pagamentos[index]));
        console.log('📋 Dados preservados ANTES da atualização:', dadosPreservados);
    } else {
        // Se não existe, tenta buscar valor de outro pagamento similar (mesmo irmão, competência próxima)
        const pagamentoSimilar = db.pagamentos.find(p => 
            p.id_irmao === idIrmao && 
            p.valor && p.valor > 0
        );
        if (pagamentoSimilar) {
            dadosPreservados = { valor: pagamentoSimilar.valor };
            console.log('📋 Valor encontrado de pagamento similar:', pagamentoSimilar.valor);
        }
    }
    
    const valorOriginal = dadosPreservados?.valor || 0;
    
    // Processa a atualização
    if (field === 'competencia') {
        // Converte MM/YYYY para YYYY-MM ao salvar
        const newCompetencia = parseCompetencia(value.trim());
        if (newCompetencia && newCompetencia !== competenciaAntiga) {
            if (index >= 0) {
                db.pagamentos[index].competencia = newCompetencia;
            } else {
                db.pagamentos.push({
                    id_irmao: idIrmao,
                    competencia: newCompetencia,
                    status: 'EM_ABERTO',
                    data_pagamento: '',
                    obs: '',
                    valor: valorOriginal
                });
            }
        }
    } else if (index >= 0) {
        // Pagamento existe - atualiza preservando TODOS os outros campos
        const pagamento = db.pagamentos[index];
        
        // Preserva valores originais
        const valorPreservado = dadosPreservados?.valor !== undefined && dadosPreservados?.valor !== null 
            ? dadosPreservados.valor 
            : (pagamento.valor !== undefined && pagamento.valor !== null ? pagamento.valor : 0);
        const dataPreservada = dadosPreservados?.data_pagamento || pagamento.data_pagamento || '';
        const obsPreservada = dadosPreservados?.obs || pagamento.obs || '';
        const statusPreservado = dadosPreservados?.status || pagamento.status || 'EM_ABERTO';
        
        console.log('💾 Valores preservados:', {
            valorPreservado,
            dataPreservada,
            obsPreservada,
            statusPreservado,
            valorOriginal
        });
        
        // Atualiza apenas o campo solicitado
        if (field === 'data_pagamento') {
            pagamento.data_pagamento = parseDateForSave(value.trim());
        } else if (field === 'valor') {
            pagamento.valor = typeof value === 'number' ? value : parseFloat(value) || 0;
        } else if (field === 'status') {
            // CRÍTICO: Ao mudar status, SEMPRE preserva o valor ORIGINAL
            const statusAntigo = pagamento.status || statusPreservado;
            pagamento.status = String(value).trim().toUpperCase();
            
            // FORÇA preservação do valor ORIGINAL - nunca perde
            pagamento.valor = valorPreservado;
            
            // Se mudou para EM_ABERTO de PAGO, pode limpar data_pagamento (mas preserva valor)
            if (pagamento.status === 'EM_ABERTO' && statusAntigo === 'PAGO') {
                pagamento.data_pagamento = '';
            }
            
            console.log('💾 Status atualizado (SOLUÇÃO DEFINITIVA):', {
                idIrmao,
                competencia: competenciaAntiga,
                statusAntigo,
                statusNovo: pagamento.status,
                valorPreservado: pagamento.valor,
                valorOriginal,
                pagamentoCompleto: pagamento
            });
        } else if (field === 'obs') {
            pagamento.obs = typeof value === 'string' ? value.trim() : value;
        }
        
        // GARANTIA FINAL: Força preservação de TODOS os campos essenciais
        if (pagamento.valor === undefined || pagamento.valor === null || pagamento.valor === 0) {
            if (valorPreservado > 0) {
                pagamento.valor = valorPreservado;
                console.warn('⚠️ Valor estava perdido! Recuperado:', valorPreservado);
            }
        }
        if (!pagamento.data_pagamento && dataPreservada) {
            pagamento.data_pagamento = dataPreservada;
        }
        if (!pagamento.obs && obsPreservada) {
            pagamento.obs = obsPreservada;
        }
        if (!pagamento.status) {
            pagamento.status = statusPreservado;
        }
        
    } else {
        // Pagamento não existe - cria novo preservando valor se existir
        let dataPagamento = '';
        if (field === 'data_pagamento') {
            dataPagamento = parseDateForSave(value.trim());
        }
        
        let valorPagamento = valorOriginal; // Usa valor preservado se existir
        if (field === 'valor') {
            valorPagamento = typeof value === 'number' ? value : parseFloat(value) || valorOriginal;
        }
        
        const novoStatus = field === 'status' ? String(value).trim().toUpperCase() : 'EM_ABERTO';
        
        db.pagamentos.push({
            id_irmao: idIrmao,
            competencia: competenciaAntiga,
            status: novoStatus,
            data_pagamento: dataPagamento,
            obs: field === 'obs' ? (typeof value === 'string' ? value.trim() : value) : '',
            valor: valorPagamento
        });
        
        console.log('💾 Novo pagamento criado:', {
            idIrmao,
            competencia: competenciaAntiga,
            status: novoStatus,
            valor: valorPagamento
        });
    }
    
    // Verificação final CRÍTICA: garante que o pagamento está correto antes de salvar
    const pagamentoFinal = db.pagamentos.find(p => 
        p.id_irmao === idIrmao && 
        p.competencia === competenciaAntiga
    );
    
    if (pagamentoFinal) {
        // ÚLTIMA GARANTIA: se o valor foi perdido, recupera do original
        if ((pagamentoFinal.valor === undefined || pagamentoFinal.valor === null || pagamentoFinal.valor === 0) && valorOriginal > 0) {
            pagamentoFinal.valor = valorOriginal;
            console.warn('⚠️ VALOR RECUPERADO NA VERIFICAÇÃO FINAL:', valorOriginal);
        }
        
        console.log('✅ Pagamento final verificado ANTES de salvar:', {
            idIrmao,
            competencia: competenciaAntiga,
            status: pagamentoFinal.status,
            valor: pagamentoFinal.valor,
            valorOriginal,
            completo: JSON.parse(JSON.stringify(pagamentoFinal))
        });
    } else {
        console.error('❌ ERRO CRÍTICO: Pagamento não encontrado após atualização!');
    }
    
    // Salva e sincroniza para qualquer alteração em pagamentos
    const deveSincronizar = ['status', 'valor', 'data_pagamento', 'obs', 'competencia'].includes(field);
    if (deveSincronizar) {
        saveDBImmediate(true, true);
    } else {
        saveDB(true, false);
    }
    renderTable();
}

async function uploadBoletoFromDashboard(idIrmao, competencia, file) {
    // Valida PDF
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
        alert('Por favor, envie apenas arquivos PDF para boletos.');
        return;
    }
    
    const formData = new FormData();
    formData.append('id_irmao', idIrmao);
    formData.append('competencia', competencia);
    formData.append('boleto', file);
    
    try {
        const response = await fetch(buildApiUrl(`/api/upload-boleto?id_irmao=${encodeURIComponent(idIrmao)}&competencia=${encodeURIComponent(competencia)}`), {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Erro ao enviar boleto');
        }
        
        // Salva a referência do boleto no pagamento
        let pagamento = db.pagamentos.find(p => p.id_irmao === idIrmao && p.competencia === competencia);
        if (!pagamento) {
            pagamento = {
                id_irmao: idIrmao,
                competencia: competencia,
                status: 'EM_ABERTO',
                data_pagamento: '',
                obs: '',
                valor: 0
            };
            db.pagamentos.push(pagamento);
        }
        
        const boletoUrl = result.url || `/boletos/${idIrmao}_${competencia}.pdf`;
        pagamento.boleto = boletoUrl;
        
        saveDBImmediate(true, true);
        renderTable();
        
        alert('✅ Boleto enviado com sucesso!');
    } catch (error) {
        console.error('Erro ao enviar boleto:', error);
        alert('❌ Erro ao enviar boleto: ' + error.message);
    }
}

function addPagamento(idIrmao) {
    // Cria diálogo para selecionar mês e ano
    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center;';
    
    const content = document.createElement('div');
    content.style.cssText = 'background:white; padding:30px; border-radius:8px; min-width:300px; box-shadow:0 4px 20px rgba(0,0,0,0.3);';
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    
    // Gera opções de anos (2024 até 2030)
    let yearOptions = '';
    for (let y = 2024; y <= 2030; y++) {
        yearOptions += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
    }
    
    // Gera opções de meses
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    let monthOptions = '';
    meses.forEach((mes, index) => {
        const monthNum = index + 1;
        monthOptions += `<option value="${monthNum}" ${monthNum === currentMonth ? 'selected' : ''}>${mes}</option>`;
    });
    
    content.innerHTML = `
        <h3 style="margin-top:0; margin-bottom:20px;">Adicionar Pagamento</h3>
        <div style="margin-bottom:15px;">
            <label style="display:block; margin-bottom:5px; font-weight:bold;">Ano:</label>
            <select id="selectYear" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:1rem;">
                ${yearOptions}
            </select>
        </div>
        <div style="margin-bottom:20px;">
            <label style="display:block; margin-bottom:5px; font-weight:bold;">Mês:</label>
            <select id="selectMonth" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:1rem;">
                ${monthOptions}
            </select>
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
            <button id="btnCancelAddPag" style="padding:8px 20px; border:1px solid #ddd; border-radius:4px; background:#f8f9fa; cursor:pointer;">Cancelar</button>
            <button id="btnConfirmAddPag" style="padding:8px 20px; border:none; border-radius:4px; background:#28a745; color:white; cursor:pointer; font-weight:bold;">Adicionar</button>
        </div>
    `;
    
    dialog.appendChild(content);
    document.body.appendChild(dialog);
    
    const btnCancel = content.querySelector('#btnCancelAddPag');
    const btnConfirm = content.querySelector('#btnConfirmAddPag');
    const selectYear = content.querySelector('#selectYear');
    const selectMonth = content.querySelector('#selectMonth');
    
    const closeDialog = () => {
        document.body.removeChild(dialog);
    };
    
    btnCancel.addEventListener('click', closeDialog);
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) closeDialog();
    });
    
    btnConfirm.addEventListener('click', () => {
        const year = parseInt(selectYear.value);
        const month = parseInt(selectMonth.value);
        const competencia = `${year}-${String(month).padStart(2, '0')}`;
        
        const existe = db.pagamentos.find(p => p.id_irmao === idIrmao && p.competencia === competencia);
        if (existe) {
            const msg = typeof Messages !== 'undefined' ? Messages.confirm.duplicateCompetencia : 'Já existe um pagamento para esta competência!';
            alert(msg);
            return;
        }
        
        db.pagamentos.push({
            id_irmao: idIrmao,
            competencia: competencia,
            status: 'EM_ABERTO',
            data_pagamento: '',
            obs: '',
            valor: 0
        });
        saveDBImmediate(true); // Salva imediatamente com feedback
        renderTable();
        closeDialog();
    });
}

function deletePagamento(idIrmao, competencia) {
    if (confirm('Tem certeza que deseja excluir este pagamento?')) {
        db.pagamentos = db.pagamentos.filter(p => !(p.id_irmao === idIrmao && p.competencia === competencia));
        saveDBImmediate(true); // Salva imediatamente com feedback
        renderTable();
    }
}

function addNewRow() {
    const newId = Date.now();
    db.irmaos.push({
        id: newId,
        nome: "Novo Irmão (Edite)",
        cpf: "",
        whatsapp: "",
        email: "",
        data_nascimento: "",
        ativo: true
    });
    saveDBImmediate(true); // Salva imediatamente com feedback
    renderTable();
}

// Sincroniza confirmações do sistema de confirmação pública
function syncConfirmacoes() {
    try {
        const backup = localStorage.getItem('gestao_confirmacoes_backup');
        if (!backup) {
            alert('Nenhuma confirmação pendente encontrada.');
            return;
        }
        
        const backupData = JSON.parse(backup);
        const confirmacoes = backupData.data;
        
        if (!confirmacoes || !confirmacoes.pagamentos) {
            alert('Dados de confirmação inválidos.');
            return;
        }
        
        // Atualiza pagamentos confirmados
        let atualizados = 0;
        confirmacoes.pagamentos.forEach(pagConfirmado => {
            if (pagConfirmado.status === 'PAGO') {
                const index = db.pagamentos.findIndex(p => 
                    p.id_irmao === pagConfirmado.id_irmao && 
                    p.competencia === pagConfirmado.competencia
                );
                
                if (index >= 0) {
                    // Atualiza pagamento existente
                    db.pagamentos[index].status = 'PAGO';
                    if (pagConfirmado.data_pagamento) {
                        db.pagamentos[index].data_pagamento = pagConfirmado.data_pagamento;
                    }
                    if (pagConfirmado.obs) {
                        db.pagamentos[index].obs = pagConfirmado.obs;
                    }
                    atualizados++;
                } else {
                    // Adiciona novo pagamento confirmado
                    db.pagamentos.push(pagConfirmado);
                    atualizados++;
                }
            }
        });
        
        if (atualizados > 0) {
            rebuildCpfMap();
            saveDB(true);
            renderTable();
            alert(`✅ ${atualizados} pagamento(s) sincronizado(s) com sucesso!`);
            
            // Limpa o backup após sincronizar
            localStorage.removeItem('gestao_confirmacoes_backup');
        } else {
            alert('Nenhum pagamento novo para sincronizar.');
        }
    } catch (error) {
        console.error('Erro ao sincronizar confirmações:', error);
        alert('Erro ao sincronizar confirmações. Verifique o console para mais detalhes.');
    }
}

function deleteIrmao(id) {
    const msg = typeof Messages !== 'undefined' ? Messages.confirm.deleteIrmao : 'Tem certeza que deseja excluir este irmão e todo histórico?';
    if(confirm(msg)) {
        db.irmaos = db.irmaos.filter(i => i.id !== id);
        db.pagamentos = db.pagamentos.filter(p => p.id_irmao !== id);
        saveDBImmediate(true); // Salva imediatamente com feedback
        renderTable();
    }
}

// --- COPIAR DADOS ---

function copyAllData() {
    try {
        // Formata os dados de forma legível
        let texto = '=== GESTÃO DE MENSALIDADES ===\n\n';
        texto += `Total de Irmãos: ${db.irmaos.length}\n`;
        texto += `Total de Pagamentos: ${db.pagamentos.length}\n\n`;
        texto += '═'.repeat(60) + '\n\n';
        
        // Agrupa pagamentos por irmão
        db.irmaos.forEach(irmao => {
            texto += `\n📌 ${irmao.nome}\n`;
            texto += `   CPF: ${irmao.cpf || 'N/A'}\n`;
            texto += `   WhatsApp: ${irmao.whatsapp || 'N/A'}\n`;
            
            const pagamentosIrmao = db.pagamentos
                .filter(p => p.id_irmao === irmao.id)
                .sort((a, b) => b.competencia.localeCompare(a.competencia));
            
            if (pagamentosIrmao.length > 0) {
                texto += `   Histórico de Pagamentos (${pagamentosIrmao.length}):\n`;
                pagamentosIrmao.forEach(pag => {
                    texto += `      • ${formatCompetencia(pag.competencia)} - ${pag.status}`;
                    if (pag.data_pagamento) {
                        const formattedDate = formatDateForDisplay(pag.data_pagamento);
                        texto += ` (${formattedDate})`;
                    }
                    if (pag.obs) texto += ` - ${pag.obs}`;
                    texto += '\n';
                });
            } else {
                texto += `   Histórico: Nenhum pagamento registrado\n`;
            }
            
            // Calcula pendências
            const pendencias = calculateOpenMonths(irmao.id);
            if (pendencias.length > 0) {
                const pendenciasFormatadas = pendencias.map(p => formatCompetencia(p));
                texto += `   ⚠️ Pendências: ${pendenciasFormatadas.join(', ')}\n`;
            } else {
                texto += `   ✅ Em dia\n`;
            }
            texto += '\n' + '-'.repeat(60) + '\n';
        });
        
        // Adiciona resumo por status
        texto += '\n\n=== RESUMO POR STATUS ===\n\n';
        const statusCount = {};
        db.pagamentos.forEach(p => {
            statusCount[p.status] = (statusCount[p.status] || 0) + 1;
        });
        Object.keys(statusCount).forEach(status => {
            texto += `${status}: ${statusCount[status]} pagamento(s)\n`;
        });
        
        // Copia para área de transferência
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(() => {
                alert(`✅ Dados copiados com sucesso!\n\n${db.irmaos.length} irmãos\n${db.pagamentos.length} pagamentos`);
            }).catch(err => {
                console.error('Erro ao copiar:', err);
                fallbackCopyTextToClipboard(texto);
            });
        } else {
            fallbackCopyTextToClipboard(texto);
        }
    } catch (error) {
        console.error('Erro ao copiar dados:', error);
        alert('Erro ao copiar dados. Verifique o console para mais detalhes.');
    }
}

// Fallback para navegadores mais antigos
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            alert(`✅ Dados copiados com sucesso!\n\n${db.irmaos.length} irmãos\n${db.pagamentos.length} pagamentos`);
        } else {
            alert('❌ Não foi possível copiar. Tente selecionar e copiar manualmente.');
        }
    } catch (err) {
        console.error('Erro ao copiar:', err);
        alert('❌ Erro ao copiar dados.');
    }
    
    document.body.removeChild(textArea);
}

// --- BACKUP & RESTORE ---

function downloadBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "backup_azzil_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function restoreBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = JSON.parse(e.target.result);
            if (json.irmaos && json.pagamentos) {
                // Garante que o campo 'ativo' existe para todos os irmãos (padrão true)
                json.irmaos.forEach(irmao => {
                    if (irmao.ativo === undefined) {
                        irmao.ativo = true;
                    }
                });
                db = json;
                saveDB();
                renderTable();
                alert('Backup restaurado com sucesso!');
            } else {
                alert('Formato de arquivo inválido.');
            }
        } catch (err) {
            alert('Erro ao ler arquivo JSON.');
        }
    };
    reader.readAsText(file);
}

// Carrega o file.json local
function loadFileJson() {
    // Se estiver via file://, abre seletor de arquivo
    if (FileLoader.isFileProtocol()) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    if (json.irmaos && json.pagamentos) {
                        // Garante que os IDs sejam únicos e sequenciais
                        let maxId = 0;
                        json.irmaos.forEach(irmao => {
                            if (irmao.id > maxId) maxId = irmao.id;
                            // Garante que o campo 'ativo' existe (padrão true)
                            if (irmao.ativo === undefined) {
                                irmao.ativo = true;
                            }
                        });
                        
                        // Garante que pagamentos têm o campo valor
                        json.pagamentos.forEach(pag => {
                            if (pag.valor === undefined) {
                                pag.valor = 0;
                            }
                        });
                        
                        // Atualiza IDs se necessário e reconstrói mapa
                        db = json;
                        rebuildCpfMap();
                        saveDB();
                        renderTable();
                        alert(`file.json carregado com sucesso! ${db.irmaos.length} irmãos e ${db.pagamentos.length} pagamentos.`);
                    } else {
                        alert('Formato de arquivo inválido. O JSON deve conter "irmaos" e "pagamentos".');
                    }
                } catch (err) {
                    alert('Erro ao ler arquivo JSON: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
        return;
    }
    
    // Tenta carregar automaticamente do mesmo diretório
    FileLoader.loadJson('file.json')
        .then(json => {
            if (json.irmaos && json.pagamentos) {
                // Garante que os IDs sejam únicos e sequenciais
                let maxId = 0;
                json.irmaos.forEach(irmao => {
                    if (irmao.id > maxId) maxId = irmao.id;
                    // Garante que o campo 'ativo' existe (padrão true)
                    if (irmao.ativo === undefined) {
                        irmao.ativo = true;
                    }
                });
                
                // Atualiza IDs se necessário e reconstrói mapa
                db = json;
                rebuildCpfMap();
                saveDB();
                renderTable();
                alert(`file.json carregado com sucesso! ${db.irmaos.length} irmãos e ${db.pagamentos.length} pagamentos.`);
            } else {
                throw new Error('Formato inválido');
            }
        })
        .catch(error => {
            // Se não conseguir carregar automaticamente, abre seletor de arquivo
            console.log('Não foi possível carregar file.json automaticamente, abrindo seletor...', error);
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const json = JSON.parse(event.target.result);
                        if (json.irmaos && json.pagamentos) {
                            // Garante que o campo 'ativo' existe para todos os irmãos (padrão true)
                            json.irmaos.forEach(irmao => {
                                if (irmao.ativo === undefined) {
                                    irmao.ativo = true;
                                }
                            });
                            db = json;
                            rebuildCpfMap();
                            saveDB();
                            renderTable();
                            alert(`file.json carregado com sucesso! ${db.irmaos.length} irmãos e ${db.pagamentos.length} pagamentos.`);
                        } else {
                            alert('Formato de arquivo inválido. O JSON deve conter "irmaos" e "pagamentos".');
                        }
                    } catch (err) {
                        alert('Erro ao ler arquivo JSON: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });
}
