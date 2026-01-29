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

const comprovanteStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDir(COMPROVANTES_DIR);
    cb(null, COMPROVANTES_DIR);
  },
  filename: (req, file, cb) => {
    const idIrmao = String(req.body.id_irmao || '').trim();
    const competencia = String(req.body.competencia || '').trim();
    if (!idIrmao || !competencia) {
      return cb(new Error('id_irmao e competencia são obrigatórios'));
    }
    const ext =
      path.extname(file.originalname) ||
      (file.mimetype && file.mimetype.startsWith('image/') ? '.jpg' : '.pdf');
    cb(null, `${idIrmao}_${competencia}${ext}`);
  }
});

const boletoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDir(BOLETOS_DIR);
    cb(null, BOLETOS_DIR);
  },
  filename: (req, file, cb) => {
    const idIrmao = String(req.body.id_irmao || '').trim();
    const competencia = String(req.body.competencia || '').trim();
    if (!idIrmao || !competencia) {
      return cb(new Error('id_irmao e competencia são obrigatórios'));
    }
    cb(null, `${idIrmao}_${competencia}.pdf`);
  }
});

const uploadComprovante = multer({
  storage: comprovanteStorage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadBoleto = multer({
  storage: boletoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.post('/api/upload-comprovante', uploadComprovante.single('comprovante'), (req, res) => {
  const filename = req.file ? req.file.filename : '';
  if (!filename) {
    return res.status(400).json({ success: false, error: 'Arquivo de comprovante não encontrado' });
  }
  res.json({
    success: true,
    message: 'Comprovante enviado com sucesso',
    filename,
    url: `/comprovantes/${filename}`
  });
});

app.post('/api/upload-boleto', uploadBoleto.single('boleto'), (req, res) => {
  const filename = req.file ? req.file.filename : '';
  if (!filename) {
    return res.status(400).json({ success: false, error: 'Arquivo de boleto não encontrado' });
  }
  res.json({
    success: true,
    message: 'Boleto enviado com sucesso',
    filename
  });
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
