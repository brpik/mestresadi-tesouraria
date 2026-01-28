// Sistema de Confirmação de Pagamento
let currentIrmao = null;
let comprovantes = {}; // { competencia: File }

// Carrega dados do file.json
let db = {
    irmaos: [],
    pagamentos: []
};

// Decodifica CPF da URL (encurtado)
function decodeCpfFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const cpfCodificado = urlParams.get('c');
    
    if (cpfCodificado) {
        try {
            // Decodifica o CPF (inverte a codificação base64)
            const cpfBase64 = cpfCodificado.replace(/[-_]/g, (m) => {
                return {'-': '+', '_': '/'}[m];
            });
            // Adiciona padding se necessário
            const padding = (4 - cpfBase64.length % 4) % 4;
            const cpfBase64Padded = cpfBase64 + '='.repeat(padding);
            const cpfLimpo = atob(cpfBase64Padded);
            return cpfLimpo;
        } catch (e) {
            console.error('Erro ao decodificar CPF:', e);
            return null;
        }
    }
    return null;
}

// Busca irmão por CPF diretamente
function buscarPorCpf(cpfLimpo) {
    const irmao = db.irmaos.find(i => {
        const cpfIrmao = (i.cpf || '').replace(/\D/g, '');
        return cpfIrmao === cpfLimpo;
    });
    
    if (!irmao) {
        addBotMessage('Não encontrei seus dados. Verifique se o CPF está correto.');
        return;
    }
    
    // Verifica se está ativo
    if (irmao.ativo === false) {
        addBotMessage('Seu cadastro está inativo. Entre em contato com a administração.');
        return;
    }
    
    currentIrmao = irmao;
    addBotMessage(`Olá <strong>${irmao.nome}</strong>! Encontrei seus dados. Verificando seus pagamentos...`);
    
    // Esconde a seção de busca quando encontrar automaticamente
    const searchSection = document.getElementById('searchSection');
    if (searchSection) {
        searchSection.classList.add('hidden');
    }
    
    setTimeout(() => {
        showPendencias();
    }, 1000);
}

// Carrega dados ao iniciar
loadData();

function loadData() {
    fetch('file.json?' + new Date().getTime(), {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
        }
    })
    .then(response => {
        if (!response.ok) throw new Error('Arquivo não encontrado');
        return response.text();
    })
    .then(text => {
        try {
            db = JSON.parse(text);
            console.log('✅ Dados carregados:', db.irmaos.length, 'irmãos,', db.pagamentos.length, 'pagamentos');
            
            // Verifica se há CPF na URL e busca automaticamente
            const cpfDaUrl = decodeCpfFromUrl();
            if (cpfDaUrl) {
                setTimeout(() => {
                    buscarPorCpf(cpfDaUrl);
                }, 500); // Aguarda um pouco para garantir que tudo está carregado
            }
        } catch (e) {
            console.error('Erro ao parsear JSON:', e);
            addBotMessage('Erro ao carregar dados. Por favor, tente novamente mais tarde.');
        }
    })
    .catch(error => {
        console.error('Erro ao carregar file.json:', error);
        addBotMessage('Erro ao carregar dados. Por favor, tente novamente mais tarde.');
    });
}

function addBotMessage(text) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-bot';
    messageDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">${text}</div>
    `;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addUserMessage(text) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-user';
    messageDiv.innerHTML = `
        <div class="message-avatar">👤</div>
        <div class="message-content">${text}</div>
    `;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function searchIrmao() {
    const searchValue = document.getElementById('searchInput').value.trim();
    
    if (!searchValue) {
        addBotMessage('Por favor, informe seu CPF ou nome completo.');
        return;
    }
    
    addUserMessage(searchValue);
    
    // Busca por CPF ou nome
    const cpfLimpo = searchValue.replace(/\D/g, '');
    const searchLower = searchValue.toLowerCase();
    
    const irmao = db.irmaos.find(i => {
        const cpfIrmao = (i.cpf || '').replace(/\D/g, '');
        const nomeIrmao = (i.nome || '').toLowerCase();
        return cpfIrmao === cpfLimpo || nomeIrmao.includes(searchLower);
    });
    
    if (!irmao) {
        addBotMessage('Não encontrei seus dados. Verifique se o CPF ou nome estão corretos.');
        return;
    }
    
    // Verifica se está ativo
    if (irmao.ativo === false) {
        addBotMessage('Seu cadastro está inativo. Entre em contato com a administração.');
        return;
    }
    
    currentIrmao = irmao;
    showPendencias();
}

function showPendencias() {
    if (!currentIrmao) return;
    
    // Busca todos os pagamentos em aberto do irmão
    const pagamentosEmAberto = db.pagamentos.filter(p => 
        p.id_irmao === currentIrmao.id && 
        !['PAGO', 'ISENTO', 'ACORDO'].includes(p.status)
    );
    
    // Calcula meses devidos desde 2026-01 até hoje
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
    
    const mesesSemPagamento = mesesDevidos.filter(mes => {
        const pag = db.pagamentos.find(p => p.id_irmao === currentIrmao.id && p.competencia === mes);
        return !pag || !['PAGO', 'ISENTO', 'ACORDO'].includes(pag.status);
    });
    
    // Adiciona meses que têm pagamento em aberto mas não estão na lista calculada
    pagamentosEmAberto.forEach(pag => {
        if (!mesesSemPagamento.includes(pag.competencia)) {
            mesesSemPagamento.push(pag.competencia);
        }
    });
    
    // Ordena por competência (mais recente primeiro)
    mesesSemPagamento.sort((a, b) => b.localeCompare(a));
    
    if (mesesSemPagamento.length === 0) {
        addBotMessage(`✅ <strong>${currentIrmao.nome}</strong>, você está em dia! Todos os pagamentos foram confirmados.`);
        document.getElementById('searchSection').classList.add('hidden');
        document.getElementById('confirmSection').innerHTML = `
            <div class="status-em-dia">
                ✅ Você está em dia! Todos os pagamentos foram confirmados.
            </div>
        `;
        document.getElementById('confirmSection').classList.remove('hidden');
        return;
    }
    
    // Formata competência para exibição (MM/YYYY)
    function formatCompetencia(comp) {
        if (!comp || comp.length !== 7) return comp;
        const [year, month] = comp.split('-');
        return `${month}/${year}`;
    }
    
    // Formata valor monetário
    function formatCurrency(value) {
        if (!value && value !== 0) return '0,00';
        const numValue = typeof value === 'string' ? parseFloat(value.replace(',', '.')) || 0 : (value || 0);
        return numValue.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    
    // Calcula valores
    const mesesComValores = mesesSemPagamento.map(comp => {
        const pag = db.pagamentos.find(p => p.id_irmao === currentIrmao.id && p.competencia === comp);
        return {
            competencia: comp,
            valor: pag ? (pag.valor || 0) : 0
        };
    });
    
    const total = mesesComValores.reduce((sum, p) => sum + (p.valor || 0), 0);
    
    addBotMessage(`Encontrei <strong>${mesesSemPagamento.length}</strong> ${mesesSemPagamento.length === 1 ? 'mês' : 'meses'} em aberto para <strong>${currentIrmao.nome}</strong>.<br><br>Total: <strong>R$ ${formatCurrency(total)}</strong>`);
    
    // Mostra interface de confirmação
    document.getElementById('searchSection').classList.add('hidden');
    
    let html = `
        <div style="margin-bottom: 15px;">
            <strong>Meses em Aberto:</strong>
        </div>
    `;
    
        mesesComValores.forEach(({ competencia, valor }) => {
            const compFormatado = formatCompetencia(competencia);
            const valorFormatado = formatCurrency(valor);
            const comprovanteId = `comprovante_${competencia}`;
            
            html += `
            <div class="pendencia-item" id="pendencia_${competencia}" style="margin-bottom: 25px;">
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #333;">
                        📅 Mês: ${compFormatado}
                    </div>
                    ${valor > 0 ? `<div style="font-size: 22px; color: #856404; font-weight: bold; margin-bottom: 15px;">💵 Valor: R$ ${valorFormatado}</div>` : ''}
                </div>
                <button class="btn btn-success" id="btn_${competencia}" data-competencia="${competencia}" style="width: 100%; margin-bottom: 15px;">
                    ✅ CONFIRMAR PAGAMENTO DESTE MÊS
                </button>
                <div class="comprovante-upload" id="upload_${competencia}" style="margin-top: 15px;">
                    <label for="${comprovanteId}" style="cursor: pointer; color: #667eea; font-weight: 600; font-size: 18px; display: block; padding: 15px; border: 2px dashed #667eea; border-radius: 12px; text-align: center;">
                        📎 Enviar Comprovante (opcional)
                    </label>
                    <input type="file" id="${comprovanteId}" accept="image/*,.pdf" data-competencia="${competencia}" style="display: none;">
                    <div id="preview_${competencia}"></div>
                </div>
            </div>
        `;
        });
    
    html += `
        <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <button class="btn btn-danger" onclick="cancelar()">❌ Cancelar</button>
        </div>
    `;
    
    document.getElementById('confirmSection').innerHTML = html;
    document.getElementById('confirmSection').classList.remove('hidden');
    
    // Adiciona event listeners para os botões de confirmação (usando event delegation)
    setTimeout(() => {
        mesesComValores.forEach(({ competencia }) => {
            const btn = document.getElementById(`btn_${competencia}`);
            if (btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔵 Botão clicado para competencia:', competencia);
                    confirmarPagamento(competencia);
                });
                console.log('✅ Listener adicionado ao botão:', competencia);
            } else {
                console.error('❌ Botão não encontrado:', `btn_${competencia}`);
            }
            
            // Adiciona listener para o input de comprovante
            const comprovanteInput = document.getElementById(`comprovante_${competencia}`);
            if (comprovanteInput) {
                comprovanteInput.addEventListener('change', function(e) {
                    handleComprovante(competencia, e.target.files[0]);
                });
            }
        });
        console.log('✅ Event listeners adicionados para', mesesComValores.length, 'botões');
    }, 100);
}

function handleComprovante(competencia, file) {
    if (!file) return;
    
    comprovantes[competencia] = file;
    
    const previewDiv = document.getElementById(`preview_${competencia}`);
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewDiv.innerHTML = `
                <img src="${e.target.result}" class="comprovante-preview" style="max-width: 200px; margin-top: 10px;">
                <div style="margin-top: 5px; font-size: 12px; color: #666;">${file.name}</div>
            `;
        };
        reader.readAsDataURL(file);
    } else {
        previewDiv.innerHTML = `
            <div style="margin-top: 10px; padding: 10px; background: #e7f3ff; border-radius: 8px;">
                📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)
            </div>
        `;
    }
}

function confirmarPagamento(competencia) {
    console.log('🔵 confirmarPagamento chamado com competencia:', competencia);
    console.log('🔵 currentIrmao:', currentIrmao);
    console.log('🔵 db:', db);
    
    try {
        if (!currentIrmao) {
            console.error('❌ currentIrmao não encontrado');
            addBotMessage('❌ Erro: dados não encontrados. Por favor, recarregue a página.');
            return;
        }
        
        if (!competencia) {
            console.error('❌ competencia não fornecida');
            addBotMessage('❌ Erro: mês não identificado. Por favor, tente novamente.');
            return;
        }
        
        // Desabilita o botão para evitar cliques duplos
        const btn = document.getElementById(`btn_${competencia}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ Processando...';
            btn.style.opacity = '0.7';
        }
        
        console.log('🔵 Buscando pagamento existente...');
        // Encontra ou cria o pagamento
        let pagamento = db.pagamentos.find(p => p.id_irmao === currentIrmao.id && p.competencia === competencia);
        
        const hoje = new Date();
        const dataPagamento = hoje.toISOString().split('T')[0]; // YYYY-MM-DD
        
        if (!pagamento) {
            console.log('🔵 Pagamento não encontrado, criando novo...');
            // Busca valor do pagamento se existir em outro registro
            const pagExistente = db.pagamentos.find(p => p.competencia === competencia && p.valor > 0);
            const valor = pagExistente ? pagExistente.valor : 0;
            
            pagamento = {
                id_irmao: currentIrmao.id,
                competencia: competencia,
                status: 'PAGO',
                data_pagamento: dataPagamento,
                obs: 'Confirmado pelo sistema de confirmação pública',
                valor: valor
            };
            db.pagamentos.push(pagamento);
            console.log('✅ Novo pagamento criado:', pagamento);
        } else {
            console.log('🔵 Pagamento encontrado, atualizando status...');
            console.log('🔵 Status ANTES da atualização:', pagamento.status);
            pagamento.status = 'PAGO';
            pagamento.data_pagamento = dataPagamento;
            if (!pagamento.obs || pagamento.obs === '') {
                pagamento.obs = 'Confirmado pelo sistema de confirmação pública';
            }
            console.log('✅ Pagamento atualizado:', pagamento);
            console.log('🔵 Status DEPOIS da atualização:', pagamento.status);
            
            // Verifica se a atualização foi aplicada ao array
            const pagamentoVerificado = db.pagamentos.find(p => 
                p.id_irmao === currentIrmao.id && 
                p.competencia === competencia
            );
            console.log('🔵 Verificação: pagamento no array tem status:', pagamentoVerificado ? pagamentoVerificado.status : 'NÃO ENCONTRADO');
        }
        
        // Verifica novamente antes de salvar
        const pagamentoFinal = db.pagamentos.find(p => 
            p.id_irmao === currentIrmao.id && 
            p.competencia === competencia
        );
        if (pagamentoFinal && pagamentoFinal.status === 'PAGO') {
            console.log('✅ CONFIRMADO: Pagamento está com status PAGO antes de salvar');
        } else {
            console.error('❌ ERRO CRÍTICO: Pagamento NÃO está com status PAGO antes de salvar!', pagamentoFinal);
        }
        
        // Atualiza interface IMEDIATAMENTE
        const pendenciaDiv = document.getElementById(`pendencia_${competencia}`);
        if (pendenciaDiv) {
            pendenciaDiv.classList.add('pago');
            pendenciaDiv.innerHTML = `
                <div style="text-align: center; padding: 30px;">
                    <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
                    <div style="font-size: 28px; font-weight: bold; color: #28a745; margin-bottom: 15px;">
                        PAGAMENTO CONFIRMADO!
                    </div>
                    <div style="font-size: 22px; color: #333; margin-bottom: 10px;">
                        Mês: <strong>${formatCompetencia(competencia)}</strong>
                    </div>
                    <div style="font-size: 20px; color: #666; margin-top: 15px;">
                        Status atualizado com sucesso
                    </div>
                </div>
            `;
        }
        
        addBotMessage(`✅ Pagamento do mês <strong>${formatCompetencia(competencia)}</strong> confirmado com sucesso!`);
        
        // Salva no servidor e localStorage (após atualizar interface)
        console.log('🔵 Chamando saveData com competencia:', competencia);
        saveData(competencia);
        
        // Verifica se ainda há pendências
        setTimeout(() => {
            const aindaPendentes = db.pagamentos.filter(p => 
                p.id_irmao === currentIrmao.id && 
                !['PAGO', 'ISENTO', 'ACORDO'].includes(p.status)
            );
            
            console.log('🔵 Pendências restantes:', aindaPendentes.length);
            
            if (aindaPendentes.length === 0) {
                addBotMessage(`🎉 Parabéns! Todos os seus pagamentos foram confirmados. Você está em dia!`);
                document.getElementById('confirmSection').innerHTML = `
                    <div class="status-em-dia">
                        ✅ Você está em dia! Todos os pagamentos foram confirmados.
                    </div>
                    <button class="btn" onclick="location.reload()" style="margin-top: 20px;">🔄 Nova Consulta</button>
                `;
            }
        }, 500);
        
    } catch (error) {
        console.error('❌ Erro ao confirmar pagamento:', error);
        addBotMessage(`❌ Erro ao confirmar pagamento: ${error.message}. Por favor, tente novamente.`);
        
        // Reabilita o botão em caso de erro
        const btn = document.getElementById(`btn_${competencia}`);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '✅ CONFIRMAR PAGAMENTO DESTE MÊS';
            btn.style.opacity = '1';
        }
    }
}

function formatCompetencia(comp) {
    if (!comp || comp.length !== 7) return comp;
    const [year, month] = comp.split('-');
    return `${month}/${year}`;
}

function saveData(competenciaConfirmada) {
    console.log('💾 saveData chamado com competencia:', competenciaConfirmada);
    console.log('💾 db.pagamentos.length:', db.pagamentos ? db.pagamentos.length : 'undefined');
    
    // Verifica se db tem a estrutura correta
    if (!db.irmaos || !Array.isArray(db.irmaos)) {
        console.error('❌ db.irmaos não é um array válido');
        db.irmaos = [];
    }
    if (!db.pagamentos || !Array.isArray(db.pagamentos)) {
        console.error('❌ db.pagamentos não é um array válido');
        db.pagamentos = [];
    }
    
    // Verifica se o pagamento foi realmente atualizado
    if (competenciaConfirmada && currentIrmao) {
        const pagamentoAtualizado = db.pagamentos.find(p => 
            p.id_irmao === currentIrmao.id && 
            p.competencia === competenciaConfirmada
        );
        console.log('💾 Pagamento atualizado encontrado:', pagamentoAtualizado);
        if (pagamentoAtualizado) {
            console.log('💾 Status do pagamento:', pagamentoAtualizado.status);
            if (pagamentoAtualizado.status !== 'PAGO') {
                console.error('❌ ERRO: Status não está como PAGO! Status atual:', pagamentoAtualizado.status);
            }
        } else {
            console.warn('⚠️ Pagamento não encontrado após atualização!');
        }
    }
    
    // Prepara o objeto completo para salvar (mesma estrutura do file.json)
    const dadosParaSalvar = {
        irmaos: db.irmaos,
        pagamentos: db.pagamentos
    };
    
    console.log('💾 Estrutura dos dados para salvar:', {
        irmaos: dadosParaSalvar.irmaos.length,
        pagamentos: dadosParaSalvar.pagamentos.length,
        primeiroPagamento: dadosParaSalvar.pagamentos[0] || 'nenhum'
    });
    
    // Salva os dados atualizados no localStorage como backup
    try {
        const backupData = {
            timestamp: new Date().toISOString(),
            data: dadosParaSalvar
        };
        localStorage.setItem('gestao_confirmacoes_backup', JSON.stringify(backupData));
        console.log('✅ Backup salvo no localStorage');
    } catch (e) {
        console.error('❌ Erro ao salvar backup:', e);
    }
    
    // Tenta salvar no servidor via PUT
    console.log('💾 Enviando dados para o servidor...');
    console.log('💾 JSON a ser enviado (primeiros 500 chars):', JSON.stringify(dadosParaSalvar).substring(0, 500));
    
    fetch('/api/save-file.json', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(dadosParaSalvar)
    })
    .then(response => {
        console.log('💾 Resposta do servidor:', response.status, response.statusText);
        if (!response.ok) {
            // Tenta ler a resposta mesmo em caso de erro
            return response.text().then(text => {
                console.error('❌ Resposta de erro do servidor:', text);
                throw new Error('Resposta do servidor não OK: ' + response.status + ' - ' + text);
            });
        }
        return response.json();
    })
    .then(result => {
        console.log('💾 Resultado do servidor:', result);
        if (result.success) {
            console.log('✅ file.json atualizado no servidor com sucesso!');
            console.log('💾 Pagamentos salvos:', result.pagamentos, '| Pagamentos PAGO:', result.pagamentosPagos);
            if (competenciaConfirmada) {
                setTimeout(() => {
                    addBotMessage(`✅ <strong>Salvo com sucesso!</strong> O pagamento do mês <strong>${formatCompetencia(competenciaConfirmada)}</strong> foi atualizado no sistema.`);
                }, 1000);
            }
        } else {
            console.error('❌ Servidor respondeu mas não confirmou sucesso:', result);
            if (competenciaConfirmada) {
                addBotMessage('⚠️ Pagamento confirmado, mas houve um problema ao salvar. Tente novamente ou entre em contato.');
            }
        }
    })
    .catch(error => {
        console.error('❌ Erro ao salvar no servidor:', error);
        console.log('💾 Dados salvos localmente. Use o botão "Sincronizar Confirmações" no dashboard.');
        if (competenciaConfirmada) {
            addBotMessage('⚠️ Pagamento confirmado! Os dados foram salvos localmente. Por favor, entre em contato para sincronizar.');
        }
    });
    
    console.log('💾 Dados atualizados:', db.pagamentos ? db.pagamentos.length : 0, 'pagamentos');
}

function cancelar() {
    location.reload();
}

// Event listeners
document.getElementById('btnSearch').addEventListener('click', searchIrmao);
document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchIrmao();
    }
});

// Expor funções globalmente para uso nos botões
window.confirmarPagamento = confirmarPagamento;
window.handleComprovante = handleComprovante;
window.cancelar = cancelar;
