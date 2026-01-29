// Arquivo de Mensagens e Configurações Personalizáveis
const Messages = {
    // Mensagens de Erro
    errors: {
        xlsxNotLoaded: 'Erro: Biblioteca XLSX não está carregada. Verifique se o arquivo xlsx.full.min.js está presente.',
        excelMissingTabs: 'Erro: O Excel precisa ter as abas "IRMAOS" e "PAGAMENTOS".',
        excelProcessingError: 'Erro ao processar arquivo Excel',
        invalidFileFormat: 'Formato de arquivo inválido.',
        jsonReadError: 'Erro ao ler arquivo JSON.',
        copyError: 'Erro ao copiar dados. Verifique o console para mais detalhes.',
        copyFailed: 'Não foi possível copiar. Tente selecionar e copiar manualmente.',
        saveError: 'Erro ao salvar dados.'
    },
    
    // Mensagens de Sucesso
    success: {
        dataImported: (irmaos, pagamentos) => `Dados importados: ${irmaos} irmãos e ${pagamentos} pagamentos.`,
        dataCopied: (irmaos, pagamentos) => `✅ Dados copiados com sucesso!\n\n${irmaos} irmãos\n${pagamentos} pagamentos`,
        backupRestored: 'Backup restaurado com sucesso!',
        fileJsonLoaded: (irmaos, pagamentos) => `file.json carregado com sucesso! ${irmaos} irmãos e ${pagamentos} pagamentos.`,
        dataSaved: '✅ Dados salvos!'
    },
    
    // Mensagens de Confirmação
    confirm: {
        deletePagamento: 'Tem certeza que deseja excluir este pagamento?',
        deleteIrmao: 'Tem certeza que deseja excluir este irmão e todo histórico?',
        duplicateCompetencia: 'Já existe um pagamento para esta competência!'
    },
    
    // Mensagens Informativas
    info: {
        noData: 'Nenhum dado carregado',
        noDataInstructions: 'Clique em "📄 Carregar file.json" ou importe um arquivo Excel para começar',
        noResults: '🔍 Nenhum resultado encontrado',
        noResultsInstructions: (onlyOpen, searchVal) => {
            let msg = '';
            if (onlyOpen) msg += '• Desmarque "Apenas com pendências" para ver todos os irmãos<br>';
            if (searchVal) msg += '• Limpe a busca para ver todos os resultados<br>';
            if (!onlyOpen && !searchVal) msg += 'Verifique se os dados foram carregados corretamente';
            return msg;
        },
        xlsxNotAvailable: 'file.json não encontrado ou não pôde ser carregado automaticamente. Use o botão "Carregar file.json" para importar manualmente.',
        fileJsonEmpty: 'file.json carregado mas está vazio ou formato inválido'
    },
    
    // Labels e Textos da Interface
    labels: {
        importData: 'Importar Dados (XLSX)',
        importDataSubtitle: 'Abas: IRMAOS e PAGAMENTOS',
        searchPlaceholder: 'Buscar por nome ou CPF...',
        filterOpenOnly: 'Apenas com pendências',
        filterAlphabet: 'Filtrar por letra',
        allLetters: 'Todas',
        results: 'Resultados',
        of: 'de',
        irmãos: 'irmãos exibidos',
        hiddenByFilters: 'ocultos por filtros',
        filterActive: 'Filtro',
        searchActive: 'Busca',
        addPayment: 'Adicionar Pagamento',
        newBrother: 'Novo',
        delete: 'Excluir',
        history: 'Histórico',
        month: 'Mês',
        status: 'Status',
        paymentDate: 'Data Pag.',
        observations: 'Obs',
        actions: 'Ações',
        selectYear: 'Ano:',
        selectMonth: 'Mês:',
        cancel: 'Cancelar',
        add: 'Adicionar',
        copyData: 'Copiar Dados',
        backupJson: 'Backup JSON',
        restoreBackup: 'Restaurar Backup',
        loadFileJson: 'Carregar file.json',
        saved: 'Salvo',
        inDay: 'Em dia',
        pending: 'Pendente',
        paid: 'PAGO ✅',
        withoutWhatsApp: 'Sem WhatsApp',
        ok: '✅ OK'
    },
    
    // Mensagens de WhatsApp (cobrança)
    whatsapp: {
        message: (nome, mesesComValores, total, linkConfirmacao, linkBoletos, linkBoletosPagos) => {
            const primeiroNome = (nome || '').split(' ')[0] || '';
            let msg = `A∴R∴L∴S∴ Mestre Sadi Nº 98 —\n\n`;
            msg += `Respeitável Ir∴ ${primeiroNome},\n\n`;
            msg += `Em nossos registros constam mensalidades em aberto:\n\n`;

            // Adiciona cada mês com seu valor
            mesesComValores.forEach(({ mes, valor }) => {
                const valorFormatado = typeof valor === 'number' ? valor.toFixed(2).replace('.', ',') : (valor || '0,00');
                msg += `• ${mes}: R$ ${valorFormatado}\n`;
            });

            msg += `Total em aberto: R$ ${total.toFixed(2).replace('.', ',')}\n\n`;
            msg += `📌 Para confirmar pagamentos ou enviar comprovante (prioridade):\n${linkConfirmacao}\n\n`;

            if (linkBoletos) {
                msg += `📌 Para baixar os boletos em aberto:\n${linkBoletos}\n\n`;
            }

            if (linkBoletosPagos) {
                msg += `📌 Para ver o extrato de boletos pagos:\n${linkBoletosPagos}\n\n`;
            }

            msg += `Caso já tenha efetuado o pagamento, por gentileza, confirme através do link acima para atualizarmos nossos registros.\n\n`;
            msg += `Mensagem enviada por sistema automático (sujeita a falhas). Em caso de qualquer dúvida, contate o Ir∴ Tesoureiro.\n\n`;
            msg += `T∴F∴A∴.\n`;
            msg += `Ir∴ Gabriel Oliveira — Tesoureiro`;

            return msg;
        }
    },
    
    // Formato de Data
    dateFormat: {
        // Converte data para DD/MM/YYYY
        format: (dateString) => {
            if (!dateString) return '';
            try {
                // Se já está no formato YYYY-MM-DD
                if (dateString.includes('-') && dateString.length === 10) {
                    const [year, month, day] = dateString.split('-');
                    return `${day}/${month}/${year}`;
                }
                // Se está no formato ISO
                if (dateString.includes('T')) {
                    const date = new Date(dateString);
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    return `${day}/${month}/${year}`;
                }
                return dateString;
            } catch (e) {
                return dateString;
            }
        },
        
        // Converte DD/MM/YYYY para YYYY-MM-DD (para salvar)
        parse: (dateString) => {
            if (!dateString) return '';
            try {
                // Se está no formato DD/MM/YYYY
                if (dateString.includes('/') && dateString.length === 10) {
                    const [day, month, year] = dateString.split('/');
                    return `${year}-${month}-${day}`;
                }
                return dateString;
            } catch (e) {
                return dateString;
            }
        },
        
        // Formata data atual para DD/MM/YYYY
        today: () => {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            return `${day}/${month}/${year}`;
        }
    }
};
