import moment from 'moment';
import { PayrollService, PayrollFilters } from './PayrollService';
import { BorderService } from './BorderService';
import { PayrollStatusService } from './PayrollStatusService';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const payrollService = new PayrollService();
const borderService = new BorderService();
const payrollStatusService = new PayrollStatusService();

export class CnabService {
  /**
   * Gera arquivo CNAB400 para remessa de pagamentos ao Banco Itaú
   * Formato conforme padrão FEBRABAN
   */
  async generateCnab400(filters: PayrollFilters): Promise<string> {
    // Verificar se a folha está finalizada
    const isFinalized = await payrollStatusService.isPayrollFinalized(filters.month, filters.year);
    if (!isFinalized) {
      throw createError('A folha de pagamento ainda não foi finalizada pelo Departamento Pessoal', 403);
    }

    const borderData = await borderService.generateBorderData(filters);
    
    // Buscar configurações da empresa
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: 'default' }
    });

    if (!companySettings) {
      throw new Error('Configurações da empresa não encontradas');
    }

    const lines: string[] = [];
    
    // Header (Registro 0)
    const header = this.generateHeader(companySettings, filters);
    lines.push(header);

    // Transações (Registro 1) - Uma linha por funcionário
    let sequencial = 2; // Começa em 2 (após header)
    borderData.forEach((item) => {
      if (item.amount > 0 && item.bank && item.account) {
        const transaction = this.generateTransaction(item, sequencial, filters);
        lines.push(transaction);
        sequencial++;
      }
    });

    // Trailer (Registro 9)
    const trailer = this.generateTrailer(borderData.length, sequencial, borderData);
    lines.push(trailer);

    return lines.join('\r\n');
  }

  /**
   * Gera registro Header (Tipo 0)
   */
  private generateHeader(companySettings: any, filters: PayrollFilters): string {
    const cnpj = companySettings.cnpj.replace(/[^\d]/g, ''); // Remove formatação
    const dataGeracao = moment().format('DDMMYY');
    const horaGeracao = moment().format('HHmm');
    
    // Código do banco Itaú: 341
    const codigoBanco = '341';
    
    // Tipo de registro: 0 (Header)
    const tipoRegistro = '0';
    
    // Tipo de operação: 1 (Remessa)
    const tipoOperacao = '1';
    
    // Tipo de serviço: 01 (Cobrança) - Para pagamentos usar 20 (Débito Automático)
    const tipoServico = '20';
    
    // Forma de lançamento: 01 (Crédito em Conta Corrente)
    const formaLancamento = '01';
    
    // Número sequencial do arquivo (gerar baseado em timestamp)
    const numeroSequencial = moment().format('YYYYMMDDHHmmss').substring(0, 6);
    
    // Nome da empresa (30 caracteres, alinhado à esquerda, preenchido com espaços)
    const nomeEmpresa = this.padRight(companySettings.name.substring(0, 30), 30);
    
    // Código do banco na compensação: 341 (Itaú)
    const codigoCompensacao = '341';
    
    // Nome do banco: ITAU
    const nomeBanco = this.padRight('ITAU', 15);
    
    // Data de gravação: DDMMAA
    const dataGravacao = moment().format('DDMMYY');
    
    // Densidade de gravação: 01600
    const densidade = '01600';
    
    // Unidade de densidade: 0
    const unidadeDensidade = '0';
    
    // Número sequencial do arquivo (6 dígitos)
    const numSequencialArquivo = this.padLeft(numeroSequencial, 6);
    
    // Data de crédito: DDMMAA (data do pagamento)
    const dataCredito = moment({ year: filters.year, month: filters.month - 1 }).endOf('month').format('DDMMYY');
    
    // Reserva (brancos)
    const reserva = this.padRight('', 275);
    
    // Montar linha (400 caracteres)
    const line = 
      tipoRegistro +
      tipoOperacao +
      tipoServico +
      this.padRight('', 2) + // Reserva
      codigoBanco +
      this.padRight('', 1) + // Reserva
      cnpj.substring(0, 14) +
      this.padRight('', 20) + // Reserva
      formaLancamento +
      this.padRight('', 5) + // Reserva
      nomeEmpresa +
      codigoCompensacao +
      nomeBanco +
      dataGravacao +
      densidade +
      unidadeDensidade +
      numSequencialArquivo +
      dataCredito +
      reserva;
    
    return this.padRight(line, 400);
  }

  /**
   * Gera registro de Transação (Tipo 1)
   */
  private generateTransaction(item: any, sequencial: number, filters: PayrollFilters): string {
    // Tipo de registro: 1 (Transação)
    const tipoRegistro = '1';
    
    // Tipo de operação: C (Crédito)
    const tipoOperacao = 'C';
    
    // Tipo de serviço: 20 (Débito Automático/Pagamento)
    const tipoServico = '20';
    
    // Forma de lançamento: 01 (Crédito em Conta Corrente)
    const formaLancamento = '01';
    
    // Código do banco: 341 (Itaú)
    const codigoBanco = '341';
    
    // Agência (sem dígito, 4 dígitos)
    const agencia = this.padLeft((item.agency || '').replace(/[^\d]/g, '').substring(0, 4), 4);
    
    // Dígito da agência (1 dígito) - se não tiver, usar 0
    const digitoAgencia = (item.agency || '').replace(/[^\d]/g, '').substring(4, 5) || '0';
    
    // Conta (sem dígito, 5 dígitos)
    const conta = this.padLeft((item.account || '').replace(/[^\d]/g, '').substring(0, 5), 5);
    
    // Dígito da conta (1 dígito)
    const digitoConta = (item.digit || item.account?.replace(/[^\d]/g, '').substring(5, 6) || '0').substring(0, 1);
    
    // CPF/CNPJ do favorecido (14 dígitos)
    const cpfCnpj = this.padLeft(item.cpf.replace(/[^\d]/g, '').substring(0, 14), 14);
    
    // Nome do favorecido (30 caracteres)
    const nomeFavorecido = this.padRight(item.name.substring(0, 30), 30);
    
    // Data de pagamento: DDMMAA
    const dataPagamento = moment({ year: filters.year, month: filters.month - 1 }).endOf('month').format('DDMMYY');
    
    // Tipo de moeda: 00 (Real)
    const tipoMoeda = '00';
    
    // Quantidade de moeda: 0000000000000
    const quantidadeMoeda = '0000000000000';
    
    // Valor do pagamento (13 dígitos, 2 decimais)
    const valorPagamento = this.padLeft(Math.round(item.amount * 100).toString(), 13);
    
    // Nosso número: brancos (17 caracteres)
    const nossoNumero = this.padRight('', 17);
    
    // Data real: DDMMAA (mesma do pagamento)
    const dataReal = dataPagamento;
    
    // Valor real: mesmo valor do pagamento (13 dígitos)
    const valorReal = valorPagamento;
    
    // Finalidade: 01 (Crédito em Conta)
    const finalidade = '01';
    
    // Forma de pagamento: 01 (Crédito em Conta Corrente)
    const formaPagamento = '01';
    
    // Número do documento (10 caracteres)
    const numeroDocumento = this.padRight(`PAG${sequencial.toString().padStart(7, '0')}`, 10);
    
    // Aviso ao favorecido: 0 (Sem aviso)
    const aviso = '0';
    
    // Ocorrências: brancos (10 caracteres)
    const ocorrencias = this.padRight('', 10);
    
    // Reserva (brancos)
    const reserva = this.padRight('', 174);
    
    // Montar linha (400 caracteres)
    const line =
      tipoRegistro +
      tipoOperacao +
      tipoServico +
      this.padRight('', 2) + // Reserva
      codigoBanco +
      this.padRight('', 1) + // Reserva
      agencia +
      digitoAgencia +
      conta +
      digitoConta +
      cpfCnpj +
      nomeFavorecido +
      dataPagamento +
      tipoMoeda +
      quantidadeMoeda +
      valorPagamento +
      nossoNumero +
      dataReal +
      valorReal +
      finalidade +
      formaPagamento +
      numeroDocumento +
      aviso +
      ocorrencias +
      reserva;
    
    return this.padRight(line, 400);
  }

  /**
   * Gera registro Trailer (Tipo 9)
   */
  private generateTrailer(totalRegistros: number, sequencial: number, borderData: any[]): string {
    // Tipo de registro: 9 (Trailer)
    const tipoRegistro = '9';
    
    // Tipo de operação: 1 (Remessa)
    const tipoOperacao = '1';
    
    // Tipo de serviço: 20 (Débito Automático/Pagamento)
    const tipoServico = '20';
    
    // Código do banco: 341 (Itaú)
    const codigoBanco = '341';
    
    // Quantidade de registros (6 dígitos) - total de linhas incluindo header e trailer
    const quantidadeRegistros = this.padLeft(sequencial.toString(), 6);
    
    // Valor total (13 dígitos, 2 decimais)
    const valorTotal = borderData.reduce((sum, item) => sum + (item.amount || 0), 0);
    const valorTotalFormatado = this.padLeft(Math.round(valorTotal * 100).toString(), 13);
    
    // Reserva (brancos)
    const reserva = this.padRight('', 365);
    
    // Montar linha (400 caracteres)
    const line =
      tipoRegistro +
      tipoOperacao +
      tipoServico +
      this.padRight('', 2) + // Reserva
      codigoBanco +
      this.padRight('', 1) + // Reserva
      quantidadeRegistros +
      valorTotalFormatado +
      reserva;
    
    return this.padRight(line, 400);
  }

  /**
   * Preenche string à direita com espaços
   */
  private padRight(str: string, length: number): string {
    return (str || '').substring(0, length).padEnd(length, ' ');
  }

  /**
   * Preenche string à esquerda com zeros
   */
  private padLeft(str: string, length: number): string {
    return (str || '').substring(0, length).padStart(length, '0');
  }
}
