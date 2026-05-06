import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { createError } from '../middleware/errorHandler';

interface FinancialRecord {
  coligada?: string;
  idxcx?: string;
  numerodocumento?: string;
  segundonumero?: string;
  codcxa?: string;
  descricao?: string;
  datacriacao?: string | Date;
  datacompensacao?: string | Date;
  dataemissao?: string | Date;
  historico?: string;
  ccusto?: string;
  natureza?: string;
  fornecedor?: string;
  cpfCnpj?: string;
  saida?: number | string;
  entrada?: number | string;
  tipooperacao?: string;
  valortotal?: number | string;
  codCcusto?: string;
  codFornecedor?: string;
  codNatureza?: string;
  tipodocumento?: string;
}

function parseValue(value: any): number {
  // Se for null, undefined ou string vazia, retornar 0
  if (value === null || value === undefined || value === '') return 0;
  
  // Se já é número, retornar diretamente (pode ser negativo)
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }
  
  // Se for string, processar
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    
    // Detectar se é negativo (pode estar no início, fim, ou entre parênteses)
    const isNegative = trimmed.startsWith('-') || 
                      trimmed.includes('(') || 
                      trimmed.includes('(R$') ||
                      trimmed.includes('(R$') ||
                      /\([^)]*\)/.test(trimmed);
    
    // Remove caracteres não numéricos exceto vírgula, ponto e sinal negativo
    let cleaned = trimmed.replace(/[^\d,.-]/g, '');
    
    // Se está vazio após limpeza, retornar 0
    if (!cleaned) return 0;
    
    // Tratar formato brasileiro: 1.234,56 ou formato americano: 1,234.56
    // Se tem ponto E vírgula, verificar qual é o separador decimal
    if (cleaned.includes('.') && cleaned.includes(',')) {
      const lastDot = cleaned.lastIndexOf('.');
      const lastComma = cleaned.lastIndexOf(',');
      if (lastDot > lastComma) {
        // Formato: 1.234,56 (brasileiro - ponto é milhar, vírgula é decimal)
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        // Formato: 1,234.56 (americano - vírgula é milhar, ponto é decimal)
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      // Apenas vírgula - verificar se há múltiplas vírgulas (milhares) ou apenas uma (decimal)
      const commaCount = (cleaned.match(/,/g) || []).length;
      if (commaCount > 1 || cleaned.split(',')[0].length > 3) {
        // Múltiplas vírgulas ou muitos dígitos antes da vírgula = milhar brasileiro
        // Mas se só tem uma vírgula e menos de 4 dígitos antes, pode ser decimal
        if (commaCount === 1 && cleaned.split(',')[0].length <= 3) {
          // Provavelmente é decimal
          cleaned = cleaned.replace(',', '.');
        } else {
          // Provavelmente é milhar, remover vírgulas
          cleaned = cleaned.replace(/,/g, '');
        }
      } else {
        // Uma vírgula - assumir decimal (formato brasileiro comum)
        cleaned = cleaned.replace(',', '.');
      }
    }
    // Se só tem ponto, assumir que é decimal (formato americano simples)
    
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) {
      console.warn(`Valor não pôde ser parseado: "${value}" -> "${cleaned}"`);
      return 0;
    }
    
    return isNegative ? -Math.abs(parsed) : parsed;
  }
  
  return 0;
}

function parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    // Pode ser um número serial do Excel (dias desde 1900-01-01)
    // Excel serial dates começam em 1 de janeiro de 1900
    if (value > 0 && value < 1000000) {
      // Assumir que é data serial do Excel
      const excelEpoch = new Date(1899, 11, 30); // 30 de dezembro de 1899
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) return date;
    }
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    
    // Tentar formato ISO primeiro
    const isoDate = new Date(trimmed);
    if (!isNaN(isoDate.getTime())) return isoDate;
    
    // Tentar formato brasileiro DD/MM/YYYY ou DD-MM-YYYY
    const separators = ['/', '-', '.'];
    for (const sep of separators) {
      const parts = trimmed.split(sep);
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        
        // Validar valores
        if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 1900 && year <= 2100) {
          const date = new Date(year, month, day);
          if (!isNaN(date.getTime())) return date;
        }
      }
    }
  }
  return null;
}

function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function findColumnIndex(headers: string[], possibleNames: string[]): number {
  for (const name of possibleNames) {
    const normalized = normalizeColumnName(name);
    const index = headers.findIndex(h => normalizeColumnName(h) === normalized);
    if (index !== -1) return index;
  }
  return -1;
}

export const uploadFinancialAnalysis = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      throw createError('Arquivo não enviado', 400);
    }

    const file = req.file;
    let rows: any[] = [];

    // Normalizar nome do arquivo para comparação (case-insensitive)
    const fileName = file.originalname.toLowerCase();
    const mimeType = file.mimetype?.toLowerCase() || '';

    // Detectar tipo de arquivo por extensão e MIME type
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ||
                    mimeType.includes('spreadsheet') || mimeType.includes('excel');
    const isCSV = fileName.endsWith('.csv') || mimeType.includes('csv') || mimeType.includes('text/plain');

    // Processar Excel
    if (isExcel) {
      try {
        const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true, cellNF: false });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Usar raw: true para manter valores numéricos como números (não converter para string formatada)
        rows = XLSX.utils.sheet_to_json(worksheet, { 
          raw: true,  // Manter valores numéricos como números
          defval: null,
          dateNF: 'dd/mm/yyyy' // Formato de data esperado
        });
      } catch (error: any) {
        throw createError(`Erro ao processar arquivo Excel: ${error.message}`, 400);
      }
    } 
    // Processar CSV
    else if (isCSV) {
      const text = file.buffer.toString('utf-8');
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        throw createError('Arquivo CSV vazio', 400);
      }

      // Detectar delimitador (vírgula ou ponto e vírgula)
      const firstLine = lines[0];
      const delimiter = firstLine.includes(';') ? ';' : ',';

      // Parsear CSV manualmente
      const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
        if (values.length === headers.length) {
          const row: any = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || null;
          });
          rows.push(row);
        }
      }
    } else {
      // Log para debug
      console.log('Arquivo recebido:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });
      throw createError(`Formato de arquivo não suportado. Recebido: ${file.originalname} (${file.mimetype}). Use Excel (.xlsx, .xls) ou CSV (.csv)`, 400);
    }

    if (rows.length === 0) {
      throw createError('Arquivo vazio ou sem dados válidos', 400);
    }

    // Log das colunas encontradas (primeira linha)
    const colNames = rows.length > 0 ? Object.keys(rows[0]) : [];
    console.log('Colunas encontradas na planilha:', colNames);
    if (colNames.length > 0) {
      const colNorm = colNames.map(c => `${c}->${normalizeColumnName(c)}`);
      console.log('Colunas normalizadas (para debug Operação):', colNorm.filter(s => s.includes('oper')));
    }

    // Normalizar dados
    const records: FinancialRecord[] = rows
      .filter((row: any) => {
        // Filtrar linhas completamente vazias
        const hasData = Object.values(row).some(val => val !== null && val !== undefined && val !== '');
        return hasData;
      })
      .map((row: any) => {
      const record: FinancialRecord = {};
      
      // Mapear colunas (case-insensitive, sem acentos)
      const rowKeys = Object.keys(row);
      
      // Função auxiliar para encontrar valor
      const getValue = (possibleKeys: string[]): any => {
        for (const key of possibleKeys) {
          const normalizedKey = normalizeColumnName(key);
          const foundKey = rowKeys.find(k => normalizeColumnName(k) === normalizedKey);
          if (foundKey !== undefined) {
            const value = row[foundKey];
            // Retornar null para valores vazios ou apenas espaços
            if (value === null || value === undefined || value === '') return null;
            if (typeof value === 'string' && value.trim() === '') return null;
            return value;
          }
        }
        return null;
      };

      record.coligada = getValue(['COLIGADA', 'coligada', 'Coligada']) || null;
      record.idxcx = getValue(['IDXCX', 'idxcx', 'IdxCx', 'IDX CX', 'idx cx']) || null;
      record.numerodocumento = getValue(['NUMERODOCUMENTO', 'numerodocumento', 'NumeroDocumento', 'NÚMERODOCUMENTO', 'NÚMERO DOCUMENTO', 'numero documento', 'Número Documento']) || null;
      record.segundonumero = getValue(['SEGUNDONUMERO', 'segundonumero', 'SegundoNumero', 'SEGUNDO NUMERO', 'segundo numero']) || null;
      record.codcxa = getValue(['CODCXA', 'codcxa', 'CodCxa', 'COD CXA', 'cod cxa']) || null;
      record.descricao = getValue(['DESCRICAO', 'descricao', 'Descricao', 'DESCRIÇÃO', 'Descrição', 'descrição']) || null;
      record.datacriacao = getValue(['DATACRIACAO', 'datacriacao', 'DataCriacao', 'DATA CRIAÇÃO', 'data criação', 'Data Criação', 'DATA_CRIACAO', 'data_criacao']) || null;
      record.datacompensacao = getValue(['DATACOMPENSACAO', 'datacompensacao', 'DataCompensacao', 'DATA COMPENSAÇÃO', 'data compensação', 'Data Compensação', 'DATA_COMPENSACAO', 'data_compensacao']) || null;
      record.dataemissao = getValue(['DATAEMISSAO', 'dataemissao', 'DataEmissao', 'DATA EMISSÃO', 'data emissão', 'Data Emissão', 'DATA_EMISSAO', 'data_emissao']) || null;
      record.historico = getValue(['HISTORICO', 'historico', 'Historico', 'HISTÓRICO', 'Histórico', 'histórico']) || null;
      record.ccusto = getValue(['CCUSTO', 'ccusto', 'CCusto', 'CUSTO', 'custo', 'C CUSTO', 'c custo', 'CENTRO DE CUSTO', 'centro de custo', 'Centro de Custo']) || null;
      // SOMENTE coluna "Natureza Orçamentária Financeira" - não usar "Natureza" genérico (evita pegar Descrição/Histórico)
      record.natureza = getValue([
        'NATUREZA ORCAMENTARIA FINANCEIRA', 'Natureza Orçamentária Financeira', 'natureza orçamentária financeira',
        'NATUREZA ORCAMENTARIA', 'Natureza Orçamentária', 'natureza orçamentária'
      ]) || null;
      record.fornecedor = getValue(['FORNECEDOR', 'fornecedor', 'Fornecedor']) || null;
      record.cpfCnpj = getValue(['CPF/CNPJ', 'cpf/cnpj', 'CPFCNPJ', 'cpfcnpj', 'CpfCnpj', 'CPF CNPJ', 'cpf cnpj', 'CPF_CNPJ', 'cpf_cnpj']) || null;
      record.saida = getValue(['SAIDA', 'saida', 'Saida', 'SAÍDA', 'saída', 'Saída', 'SAÍDAS', 'saídas', 'Saídas']) || null;
      record.entrada = getValue(['ENTRADA', 'entrada', 'Entrada', 'ENTRADAS', 'entradas', 'Entradas']) || null;
      // Operação: NÃO usar 'Tipo' isolado pois conflita com "Tipo Documento"
      record.tipooperacao = getValue([
        'OPERACAO', 'operacao', 'Operacao', 'OPERAÇÃO', 'Operação', 'operação',
        'TIPO OPERACAO', 'tipo operacao', 'Tipo Operacao', 'TIPO OPERAÇÃO', 'tipo operação', 'Tipo Operação',
        'TIPOOPERACAO', 'tipooperacao', 'TipoOperacao', 'TIPO_OPERACAO', 'tipo_operacao',
        'TIPO DE OPERAÇÃO', 'tipo de operação', 'Tipo de Operação', 'TIPO DE OPERACAO', 'Tipo de Operacao',
        'OPERACOES', 'operacoes', 'Operacoes', 'OPERAÇÕES', 'Operações', 'operações'
      ]) || null;

      // Fallback: buscar coluna cujo nome normalizado contenha "operacao"
      if (!record.tipooperacao && rowKeys.length > 0) {
        const operKey = rowKeys.find(k => {
          const n = normalizeColumnName(k);
          return n.includes('operacao') || (n.includes('oper') && n.length >= 6);
        });
        if (operKey != null) {
          const v = row[operKey];
          if (v != null && String(v).trim() !== '') record.tipooperacao = v;
        }
      }

      record.valortotal = getValue(['VALORTOTAL', 'valortotal', 'ValorTotal', 'VALOR TOTAL', 'valor total', 'Valor Total', 'VALOR_TOTAL', 'valor_total', 'VALOR', 'valor', 'Valor']) || null;
      record.codCcusto = getValue(['COD_CCUSTO', 'cod_ccusto', 'CodCcusto', 'COD CCUSTO', 'cod ccusto', 'Cod Ccusto']) || null;
      record.codFornecedor = getValue(['COD_FORNECEDOR', 'cod_fornecedor', 'CodFornecedor', 'COD FORNECEDOR', 'cod fornecedor', 'Cod Fornecedor']) || null;
      record.codNatureza = getValue(['COD_NATUREZA', 'cod_natureza', 'CodNatureza', 'COD NATUREZA', 'cod natureza', 'Cod Natureza']) || null;
      record.tipodocumento = getValue(['TIPODOCUMENTO', 'tipodocumento', 'TipoDocumento', 'TIPO DOCUMENTO', 'tipo documento', 'Tipo Documento', 'TIPO_DOCUMENTO', 'tipo_documento']) || null;

      // Preservar TODAS as colunas originais da planilha (igual Natureza) - garante que Operação seja sempre encontrada
      Object.entries(row).forEach(([k, v]) => {
        if (v != null && v !== '') {
          const s = String(v).trim();
          if (s !== '') (record as any)[k] = v;
        }
      });

      return record;
    });

    // Log para debug - mostrar primeiros registros
    console.log('Primeiros 3 registros processados:', JSON.stringify(records.slice(0, 3), null, 2));
    const opVals = [...new Set(records.map(r => r.tipooperacao || '').filter(Boolean))];
    console.log('Valores únicos de tipooperacao encontrados:', opVals.length > 0 ? opVals : '(nenhum)');

    // Obter filtros de data opcionais do body (enviados via FormData)
    const startDateStr = req.body.startDate;
    const endDateStr = req.body.endDate;
    const startDate = startDateStr ? new Date(startDateStr) : null;
    const endDate = endDateStr ? new Date(endDateStr) : null;

    // Filtrar registros por data se filtros foram fornecidos
    let filteredRecords = records;
    if (startDate || endDate) {
      // Normalizar datas para comparação (apenas data, sem hora)
      const startDateNormalized = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) : null;
      const endDateNormalized = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999) : null;

      filteredRecords = records.filter(record => {
        // Tentar múltiplas colunas de data
        const dataCriacao = parseDate(record.datacriacao) || parseDate(record.dataemissao) || parseDate(record.datacompensacao);
        if (!dataCriacao) {
          // Se não tem data, incluir apenas se não há filtros (ou seja, não filtrar registros sem data)
          return !startDateNormalized && !endDateNormalized;
        }

        // Normalizar data do registro para comparação
        const recordDate = new Date(dataCriacao.getFullYear(), dataCriacao.getMonth(), dataCriacao.getDate());

        if (startDateNormalized && recordDate < startDateNormalized) return false;
        if (endDateNormalized && recordDate > endDateNormalized) return false;
        return true;
      });
      console.log(`Filtros aplicados: ${startDate ? startDate.toISOString().split('T')[0] : 'sem início'} até ${endDate ? endDate.toISOString().split('T')[0] : 'sem fim'}`);
      console.log(`Registros antes do filtro: ${records.length}, após filtro: ${filteredRecords.length}`);
    }

    // Processar e analisar dados
    const analysis = analyzeFinancialData(filteredRecords);

    res.json({
      success: true,
      message: 'Planilha processada com sucesso',
      data: analysis
    });
  } catch (error: any) {
    console.error('Erro ao processar planilha financeira:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Erro ao processar planilha financeira'
    });
  }
};

function analyzeFinancialData(records: FinancialRecord[]) {
  // Calcular totais
  let totalEntries = 0;
  let totalExits = 0;
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  // Agrupar por diferentes dimensões
  const byCompany: Map<string, { entries: number; exits: number; count: number; net: number }> = new Map();
  const byCostCenter: Map<string, { entries: number; exits: number; count: number; net: number }> = new Map();
  const byNature: Map<string, { entries: number; exits: number; count: number; net: number }> = new Map();
  const byOperacao: Map<string, { entries: number; exits: number; count: number; net: number }> = new Map();
  const bySupplier: Map<string, { entries: number; exits: number; count: number; cpfCnpj: string; net: number }> = new Map();
  const byDocumentType: Map<string, { entries: number; exits: number; count: number; net: number }> = new Map();

  records.forEach((record, index) => {
    // Usar diretamente as colunas da planilha
    const entrada = parseValue(record.entrada);
    const saida = parseValue(record.saida);
    const valorTotal = parseValue(record.valortotal);

    // Log dos primeiros registros para debug
    if (index < 5) {
      console.log(`Registro ${index + 1}:`, {
        entradaOriginal: record.entrada,
        entradaParsed: entrada,
        entradaTipo: typeof record.entrada,
        saidaOriginal: record.saida,
        saidaParsed: saida,
        saidaTipo: typeof record.saida,
        valorTotalOriginal: record.valortotal,
        valorTotalParsed: valorTotal,
        valorTotalTipo: typeof record.valortotal
      });
    }

    // Usar valores diretamente das colunas
    const entryValue = entrada; // Valor da coluna ENTRADA
    const exitValue = saida;    // Valor da coluna SAÍDA
    const netValue = valorTotal; // Valor da coluna VALORTOTAL para líquido

    totalEntries += entryValue;
    totalExits += exitValue;

    // Processar datas (tentar múltiplas colunas de data)
    const dataCriacao = parseDate(record.datacriacao) || parseDate(record.dataemissao) || parseDate(record.datacompensacao);
    if (dataCriacao) {
      if (!minDate || dataCriacao < minDate) minDate = dataCriacao;
      if (!maxDate || dataCriacao > maxDate) maxDate = dataCriacao;
    }

    // Agrupar por coligada
    const company = record.coligada || 'Não informado';
    if (!byCompany.has(company)) {
      byCompany.set(company, { entries: 0, exits: 0, count: 0, net: 0 });
    }
    const companyData = byCompany.get(company)!;
    companyData.entries += entryValue;
    companyData.exits += exitValue;
    companyData.net += netValue;
    companyData.count += 1;

    // Agrupar por centro de custo
    const costCenter = record.ccusto || record.codCcusto || 'Não informado';
    if (!byCostCenter.has(costCenter)) {
      byCostCenter.set(costCenter, { entries: 0, exits: 0, count: 0, net: 0 });
    }
    const costCenterData = byCostCenter.get(costCenter)!;
    costCenterData.entries += entryValue;
    costCenterData.exits += exitValue;
    costCenterData.net += netValue;
    costCenterData.count += 1;

    // Agrupar por natureza
    const nature = record.natureza || record.codNatureza || 'Não informado';
    if (!byNature.has(nature)) {
      byNature.set(nature, { entries: 0, exits: 0, count: 0, net: 0 });
    }
    const natureData = byNature.get(nature)!;
    natureData.entries += entryValue;
    natureData.exits += exitValue;
    natureData.net += netValue;
    natureData.count += 1;

    // Agrupar por operação
    const operacao = record.tipooperacao || (record as any)['Operação'] || (record as any)['Operacao'] || (record as any)['operação'] || 'Não informado';
    if (!byOperacao.has(operacao)) {
      byOperacao.set(operacao, { entries: 0, exits: 0, count: 0, net: 0 });
    }
    const operacaoData = byOperacao.get(operacao)!;
    operacaoData.entries += entryValue;
    operacaoData.exits += exitValue;
    operacaoData.net += netValue;
    operacaoData.count += 1;

    // Agrupar por fornecedor
    const supplier = record.fornecedor || 'Não informado';
    const cpfCnpj = record.cpfCnpj || '';
    if (!bySupplier.has(supplier)) {
      bySupplier.set(supplier, { entries: 0, exits: 0, count: 0, cpfCnpj, net: 0 });
    }
    const supplierData = bySupplier.get(supplier)!;
    supplierData.entries += entryValue;
    supplierData.exits += exitValue;
    supplierData.net += netValue;
    supplierData.count += 1;

    // Agrupar por tipo de documento
    const docType = record.tipodocumento || 'Não informado';
    if (!byDocumentType.has(docType)) {
      byDocumentType.set(docType, { entries: 0, exits: 0, count: 0, net: 0 });
    }
    const docTypeData = byDocumentType.get(docType)!;
    docTypeData.entries += entryValue;
    docTypeData.exits += exitValue;
    docTypeData.net += netValue;
    docTypeData.count += 1;
  });

  // Converter Maps para arrays e ordenar
  const byCompanyArray = Array.from(byCompany.entries())
    .map(([company, data]) => ({
      company,
      totalEntries: data.entries,
      totalExits: data.exits,
      netValue: data.net, // Usar valor líquido da coluna VALORTOTAL
      recordCount: data.count
    }))
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));

  const byCostCenterArray = Array.from(byCostCenter.entries())
    .map(([costCenter, data]) => ({
      costCenter,
      totalEntries: data.entries,
      totalExits: data.exits,
      netValue: data.net, // Usar valor líquido da coluna VALORTOTAL
      recordCount: data.count
    }))
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));

  const byNatureArray = Array.from(byNature.entries())
    .map(([nature, data]) => ({
      nature,
      totalEntries: data.entries,
      totalExits: data.exits,
      netValue: data.net, // Usar valor líquido da coluna VALORTOTAL
      recordCount: data.count
    }))
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));

  const byOperacaoArray = Array.from(byOperacao.entries())
    .map(([operacao, data]) => ({
      operacao,
      totalEntries: data.entries,
      totalExits: data.exits,
      netValue: data.net,
      recordCount: data.count
    }))
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));

  const bySupplierArray = Array.from(bySupplier.entries())
    .map(([supplier, data]) => ({
      supplier,
      cpfCnpj: data.cpfCnpj,
      totalEntries: data.entries,
      totalExits: data.exits,
      netValue: data.net, // Usar valor líquido da coluna VALORTOTAL
      recordCount: data.count
    }));

  // Top fornecedores por valor total (soma de entradas + saídas, não líquido)
  const topSuppliers = bySupplierArray
    .map(s => ({
      supplier: s.supplier,
      cpfCnpj: s.cpfCnpj,
      totalEntries: s.totalEntries,
      totalExits: s.totalExits,
      netValue: s.totalEntries - s.totalExits, // Diferença: Entrada - Saída
      recordCount: s.recordCount
    }))
    .sort((a, b) => (b.totalEntries + b.totalExits) - (a.totalEntries + a.totalExits))
    .slice(0, 10); // Top 10

  const byDocumentTypeArray = Array.from(byDocumentType.entries())
    .map(([documentType, data]) => ({
      documentType,
      totalEntries: data.entries,
      totalExits: data.exits,
      netValue: data.net, // Usar valor líquido da coluna VALORTOTAL
      recordCount: data.count
    }))
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));

  // Calcular valor líquido total somando todos os valores da coluna VALORTOTAL
  let totalNetValue = 0;
  records.forEach(record => {
    totalNetValue += parseValue(record.valortotal);
  });

  // Log dos totais calculados
  console.log('=== RESUMO DOS CÁLCULOS ===');
  console.log('Total de registros processados:', records.length);
  console.log('Total de Entradas (soma da coluna ENTRADA):', totalEntries);
  console.log('Total de Saídas (soma da coluna SAÍDA):', totalExits);
  console.log('Total Líquido (soma da coluna VALORTOTAL):', totalNetValue);
  
  // Verificar se há registros com valores
  const recordsWithEntries = records.filter(r => parseValue(r.entrada) > 0).length;
  const recordsWithExits = records.filter(r => parseValue(r.saida) > 0).length;
  console.log('Registros com entrada > 0:', recordsWithEntries);
  console.log('Registros com saída > 0:', recordsWithExits);
  console.log('==========================');

  // Helper: encontra valor em coluna por nome normalizado (busca flexível)
  const findValueByColumnPattern = (r: Record<string, any>, patterns: string[]): string => {
    for (const p of patterns) {
      const normP = p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
      for (const k of Object.keys(r)) {
        const normK = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
        if (normK.includes(normP) || normP.includes(normK)) {
          const v = r[k];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
      }
    }
    return '';
  };

  // Preparar registros brutos para retorno (campos mapeados + colunas originais da planilha)
  const rawRecords = records.map(record => {
    const r = record as any;
    const tipoOperacao = r.tipooperacao || r['Operação'] || r['Operacao'] || findValueByColumnPattern(r, ['operacao', 'operação']) || '';
    // SOMENTE coluna "Natureza Orçamentária Financeira" - padrão restrito para não pegar Descrição/Histórico
    const natureza = (r.natureza ?? '').toString().trim() || findValueByColumnPattern(r, ['naturezaorcamentariafinanceira', 'natureza orcamentaria financeira']) || '';
    const naturezaNome = ((r as any).naturezaNome ?? '').toString().trim() || findValueByColumnPattern(r, ['descricaonatureza', 'nomenatureza', 'descricao natureza']) || '';
    const codcxa = ((r.codcxa ?? '').toString().trim() || (r.coligada ?? '').toString().trim() || findValueByColumnPattern(r, ['contacaixa', 'conta/caixa', 'conta caixa', 'codcxa', 'coligada'])) || '';
    const base: Record<string, any> = {
      coligada: r.coligada ?? '',
      codcxa: codcxa || (r.codcxa ?? ''),
      numerodocumento: r.numerodocumento ?? '',
      segundonumero: r.segundonumero ?? '',
      descricao: r.descricao ?? '',
      datacriacao: r.datacriacao ? (r.datacriacao instanceof Date ? r.datacriacao.toISOString() : String(r.datacriacao)) : '',
      datacompensacao: r.datacompensacao ? (r.datacompensacao instanceof Date ? r.datacompensacao.toISOString() : String(r.datacompensacao)) : '',
      dataemissao: r.dataemissao ? (r.dataemissao instanceof Date ? r.dataemissao.toISOString() : String(r.dataemissao)) : '',
      historico: r.historico ?? '',
      ccusto: r.ccusto ?? '',
      natureza,
      naturezaNome,
      fornecedor: r.fornecedor ?? '',
      cpfCnpj: r.cpfCnpj ?? '',
      saida: r.saida ?? 0,
      entrada: r.entrada ?? 0,
      tipooperacao: tipoOperacao,
      valortotal: r.valortotal ?? 0,
      tipodocumento: r.tipodocumento ?? ''
    };
    Object.keys(r).forEach(k => { if (!(k in base)) base[k] = r[k]; });
    return base;
  });

  return {
    summary: {
      totalRecords: records.length,
      totalEntries,
      totalExits,
      netValue: totalNetValue, // Soma dos valores da coluna VALORTOTAL
      periodRange: {
        start: minDate ? (minDate as Date).toISOString() : '',
        end: maxDate ? (maxDate as Date).toISOString() : ''
      }
    },
    byCompany: byCompanyArray,
    byCostCenter: byCostCenterArray,
    byNature: byNatureArray,
    byOperacao: byOperacaoArray,
    bySupplier: bySupplierArray,
    topSuppliers,
    byDocumentType: byDocumentTypeArray,
    rawRecords // Registros brutos para detalhamento
  };
}
