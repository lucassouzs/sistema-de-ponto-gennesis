import moment from 'moment';
import { PayrollService, PayrollFilters } from './PayrollService';
import { BorderService, BorderData } from './BorderService';
import { prisma } from '../lib/prisma';

const payrollService = new PayrollService();
const borderService = new BorderService();

export interface Cnab400Config {
  empresaCodigo: string; // Código da empresa no banco (fornecido pelo Itaú)
  empresaNome: string;
  empresaCnpj: string;
  empresaAgencia: string;
  empresaConta: string;
  empresaDigito: string;
  sequencialRemessa: string; // Sequencial da remessa (incrementar a cada envio)
}

export class Cnab400Service {
  /**
   * Gera arquivo CNAB400 para remessa de pagamentos - Banco Itaú
   * Formato FEBRABAN 400 posições
   */
  async generateCnab400File(filters: PayrollFilters, config: Cnab400Config): Promise<string> {
    const borderData = await borderService.generateBorderData(filters);
    
    // Filtrar apenas funcionários com dados bancários completos e banco Itaú
    const validPayments = borderData.filter(item => 
      item.bank === 'ITAÚ' || item.bank === 'ITAU' &&
      item.agency &&
      item.account &&
      item.digit &&
      item.amount > 0
    );

    if (validPayments.length === 0) {
      throw new Error('Nenhum pagamento válido encontrado para gerar CNAB400');
    }

    const lines: string[] = [];
    
    // Data de geração
    const dataGeracao = moment();
    const dataVencimento = moment().add(1, 'days'); // Vencimento para amanhã (ajustar conforme necessário)
    
    // REGISTRO 0 - HEADER
    const header = this.generateHeader(config, dataGeracao, validPayments.length);
    lines.push(header);
    
    // REGISTRO 1 - DETALHES (um para cada pagamento)
    validPayments.forEach((payment, index) => {
      const detalhe = this.generateDetalhe(
        config,
        payment,
        index + 1, // Número sequencial do registro
        dataVencimento
      );
      lines.push(detalhe);
    });
    
    // REGISTRO 9 - TRAILER
    const trailer = this.generateTrailer(config, validPayments.length, dataGeracao);
    lines.push(trailer);
    
    return lines.join('\r\n'); // CNAB usa \r\n como quebra de linha
  }

  /**
   * Gera registro HEADER (Registro 0) - 400 posições
   */
  private generateHeader(
    config: Cnab400Config,
    dataGeracao: moment.Moment,
    totalRegistros: number
  ): string {
    const campos: string[] = [];
    
    // 001-001: Tipo de Registro (0 = Header)
    campos.push('0');
    
    // 002-002: Tipo de Operação (1 = Remessa)
    campos.push('1');
    
    // 003-009: Identificação do Tipo de Operação
    campos.push(this.padRight('REMESSA', 7));
    
    // 010-011: Identificação do Tipo de Serviço
    campos.push('01'); // 01 = Cobrança/Pagamento
    
    // 012-026: Complemento do Registro (brancos)
    campos.push(this.padRight('', 15));
    
    // 027-046: Código da Empresa
    campos.push(this.padLeft(config.empresaCodigo, 20));
    
    // 047-076: Nome da Empresa
    campos.push(this.padRight(config.empresaNome.substring(0, 30), 30));
    
    // 077-079: Número do Banco (341 = Itaú)
    campos.push('341');
    
    // 080-094: Nome do Banco
    campos.push(this.padRight('BANCO ITAU SA', 15));
    
    // 095-100: Data de Gravação (DDMMAA)
    campos.push(dataGeracao.format('DDMMYY'));
    
    // 101-108: Identificação do Sistema (brancos ou código)
    campos.push(this.padRight('', 8));
    
    // 109-110: Número da Versão do Layout
    campos.push('01');
    
    // 111-117: Sequencial de Remessa
    campos.push(this.padLeft(config.sequencialRemessa, 7));
    
    // 118-394: Complemento do Registro (brancos)
    campos.push(this.padRight('', 277));
    
    // 395-400: Sequencial do Registro (000001)
    campos.push('000001');
    
    const linha = campos.join('');
    
    if (linha.length !== 400) {
      throw new Error(`Header deve ter 400 caracteres, mas tem ${linha.length}`);
    }
    
    return linha;
  }

  /**
   * Gera registro DETALHE (Registro 1) - 400 posições
   */
  private generateDetalhe(
    config: Cnab400Config,
    payment: BorderData,
    sequencial: number,
    dataVencimento: moment.Moment
  ): string {
    const campos: string[] = [];
    
    // 001-001: Tipo de Registro (1 = Detalhe)
    campos.push('1');
    
    // 002-006: Agência do Favorecido (sem dígito)
    const agencia = payment.agency?.replace(/[^0-9]/g, '').substring(0, 5) || '';
    campos.push(this.padLeft(agencia, 5));
    
    // 007-007: Dígito da Agência
    campos.push('0'); // Itaú geralmente não usa dígito de agência
    
    // 008-012: Conta Corrente do Favorecido
    const conta = payment.account?.replace(/[^0-9]/g, '').substring(0, 5) || '';
    campos.push(this.padLeft(conta, 5));
    
    // 013-013: Dígito da Conta
    campos.push(payment.digit?.substring(0, 1) || '0');
    
    // 014-014: Dígito Verificador da Agência/Conta (branco)
    campos.push(' ');
    
    // 015-037: Nome do Favorecido
    const nome = payment.name.substring(0, 23).toUpperCase();
    campos.push(this.padRight(nome, 23));
    
    // 038-062: Número do Documento (CPF ou identificação)
    const cpf = payment.cpf.replace(/[^0-9]/g, '').substring(0, 14);
    campos.push(this.padLeft(cpf, 14));
    
    // 063-074: Data de Vencimento (DDMMAAAA)
    campos.push(dataVencimento.format('DDMMYYYY'));
    
    // 075-087: Valor do Pagamento (13 dígitos, 2 decimais)
    const valor = Math.round(payment.amount * 100); // Converter para centavos
    campos.push(this.padLeft(valor.toString(), 13));
    
    // 088-088: Tipo de Moeda (R$ = 00)
    campos.push('00');
    
    // 089-090: Tipo de Operação (01 = Crédito em Conta Corrente)
    campos.push('01');
    
    // 091-093: Código do Banco do Favorecido (341 = Itaú)
    campos.push('341');
    
    // 094-094: Tipo de Conta (1 = Conta Corrente, 2 = Poupança)
    let tipoConta = '1'; // Default: Conta Corrente
    if (payment.accountType === 'POUPANÇA' || payment.accountType === 'POUPANCA') {
      tipoConta = '2';
    }
    campos.push(tipoConta);
    
    // 095-104: Agência do Favorecido (completo)
    campos.push(this.padLeft(agencia, 10));
    
    // 105-119: Conta do Favorecido (completo)
    const contaCompleta = (payment.account?.replace(/[^0-9]/g, '') || '').substring(0, 15);
    campos.push(this.padLeft(contaCompleta, 15));
    
    // 120-120: Dígito da Conta
    campos.push(payment.digit?.substring(0, 1) || '0');
    
    // 121-160: Nome do Favorecido (completo)
    campos.push(this.padRight(payment.name.substring(0, 40).toUpperCase(), 40));
    
    // 161-173: Valor do Pagamento (novamente, para validação)
    campos.push(this.padLeft(valor.toString(), 13));
    
    // 174-179: Data de Pagamento (DDMMAA)
    campos.push(dataVencimento.format('DDMMYY'));
    
    // 180-192: Valor Real do Pagamento
    campos.push(this.padLeft(valor.toString(), 13));
    
    // 193-205: Número de Inscrição (CPF/CNPJ)
    campos.push(this.padLeft(cpf, 13));
    
    // 206-218: Complemento (brancos)
    campos.push(this.padRight('', 13));
    
    // 219-220: Código de Movimento Retorno (branco na remessa)
    campos.push('  ');
    
    // 221-221: Tipo de Inscrição (1 = CPF, 2 = CNPJ)
    campos.push('1'); // Assumindo CPF
    
    // 222-235: Número de Inscrição (CPF completo)
    campos.push(this.padLeft(cpf, 14));
    
    // 236-250: Complemento (brancos)
    campos.push(this.padRight('', 15));
    
    // 251-394: Complemento do Registro (brancos)
    campos.push(this.padRight('', 144));
    
    // 395-400: Sequencial do Registro
    const sequencialStr = (sequencial + 1).toString().padStart(6, '0'); // +1 porque header é 000001
    campos.push(sequencialStr);
    
    const linha = campos.join('');
    
    if (linha.length !== 400) {
      throw new Error(`Detalhe deve ter 400 caracteres, mas tem ${linha.length}`);
    }
    
    return linha;
  }

  /**
   * Gera registro TRAILER (Registro 9) - 400 posições
   */
  private generateTrailer(
    config: Cnab400Config,
    totalRegistros: number,
    dataGeracao: moment.Moment
  ): string {
    const campos: string[] = [];
    
    // 001-001: Tipo de Registro (9 = Trailer)
    campos.push('9');
    
    // 002-394: Complemento do Registro (brancos)
    campos.push(this.padRight('', 393));
    
    // 395-400: Sequencial do Registro (último número)
    const sequencial = (totalRegistros + 2).toString().padStart(6, '0'); // +2 (header + trailer)
    campos.push(sequencial);
    
    const linha = campos.join('');
    
    if (linha.length !== 400) {
      throw new Error(`Trailer deve ter 400 caracteres, mas tem ${linha.length}`);
    }
    
    return linha;
  }

  /**
   * Preenche string à direita com espaços
   */
  private padRight(str: string, length: number): string {
    return str.substring(0, length).padEnd(length, ' ');
  }

  /**
   * Preenche string à esquerda com zeros
   */
  private padLeft(str: string, length: number): string {
    return str.substring(0, length).padStart(length, '0');
  }

  /**
   * Obtém configuração padrão da empresa
   */
  async getDefaultConfig(): Promise<Cnab400Config> {
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: 'default' }
    });

    if (!companySettings) {
      throw new Error('Configurações da empresa não encontradas');
    }

    // Buscar última remessa para incrementar sequencial
    // Por enquanto, usar data/hora como sequencial
    const sequencial = moment().format('YYYYMMDDHHmmss').substring(8); // Últimos 7 dígitos

    return {
      empresaCodigo: process.env.ITAU_EMPRESA_CODIGO || '00000000', // Deve ser configurado
      empresaNome: companySettings.name.substring(0, 30),
      empresaCnpj: companySettings.cnpj.replace(/[^0-9]/g, ''),
      empresaAgencia: process.env.ITAU_EMPRESA_AGENCIA || '00000',
      empresaConta: process.env.ITAU_EMPRESA_CONTA || '00000',
      empresaDigito: process.env.ITAU_EMPRESA_DIGITO || '0',
      sequencialRemessa: sequencial
    };
  }
}
