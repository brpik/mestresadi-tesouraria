const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const PORT = Number(process.env.PORT || 8001);
const ROOT_DIR = __dirname;
const FILE_JSON_PATH = path.join(ROOT_DIR, 'file.json');
const BOLETOS_DIR = path.join(ROOT_DIR, 'boletos');
const COMPROVANTES_DIR = path.join(ROOT_DIR, 'comprovantes');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/boletos', express.static(BOLETOS_DIR));
app.use('/comprovantes', express.static(COMPROVANTES_DIR));
app.use(express.static(ROOT_DIR));

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function validatePayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Payload inválido');
  }
  if (!Array.isArray(data.irmaos) || !Array.isArray(data.pagamentos)) {
    throw new Error('Estrutura inválida: "irmaos" e "pagamentos" devem ser arrays');
  }
}

app.put('/api/save-file.json', (req, res) => {
  try {
    const data = req.body;
    validatePayload(data);

    const pagamentosPagos = data.pagamentos.filter((p) => p && p.status === 'PAGO');

    fs.writeFileSync(FILE_JSON_PATH, JSON.stringify(data, null, 2), 'utf8');

    res.json({
      success: true,
      message: 'file.json atualizado com sucesso',
      irmaos: data.irmaos.length,
      pagamentos: data.pagamentos.length,
      pagamentosPagos: pagamentosPagos.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const uploadComprovante = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadBoleto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function getField(req, name) {
  return String((req.body && req.body[name]) || (req.query && req.query[name]) || '').trim();
}

app.post('/api/upload-comprovante', uploadComprovante.single('comprovante'), (req, res) => {
  try {
    const idIrmao = getField(req, 'id_irmao');
    const competencia = getField(req, 'competencia');
    if (!idIrmao || !competencia) {
      return res.status(400).json({ success: false, error: 'id_irmao e competencia são obrigatórios' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'Arquivo de comprovante não encontrado' });
    }

    ensureDir(COMPROVANTES_DIR);
    const ext =
      path.extname(req.file.originalname) ||
      (req.file.mimetype && req.file.mimetype.startsWith('image/') ? '.jpg' : '.pdf');
    const filename = `${idIrmao}_${competencia}${ext}`;
    const filePath = path.join(COMPROVANTES_DIR, filename);
    fs.writeFileSync(filePath, req.file.buffer);

    res.json({
      success: true,
      message: 'Comprovante enviado com sucesso',
      filename,
      url: `/comprovantes/${filename}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/upload-boleto', uploadBoleto.single('boleto'), (req, res) => {
  try {
    const idIrmao = getField(req, 'id_irmao');
    const competencia = getField(req, 'competencia');
    if (!idIrmao || !competencia) {
      return res.status(400).json({ success: false, error: 'id_irmao e competencia são obrigatórios' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'Arquivo de boleto não encontrado' });
    }

    ensureDir(BOLETOS_DIR);
    const filename = `${idIrmao}_${competencia}.pdf`;
    const filePath = path.join(BOLETOS_DIR, filename);
    fs.writeFileSync(filePath, req.file.buffer);

    res.json({
      success: true,
      message: 'Boleto enviado com sucesso',
      filename,
      url: `/boletos/${filename}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  return next();
});

app.listen(PORT, () => {
  console.log('============================================================');
  console.log('🚀 Servidor Node.js iniciado!');
  console.log(`📂 Diretório: ${ROOT_DIR}`);
  console.log(`🌐 Acesse: http://localhost:${PORT}/index.html`);
  console.log('============================================================');
});
