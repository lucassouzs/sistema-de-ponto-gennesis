// @ts-ignore - pdfkit types may not be fully compatible
import PDFDocument from 'pdfkit';
import moment from 'moment';
import { PayrollService, PayrollFilters } from './PayrollService';
import { PayrollStatusService } from './PayrollStatusService';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';

const payrollService = new PayrollService();
const payrollStatusService = new PayrollStatusService();

export interface BorderData {
  date: string;
  name: string;
  amount: number;
  bank: string | null;
  accountType: string | null;
  agency: string | null;
  operation: string | null;
  account: string | null;
  digit: string | null;
  pixKeyType: string | null;
  pixKey: string | null;
  cpf: string;
}

export class BorderService {
  /**
   * Gera dados do borderô de pagamento
   */
  async generateBorderData(filters: PayrollFilters): Promise<BorderData[]> {
    // Verificar se a folha está finalizada
    const isFinalized = await payrollStatusService.isPayrollFinalized(filters.month, filters.year);
    if (!isFinalized) {
      throw createError('A folha de pagamento ainda não foi finalizada pelo Departamento Pessoal', 403);
    }

    const payrollData = await payrollService.generateMonthlyPayroll(filters);
    
    const borderData: BorderData[] = payrollData.employees.map(employee => {
      // Calcular valor líquido a ser pago (mesma lógica do frontend)
      // Proventos: salário base + salário família + insalubridade + periculosidade + horas extras + DSR HE + VT
      const salarioBase = employee.salary || 0;
      const salarioFamilia = employee.familySalary || 0;
      const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
      const periculosidade = employee.dangerPay ? (salarioBase * (employee.dangerPay / 100)) : 0;
      
      // Horas extras: usar valor manual se disponível, senão calcular
      const valorHorasExtras = employee.horasExtrasValue !== undefined && employee.horasExtrasValue !== null
        ? employee.horasExtrasValue
        : (employee.he50Value || 0) + (employee.he100Value || 0);
      
      // DSR HE: usar valor manual se disponível (multiplicado pela taxa horária), senão calcular
      // Se dsrHEValue for fornecido, ele é em horas, então multiplica pela taxa horária
      const valorDSRHE = employee.dsrHEValue !== undefined && employee.dsrHEValue !== null
        ? (employee.dsrHEValue * (employee.hourlyRate || 0))
        : (employee.totalWorkingDays > 0 && employee.daysWorked > 0
          ? (valorHorasExtras / employee.totalWorkingDays) * (employee.totalWorkingDays - employee.daysWorked)
          : 0);
      
      const totalVT = employee.totalTransportVoucher || 0;
      
      const totalProventos = salarioBase + salarioFamilia + insalubridade + periculosidade + valorHorasExtras + valorDSRHE + totalVT;
      
      // Descontos: descontos manuais + desconto por faltas + DSR por falta + VA + VT + INSS + IRRF
      const descontoPorFaltas = employee.descontoPorFaltas || 0;
      const dsrPorFalta = employee.dsrPorFalta || 0;
      const percentualVA = employee.totalFoodVoucher || 0; // VA já vem como valor total
      const percentualVT = 0; // VT já está nos proventos
      const inssMensal = employee.inssTotal || 0;
      const irrfMensal = employee.irrfMensal || 0;
      
      const totalDescontos = (employee.totalDiscounts || 0) + descontoPorFaltas + dsrPorFalta + percentualVA + percentualVT + inssMensal + irrfMensal;
      
      // Líquido = Proventos - Descontos + Ajustes
      const liquidoReceber = totalProventos - totalDescontos;
      const totalAmount = liquidoReceber + (employee.totalAdjustments || 0);

      return {
        date: moment().format('DD/MM/YYYY'),
        name: employee.name,
        amount: totalAmount,
        bank: employee.bank,
        accountType: employee.accountType,
        agency: employee.agency,
        operation: employee.operation,
        account: employee.account,
        digit: employee.digit,
        pixKeyType: employee.pixKeyType,
        pixKey: employee.pixKey,
        cpf: employee.cpf
      };
    });

    return borderData;
  }

  /**
   * Gera PDF do borderô de pagamento
   */
  async generateBorderPDF(filters: PayrollFilters): Promise<Buffer> {
    const borderData = await this.generateBorderData(filters);
    
    // Buscar configurações da empresa antes de criar o PDF
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: 'default' }
    });
    
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Cabeçalho
        doc.fontSize(18).font('Helvetica-Bold')
          .text('BORDERÔ DE PAGAMENTO', { align: 'center' });
        
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica')
          .text(`Período: ${moment({ year: filters.year, month: filters.month - 1 }).format('MM/YYYY')}`, { align: 'center' });
        
        if (filters.company) {
          doc.text(`Empresa: ${filters.company}`, { align: 'center' });
        }
        if (filters.costCenter) {
          doc.text(`Centro de Custo: ${filters.costCenter}`, { align: 'center' });
        }

        doc.moveDown(1);

        // Informações da empresa
        if (companySettings) {
          doc.fontSize(10).font('Helvetica')
            .text(`Empresa: ${companySettings.name}`, { align: 'left' })
            .text(`CNPJ: ${companySettings.cnpj}`, { align: 'left' })
            .text(`Endereço: ${companySettings.address}`, { align: 'left' });
          doc.moveDown(0.5);
        }

        // Data de emissão
        doc.fontSize(10).font('Helvetica')
          .text(`Data de Emissão: ${moment().format('DD/MM/YYYY HH:mm')}`, { align: 'right' });
        
        doc.moveDown(1);

        // Tabela
        const tableTop = doc.y;
        const itemHeight = 25;
        const pageHeight = 750;
        let currentY = tableTop;

        // Cabeçalho da tabela
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Data', 50, currentY, { width: 60, align: 'left' });
        doc.text('Nome', 120, currentY, { width: 150, align: 'left' });
        doc.text('Valor (R$)', 280, currentY, { width: 80, align: 'right' });
        doc.text('Banco', 370, currentY, { width: 80, align: 'left' });
        doc.text('Agência', 460, currentY, { width: 60, align: 'left' });
        doc.text('Conta', 530, currentY, { width: 60, align: 'left' });

        // Linha separadora
        currentY += 15;
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
        currentY += 5;

        // Dados
        doc.fontSize(8).font('Helvetica');
        let totalAmount = 0;

        borderData.forEach((item, index) => {
          // Verificar se precisa de nova página
          if (currentY > pageHeight) {
            doc.addPage();
            currentY = 50;
            
            // Redesenhar cabeçalho
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Data', 50, currentY, { width: 60, align: 'left' });
            doc.text('Nome', 120, currentY, { width: 150, align: 'left' });
            doc.text('Valor (R$)', 280, currentY, { width: 80, align: 'right' });
            doc.text('Banco', 370, currentY, { width: 80, align: 'left' });
            doc.text('Agência', 460, currentY, { width: 60, align: 'left' });
            doc.text('Conta', 530, currentY, { width: 60, align: 'left' });
            currentY += 15;
            doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
            currentY += 5;
            doc.fontSize(8).font('Helvetica');
          }

          totalAmount += item.amount;

          // Dados bancários formatados
          const bankInfo = item.bank || '-';
          const agencyInfo = item.agency || '-';
          const accountInfo = item.account ? `${item.account}${item.digit ? '-' + item.digit : ''}` : '-';

          doc.text(item.date, 50, currentY, { width: 60, align: 'left' });
          doc.text(item.name.substring(0, 25), 120, currentY, { width: 150, align: 'left' });
          doc.text(item.amount.toFixed(2).replace('.', ','), 280, currentY, { width: 80, align: 'right' });
          doc.text(bankInfo.substring(0, 15), 370, currentY, { width: 80, align: 'left' });
          doc.text(agencyInfo.substring(0, 10), 460, currentY, { width: 60, align: 'left' });
          doc.text(accountInfo.substring(0, 15), 530, currentY, { width: 60, align: 'left' });

          currentY += itemHeight;
        });

        // Total
        currentY += 10;
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
        currentY += 10;
        
        doc.fontSize(10).font('Helvetica-Bold')
          .text(`TOTAL: R$ ${totalAmount.toFixed(2).replace('.', ',')}`, 280, currentY, { width: 270, align: 'right' });

        // Página adicional com dados bancários detalhados
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold')
          .text('DADOS BANCÁRIOS DETALHADOS', { align: 'center' });
        doc.moveDown(1);

        currentY = 100;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Nome', 50, currentY, { width: 150, align: 'left' });
        doc.text('CPF', 210, currentY, { width: 100, align: 'left' });
        doc.text('Banco', 320, currentY, { width: 80, align: 'left' });
        doc.text('Tipo Conta', 410, currentY, { width: 80, align: 'left' });
        doc.text('Agência', 500, currentY, { width: 50, align: 'left' });

        currentY += 15;
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
        currentY += 5;

        doc.fontSize(8).font('Helvetica');
        borderData.forEach((item) => {
          if (currentY > pageHeight) {
            doc.addPage();
            currentY = 50;
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Nome', 50, currentY, { width: 150, align: 'left' });
            doc.text('CPF', 210, currentY, { width: 100, align: 'left' });
            doc.text('Banco', 320, currentY, { width: 80, align: 'left' });
            doc.text('Tipo Conta', 410, currentY, { width: 80, align: 'left' });
            doc.text('Agência', 500, currentY, { width: 50, align: 'left' });
            currentY += 15;
            doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
            currentY += 5;
            doc.fontSize(8).font('Helvetica');
          }

          doc.text(item.name.substring(0, 20), 50, currentY, { width: 150, align: 'left' });
          doc.text(item.cpf, 210, currentY, { width: 100, align: 'left' });
          doc.text((item.bank || '-').substring(0, 12), 320, currentY, { width: 80, align: 'left' });
          doc.text((item.accountType || '-').substring(0, 12), 410, currentY, { width: 80, align: 'left' });
          doc.text((item.agency || '-').substring(0, 10), 500, currentY, { width: 50, align: 'left' });

          currentY += 20;
        });

        // Página com dados PIX
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold')
          .text('DADOS PIX', { align: 'center' });
        doc.moveDown(1);

        currentY = 100;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Nome', 50, currentY, { width: 150, align: 'left' });
        doc.text('CPF', 210, currentY, { width: 100, align: 'left' });
        doc.text('Tipo Chave', 320, currentY, { width: 100, align: 'left' });
        doc.text('Chave PIX', 430, currentY, { width: 120, align: 'left' });

        currentY += 15;
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
        currentY += 5;

        doc.fontSize(8).font('Helvetica');
        borderData.forEach((item) => {
          if (currentY > pageHeight) {
            doc.addPage();
            currentY = 50;
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Nome', 50, currentY, { width: 150, align: 'left' });
            doc.text('CPF', 210, currentY, { width: 100, align: 'left' });
            doc.text('Tipo Chave', 320, currentY, { width: 100, align: 'left' });
            doc.text('Chave PIX', 430, currentY, { width: 120, align: 'left' });
            currentY += 15;
            doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
            currentY += 5;
            doc.fontSize(8).font('Helvetica');
          }

          if (item.pixKey) {
            doc.text(item.name.substring(0, 20), 50, currentY, { width: 150, align: 'left' });
            doc.text(item.cpf, 210, currentY, { width: 100, align: 'left' });
            doc.text((item.pixKeyType || '-').substring(0, 15), 320, currentY, { width: 100, align: 'left' });
            doc.text((item.pixKey || '-').substring(0, 30), 430, currentY, { width: 120, align: 'left' });
            currentY += 20;
          }
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Gera arquivo CNAB400 (formato Itaú) para transferências bancárias (folha)
   */
  async generateCNAB400(filters: PayrollFilters): Promise<string> {
    const borderData = await this.generateBorderData(filters);
    const paymentDate = moment({ year: filters.year, month: filters.month - 1 }).endOf('month');
    return this.buildCnab400RemessaContent(borderData, paymentDate);
  }

  /**
   * Mesmo layout CNAB400 do borderô (financeiro), para favorecidos arbitrários (ex.: OCs).
   */
  async generateCNAB400FromBorderData(borderData: BorderData[]): Promise<string> {
    return this.buildCnab400RemessaContent(borderData, moment().add(1, 'day'));
  }

  private async buildCnab400RemessaContent(
    borderData: BorderData[],
    paymentDate: moment.Moment
  ): Promise<string> {
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: 'default' }
    });

    if (!companySettings) {
      throw createError('Configurações da empresa não encontradas', 404);
    }

    const lines: string[] = [];
    const currentDate = moment();
    
    // Formatar valores para CNAB400 - garantir tamanho exato
    const formatNumber = (value: number, length: number, decimals: number = 2): string => {
      const intValue = Math.round(value * Math.pow(10, decimals));
      const str = intValue.toString();
      // Garantir tamanho exato: truncar se maior, preencher com zeros se menor
      return str.substring(0, length).padStart(length, '0');
    };

    const formatText = (text: string, length: number): string => {
      const str = (text || '').substring(0, length);
      // Garantir tamanho exato: truncar se maior, preencher com espaços se menor
      return str.padEnd(length, ' ');
    };

    const formatDate = (date: moment.Moment): string => {
      const str = date.format('DDMMYY');
      // Garantir tamanho exato (6 caracteres)
      return str.substring(0, 6).padStart(6, '0');
    };

    // Remover caracteres especiais do CPF/CNPJ
    const cleanDocument = (doc: string): string => {
      return (doc || '').replace(/[^0-9]/g, '');
    };

    // Função para garantir que um campo numérico tenha tamanho exato
    const padNumber = (value: string | number, length: number): string => {
      const str = value.toString().replace(/[^0-9]/g, '');
      return str.substring(0, length).padStart(length, '0');
    };

    // Header do arquivo (Registro 0) - 400 caracteres
    const cnpj = cleanDocument(companySettings.cnpj || '');
    const headerParts: string[] = [];
    
    headerParts.push('0'.substring(0, 1).padStart(1, '0')); // 001-001: Tipo de registro (1)
    headerParts.push('1'.substring(0, 1).padStart(1, '0')); // 002-002: Operação (1 = Remessa) (1)
    headerParts.push(formatText('REMESSA', 7)); // 003-009: Literal remessa (7)
    headerParts.push('01'.substring(0, 2).padStart(2, '0')); // 010-011: Código do serviço (2)
    headerParts.push(formatText(companySettings.name || 'EMPRESA', 15)); // 012-026: Nome da empresa (15)
    headerParts.push('341'.substring(0, 3).padStart(3, '0')); // 027-029: Código do banco Itaú (3)
    headerParts.push(formatText('ITAU', 15)); // 030-044: Nome do banco (15)
    headerParts.push(formatDate(currentDate)); // 045-050: Data de geração (6)
    headerParts.push(formatText('', 1)); // 051-051: Branco (1)
    headerParts.push(formatText('', 8)); // 052-059: Identificação da empresa (8)
    headerParts.push(padNumber(cnpj, 14)); // 060-073: CNPJ da empresa (14)
    headerParts.push(formatText('', 20)); // 074-093: Branco (20)
    headerParts.push(padNumber('0001', 4)); // 094-097: Agência (4)
    headerParts.push(padNumber('00', 2)); // 098-099: Dígito da agência (2)
    headerParts.push(formatText('', 5)); // 100-104: Conta (5)
    headerParts.push(formatText('', 1)); // 105-105: Dígito da conta (1)
    headerParts.push(formatText('', 8)); // 106-113: Branco (8)
    headerParts.push(formatText('', 7)); // 114-120: Branco (7)
    headerParts.push(padNumber('1', 6)); // 121-126: Número sequencial (6)
    headerParts.push(formatText('', 274)); // 127-400: Branco (274) - completar até 400
    
    const header = headerParts.join('');
    // Garantir que o header tenha exatamente 400 caracteres
    if (header.length !== 400) {
      throw new Error(`Header deve ter 400 caracteres, mas tem ${header.length}. Partes: ${headerParts.map((p, i) => `${i}:${p.length}`).join(', ')}`);
    }
    lines.push(header);

    // Detalhes (Registro 1) - um para cada pagamento
    let sequence = 2;
    borderData.forEach((item, index) => {
      if (!item.bank || !item.agency || !item.account) {
        return; // Pular funcionários sem dados bancários completos
      }

      const cpf = cleanDocument(item.cpf);
      const amount = formatNumber(item.amount, 13, 2);
      // Dados bancários do favorecido
      const agency = padNumber(item.agency || '', 5);
      const account = padNumber(item.account || '', 12);
      const accountDigit = (item.digit || '0').substring(0, 1);
      const name = item.name.toUpperCase();

      // Detalhe (Registro 1) - 400 caracteres
      // Construir campo por campo garantindo tamanho exato
      const detailParts: string[] = [];
      
      detailParts.push('1'.substring(0, 1)); // 001-001: Tipo de registro (1)
      detailParts.push(formatText('', 16)); // 002-017: Branco (16)
      detailParts.push(padNumber('000', 3)); // 018-020: Agência debitada (3)
      detailParts.push(padNumber('00', 2)); // 021-022: Dígito da agência debitada (2)
      detailParts.push(formatText('', 5)); // 023-027: Conta debitada (5)
      detailParts.push(formatText('', 1)); // 028-028: Dígito da conta debitada (1)
      detailParts.push(formatText('', 5)); // 029-033: Branco (5)
      detailParts.push(padNumber('000', 3)); // 034-036: Carteira (3)
      detailParts.push(padNumber('000', 3)); // 037-039: Agência/Código do cedente (3)
      detailParts.push(formatText('', 5)); // 040-044: Conta corrente (5)
      detailParts.push(formatText('', 1)); // 045-045: Dígito da conta (1)
      detailParts.push(padNumber('0', 20)); // 046-065: Nosso número (20)
      detailParts.push(formatDate(paymentDate)); // 066-071: Data de vencimento (6)
      detailParts.push(amount); // 072-084: Valor do título (13)
      detailParts.push('341'.substring(0, 3).padStart(3, '0')); // 085-087: Código do banco Itaú (3)
      // 088-092: Agência depositária - usar agência do favorecido (5 dígitos)
      detailParts.push(agency.substring(0, 5).padStart(5, '0')); // 088-092: Agência depositária (5)
      detailParts.push('01'.substring(0, 2).padStart(2, '0')); // 093-094: Espécie (2)
      detailParts.push('N'.substring(0, 1)); // 095-095: Aceite (1)
      detailParts.push(formatDate(paymentDate)); // 096-101: Data de emissão (6)
      detailParts.push('06'.substring(0, 2).padStart(2, '0')); // 102-103: Instrução 1 (2)
      detailParts.push('00'.substring(0, 2).padStart(2, '0')); // 104-105: Instrução 2 (2)
      detailParts.push(formatNumber(0, 13, 2)); // 106-118: Valor a ser cobrado por dia de atraso (13)
      detailParts.push(formatDate(paymentDate)); // 119-124: Data limite para desconto (6)
      detailParts.push(formatNumber(0, 13, 2)); // 125-137: Valor do desconto (13)
      detailParts.push(formatNumber(0, 13, 2)); // 138-150: Valor do IOF (13)
      detailParts.push(formatNumber(0, 13, 2)); // 151-163: Valor do abatimento (13)
      detailParts.push(padNumber(cpf, 14)); // 164-177: CPF/CNPJ do pagador (14)
      detailParts.push(formatText(name, 40)); // 178-217: Nome do pagador (40)
      // 218-232: Conta do favorecido (15 caracteres)
      detailParts.push(account.substring(0, 15).padStart(15, '0')); // 218-232: Conta do favorecido (15)
      // 233-233: Dígito da conta do favorecido (1)
      detailParts.push(accountDigit.substring(0, 1).padStart(1, '0')); // 233-233: Dígito da conta (1)
      detailParts.push(formatText('', 24)); // 234-257: Branco (24) - ajustado após conta e dígito
      detailParts.push(formatText('', 12)); // 258-269: Bairro do pagador (12)
      detailParts.push(padNumber('00000000', 8)); // 270-277: CEP (8)
      detailParts.push(formatText('', 15)); // 278-292: Cidade do pagador (15)
      detailParts.push(formatText('', 2)); // 293-294: UF do pagador (2)
      detailParts.push(formatText('', 40)); // 295-334: Observações (40)
      detailParts.push(padNumber('00000000', 8)); // 335-342: Número de dias para protesto (8)
      detailParts.push(formatText('', 1)); // 343-343: Branco (1)
      detailParts.push(padNumber(sequence.toString(), 6)); // 344-349: Número sequencial (6)
      detailParts.push(formatText('', 51)); // 350-400: Branco (51) - completar até 400

      const detail = detailParts.join('');
      // Garantir que o detalhe tenha exatamente 400 caracteres
      if (detail.length !== 400) {
        throw new Error(`Detalhe deve ter 400 caracteres, mas tem ${detail.length}. Sequencial: ${sequence}, Partes: ${detailParts.map((p, i) => `${i}:${p.length}`).join(', ')}`);
      }
      lines.push(detail);
      sequence++;
    });

    if (lines.length < 2) {
      throw createError(
        'Nenhum pagamento com dados bancários completos (banco, agência e conta) para gerar o arquivo.',
        400
      );
    }

    // Trailer do arquivo (Registro 9) - 400 caracteres
    const totalRecords = lines.length + 1; // +1 para incluir o trailer

    const trailerParts: string[] = [];
    trailerParts.push('9'.substring(0, 1)); // 001-001: Tipo de registro (1)
    trailerParts.push(formatText('', 393)); // 002-394: Branco (393)
    trailerParts.push(padNumber(totalRecords.toString(), 6)); // 395-400: Total de registros (6)

    const trailer = trailerParts.join('');
    // Garantir que o trailer tenha exatamente 400 caracteres
    if (trailer.length !== 400) {
      throw new Error(`Trailer deve ter 400 caracteres, mas tem ${trailer.length}`);
    }
    lines.push(trailer);

    return lines.join('\r\n');
  }
}
