let db = { irmaos: [], pagamentos: [], cobrancas: [], acessos: [], despesas: [], saldo_base: 0 };

function formatDateTime(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
        return dateString;
    }
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch {
        return dateString;
    }
}

function formatCurrency(value) {
    const num = Number(value || 0);
    return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatCompetencia(comp) {
    if (!comp || comp.length !== 7) return comp || '';
    const [year, month] = comp.split('-');
    return `${month}/${year}`;
}

function renderResumo() {
    const resumoEl = document.getElementById('resumoFinanceiro');
    if (!resumoEl) return;

    const totalReceitas = db.pagamentos
        .filter(p => String(p.status || '').toUpperCase() === 'PAGO')
        .reduce((sum, p) => sum + (p.valor || 0), 0);

    const totalAbertos = db.pagamentos
        .filter(p => String(p.status || '').toUpperCase() === 'EM_ABERTO')
        .reduce((sum, p) => sum + (p.valor || 0), 0);

    const totalDespesas = db.despesas.reduce((sum, d) => sum + (d.valor || 0), 0);
    const saldoAtual = (db.saldo_base || 0) - totalDespesas;

    resumoEl.innerHTML = `
        <strong>Receitas acumuladas:</strong> R$ ${formatCurrency(totalReceitas)}<br>
        <strong>Em aberto:</strong> R$ ${formatCurrency(totalAbertos)}<br>
        <strong>Despesas:</strong> R$ ${formatCurrency(totalDespesas)}<br>
        <strong>Saldo atual:</strong> R$ ${formatCurrency(saldoAtual)}
    `;
}

function renderCobrancas() {
    const container = document.getElementById('tabelaCobrancas');
    if (!container) return;
    const filtro = (document.getElementById('filtroCobranca')?.value || '').toLowerCase();

    const rows = db.cobrancas
        .filter(c => !filtro || (c.nome || '').toLowerCase().includes(filtro))
        .map(c => `
            <tr>
                <td>${formatDateTime(c.data_hora)}</td>
                <td>${c.nome || ''}</td>
                <td>${Array.isArray(c.pendencias) ? c.pendencias.length : 0}</td>
                <td>R$ ${formatCurrency(c.total || 0)}</td>
            </tr>
        `).join('');

    container.innerHTML = rows
        ? `<table><tr><th>Data/Hora</th><th>Nome</th><th>Pendências</th><th>Total</th></tr>${rows}</table>`
        : '<div class="muted">Nenhuma cobrança registrada.</div>';
}

function renderAcessos() {
    const container = document.getElementById('tabelaAcessos');
    if (!container) return;
    const tipo = document.getElementById('filtroAcessoTipo')?.value || '';
    const nomeFiltro = (document.getElementById('filtroAcessoNome')?.value || '').toLowerCase();

    const rows = db.acessos
        .filter(a => !tipo || a.tipo === tipo)
        .filter(a => !nomeFiltro || (a.nome || '').toLowerCase().includes(nomeFiltro))
        .map(a => `
            <tr>
                <td>${formatDateTime(a.data_hora)}</td>
                <td>${a.nome || ''}</td>
                <td>${a.tipo || ''}</td>
                <td>${a.metadata && a.metadata.competencia ? formatCompetencia(a.metadata.competencia) : ''}</td>
                <td>${a.origem || ''}</td>
            </tr>
        `).join('');

    container.innerHTML = rows
        ? `<table><tr><th>Data/Hora</th><th>Nome</th><th>Tipo</th><th>Competência</th><th>Origem</th></tr>${rows}</table>`
        : '<div class="muted">Nenhum acesso registrado.</div>';
}

function renderDespesas() {
    const container = document.getElementById('tabelaDespesas');
    if (!container) return;
    const rows = db.despesas
        .slice()
        .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
        .map(d => `
            <tr>
                <td>${formatDate(d.data)}</td>
                <td>${d.descricao || ''}</td>
                <td>R$ ${formatCurrency(d.valor || 0)}</td>
            </tr>
        `).join('');

    container.innerHTML = rows
        ? `<table><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr>${rows}</table>`
        : '<div class="muted">Nenhuma despesa registrada.</div>';
}

function exportLogsXls() {
    if (typeof XLSX === 'undefined') {
        alert('Biblioteca XLSX não carregada.');
        return;
    }

    const cobrancasRows = db.cobrancas.map(c => ({
        Data_Hora: formatDateTime(c.data_hora),
        Nome: c.nome || '',
        Pendencias: Array.isArray(c.pendencias) ? c.pendencias.length : 0,
        Total: Number(c.total || 0)
    }));

    const acessosRows = db.acessos.map(a => ({
        Data_Hora: formatDateTime(a.data_hora),
        Nome: a.nome || '',
        Tipo: a.tipo || '',
        Competencia: a.metadata && a.metadata.competencia ? formatCompetencia(a.metadata.competencia) : '',
        Origem: a.origem || ''
    }));

    const despesasRows = db.despesas.map(d => ({
        Data: formatDate(d.data),
        Descricao: d.descricao || '',
        Valor: Number(d.valor || 0)
    }));

    const wb = XLSX.utils.book_new();
    if (cobrancasRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cobrancasRows), 'Cobrancas');
    if (acessosRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(acessosRows), 'Acessos');
    if (despesasRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(despesasRows), 'Despesas');

    if (!wb.SheetNames.length) {
        alert('Sem dados para exportar.');
        return;
    }

    XLSX.writeFile(wb, `logs_relatorios_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function attachFilters() {
    const filtroCobranca = document.getElementById('filtroCobranca');
    const filtroAcessoTipo = document.getElementById('filtroAcessoTipo');
    const filtroAcessoNome = document.getElementById('filtroAcessoNome');
    const btnExport = document.getElementById('btnExportLogs');

    if (filtroCobranca) filtroCobranca.addEventListener('input', renderCobrancas);
    if (filtroAcessoTipo) filtroAcessoTipo.addEventListener('change', renderAcessos);
    if (filtroAcessoNome) filtroAcessoNome.addEventListener('input', renderAcessos);
    if (btnExport) btnExport.addEventListener('click', exportLogsXls);
}

function loadData() {
    fetch('file.json?' + new Date().getTime(), { cache: 'no-store' })
        .then(res => {
            if (!res.ok) throw new Error('Erro ao carregar file.json');
            return res.json();
        })
        .then(data => {
            db = {
                irmaos: Array.isArray(data.irmaos) ? data.irmaos : [],
                pagamentos: Array.isArray(data.pagamentos) ? data.pagamentos : [],
                cobrancas: Array.isArray(data.cobrancas) ? data.cobrancas : [],
                acessos: Array.isArray(data.acessos) ? data.acessos : [],
                despesas: Array.isArray(data.despesas) ? data.despesas : [],
                saldo_base: typeof data.saldo_base === 'number' ? data.saldo_base : (parseFloat(data.saldo_base) || 0)
            };
            renderResumo();
            renderCobrancas();
            renderAcessos();
            renderDespesas();
            attachFilters();
        })
        .catch(() => {
            document.getElementById('resumoFinanceiro').textContent = 'Erro ao carregar dados.';
        });
}

loadData();
