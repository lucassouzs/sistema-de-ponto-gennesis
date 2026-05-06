import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

interface ImportRow {
  Nome: string;
  Email: string;
  CPF: string;
  Setor: string;
  Cargo: string;
  'Data de Admissão': string;
  'Data de Nascimento'?: string;
  Salário: string;
  'Centro de Custo'?: string;
  Tomador?: string;
  Empresa?: string;
  Banco?: string;
  'Tipo de Conta'?: string;
  Agência?: string;
  Operação?: string;
  Conta?: string;
  Dígito?: string;
  'Tipo Chave PIX'?: string;
  'Chave PIX'?: string;
  Modalidade?: string;
  'Salário Família'?: string;
  Periculosidade?: string;
  Insalubridade?: string;
  Polo?: string;
  'Categoria Financeira'?: string;
  'VA Diário'?: string;
  'VT Diário'?: string;
  'Precisa Bater Ponto'?: string;
  'Acréscimo Fixo'?: string;
}

/**
 * Preview/Validação da importação - apenas valida sem importar
 */
export const importEmployeesPreview = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      throw createError('Arquivo não enviado', 400);
    }

    const file = req.file;
    const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');

    if (!isExcel) {
      throw createError('Formato de arquivo não suportado. Use apenas Excel (.xlsx ou .xls)', 400);
    }

    // Processar Excel
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: ImportRow[] = XLSX.utils.sheet_to_json<ImportRow>(worksheet);

    if (rows.length === 0) {
      throw createError('Arquivo vazio ou sem dados válidos', 400);
    }

    // Buscar a última matrícula do ano atual para gerar sequencialmente
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const lastEmployee = await prisma.employee.findFirst({
      where: {
        employeeId: {
          startsWith: currentYear
        }
      },
      orderBy: {
        employeeId: 'desc'
      }
    });

    let nextSequence = 1;
    if (lastEmployee) {
      const lastSequence = parseInt(lastEmployee.employeeId.slice(2)) || 0;
      nextSequence = lastSequence + 1;
    }

    const validRows: any[] = [];
    const invalidRows: any[] = [];

    // Validar cada linha
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNumber = i + 2;
      const errors: string[] = [];
      let employeeId = '';

      // Validações obrigatórias
      if (!row.Nome) errors.push('Nome é obrigatório');
      if (!row.Email) errors.push('Email é obrigatório');
      if (!row.CPF) errors.push('CPF é obrigatório');
      if (!row.Setor) errors.push('Setor é obrigatório');
      if (!row.Cargo) errors.push('Cargo é obrigatório');
      if (!row['Data de Admissão']) errors.push('Data de Admissão é obrigatória');
      if (!row.Salário) errors.push('Salário é obrigatório');

      if (errors.length > 0) {
        invalidRows.push({
          linha: lineNumber,
          dados: row,
          erros: errors
        });
        continue;
      }

      // Limpar CPF
      const cleanCpf = row.CPF.replace(/[.-]/g, '');
      if (cleanCpf.length !== 11) {
        errors.push(`CPF inválido: ${row.CPF}`);
      }

      // Verificar duplicatas
      const existingEmail = await prisma.user.findUnique({
        where: { email: row.Email }
      });
      if (existingEmail) {
        errors.push(`Email ${row.Email} já está cadastrado`);
      }

      const existingCpf = await prisma.user.findUnique({
        where: { cpf: cleanCpf }
      });
      if (existingCpf) {
        errors.push(`CPF ${row.CPF} já está cadastrado`);
      }

      // Validar data de admissão
      const hireDate = new Date(row['Data de Admissão']);
      if (isNaN(hireDate.getTime())) {
        errors.push(`Data de admissão inválida: ${row['Data de Admissão']}`);
      }

      // Validar salário
      const salary = parseFloat(row.Salário.replace(/[^\d,.-]/g, '').replace(',', '.'));
      if (isNaN(salary) || salary <= 0) {
        errors.push(`Salário inválido: ${row.Salário}`);
      }

      // Gerar matrícula que será usada
      employeeId = `${currentYear}${nextSequence.toString().padStart(4, '0')}`;
      nextSequence++;

      // Verificar se a matrícula gerada já existe (improvável, mas verificar)
      const existingEmployee = await prisma.employee.findUnique({
        where: { employeeId: employeeId }
      });
      if (existingEmployee) {
        errors.push(`Matrícula ${employeeId} já existe (conflito na geração)`);
      }

      if (errors.length > 0) {
        invalidRows.push({
          linha: lineNumber,
          dados: row,
          erros: errors,
          matriculaGerada: employeeId
        });
      } else {
        validRows.push({
          linha: lineNumber,
          dados: {
            ...row,
            Matrícula: employeeId // Adicionar matrícula gerada
          },
          matriculaGerada: employeeId
        });
      }
    }

    return res.json({
      success: true,
      data: {
        total: rows.length,
        validos: validRows.length,
        invalidos: invalidRows.length,
        validosDetalhes: validRows,
        invalidosDetalhes: invalidRows
      }
    });
  } catch (error: any) {
    console.error('Erro ao fazer preview da importação:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
};

export const importEmployees = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      throw createError('Arquivo não enviado', 400);
    }

    const file = req.file;
    const results: any[] = [];
    const errors: any[] = [];
    const successes: any[] = [];

    // Verificar se é arquivo Excel
    const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');

    if (!isExcel) {
      throw createError('Formato de arquivo não suportado. Use apenas Excel (.xlsx ou .xls)', 400);
    }

    // Processar Excel
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: ImportRow[] = XLSX.utils.sheet_to_json<ImportRow>(worksheet);

    if (rows.length === 0) {
      throw createError('Arquivo vazio ou sem dados válidos', 400);
    }

    // Buscar a última matrícula do ano atual para gerar sequencialmente
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const lastEmployee = await prisma.employee.findFirst({
      where: {
        employeeId: {
          startsWith: currentYear
        }
      },
      orderBy: {
        employeeId: 'desc'
      }
    });

    let nextSequence = 1;
    if (lastEmployee) {
      const lastSequence = parseInt(lastEmployee.employeeId.slice(2)) || 0;
      nextSequence = lastSequence + 1;
    }

    // Processar cada linha
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNumber = i + 2; // +2 porque linha 1 é cabeçalho e arrays começam em 0

      try {
        // Validações obrigatórias
        if (!row.Nome || !row.Email || !row.CPF || !row.Setor || !row.Cargo || !row['Data de Admissão'] || !row.Salário) {
          errors.push({
            linha: lineNumber,
            erro: 'Campos obrigatórios faltando: Nome, Email, CPF, Setor, Cargo, Data de Admissão, Salário'
          });
          continue;
        }

        // Limpar CPF (remover pontos e traços)
        const cleanCpf = row.CPF.replace(/[.-]/g, '');
        if (cleanCpf.length !== 11) {
          errors.push({
            linha: lineNumber,
            erro: `CPF inválido: ${row.CPF}`
          });
          continue;
        }

        // Verificar se já existe email
        const existingEmail = await prisma.user.findUnique({
          where: { email: row.Email }
        });

        if (existingEmail) {
          errors.push({
            linha: lineNumber,
            nome: row.Nome,
            erro: `Email ${row.Email} já está cadastrado no sistema`
          });
          continue;
        }

        // Verificar se já existe CPF
        const existingCpf = await prisma.user.findUnique({
          where: { cpf: cleanCpf }
        });

        if (existingCpf) {
          errors.push({
            linha: lineNumber,
            nome: row.Nome,
            erro: `CPF ${row.CPF} já está cadastrado no sistema`
          });
          continue;
        }

        // Gerar matrícula automaticamente (sempre)
        const employeeId = `${currentYear}${nextSequence.toString().padStart(4, '0')}`; // Ex: 24001, 24002, etc.
        nextSequence++; // Incrementar para o próximo funcionário

        const existingEmployee = await prisma.employee.findUnique({
          where: { employeeId: employeeId }
        });

        if (existingEmployee) {
          errors.push({
            linha: lineNumber,
            nome: row.Nome,
            erro: `Matrícula ${employeeId} já cadastrada`
          });
          continue;
        }

        // Gerar senha padrão
        const defaultPassword = '123456';

        // Processar datas
        const hireDate = new Date(row['Data de Admissão']);
        if (isNaN(hireDate.getTime())) {
          errors.push({
            linha: lineNumber,
            nome: row.Nome,
            erro: `Data de admissão inválida: ${row['Data de Admissão']}`
          });
          continue;
        }

        let birthDate: Date | null = null;
        if (row['Data de Nascimento']) {
          birthDate = new Date(row['Data de Nascimento']);
          if (isNaN(birthDate.getTime())) {
            birthDate = null;
          }
        }

        // Horário de trabalho padrão (fixo para todos)
        const workStartTime = '07:00';
        const workEndTime = '17:00';
        const lunchStartTime = '12:00';
        const lunchEndTime = '13:00';

        // Processar valores monetários
        const salary = parseFloat(row.Salário.replace(/[^\d,.-]/g, '').replace(',', '.'));
        if (isNaN(salary) || salary <= 0) {
          errors.push({
            linha: lineNumber,
            nome: row.Nome,
            erro: `Salário inválido: ${row.Salário}`
          });
          continue;
        }

        const dailyFoodVoucher = row['VA Diário'] ? parseFloat(row['VA Diário'].replace(/[^\d,.-]/g, '').replace(',', '.')) : 33.40;
        const dailyTransportVoucher = row['VT Diário'] ? parseFloat(row['VT Diário'].replace(/[^\d,.-]/g, '').replace(',', '.')) : 11.00;

        // Processar periculosidade e insalubridade (valores percentuais)
        const dangerPay = row.Periculosidade ? parseFloat(row.Periculosidade.replace(/[^\d,.-]/g, '').replace(',', '.')) : 0;
        const unhealthyPay = row.Insalubridade ? parseFloat(row.Insalubridade.replace(/[^\d,.-]/g, '').replace(',', '.')) : 0;
        const familySalary = row['Salário Família'] ? parseFloat(row['Salário Família'].replace(/[^\d,.-]/g, '').replace(',', '.')) : 0;

        // Processar acréscimo fixo
        const fixedAdjustments = row['Acréscimo Fixo'] ? parseFloat(row['Acréscimo Fixo'].replace(/[^\d,.-]/g, '').replace(',', '.')) : 0;

        // Processar "Precisa Bater Ponto"
        const requiresTimeClock = row['Precisa Bater Ponto']?.toLowerCase() === 'sim' || row['Precisa Bater Ponto']?.toLowerCase() === 's' || !row['Precisa Bater Ponto'];

        // Criar usuário e funcionário
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const result = await prisma.$transaction(async (tx: any) => {
          const user = await tx.user.create({
            data: {
              name: row.Nome,
              email: row.Email,
              cpf: cleanCpf,
              password: hashedPassword,
              role: 'EMPLOYEE'
            }
          });

          const employee = await tx.employee.create({
            data: {
              userId: user.id,
              employeeId: employeeId,
              department: row.Setor,
              position: row.Cargo,
              hireDate: hireDate,
              birthDate: birthDate,
              salary: salary,
              workSchedule: {
                startTime: workStartTime,
                endTime: workEndTime,
                lunchStartTime: lunchStartTime,
                lunchEndTime: lunchEndTime,
                workDays: [1, 2, 3, 4, 5] // Segunda a sexta
              },
              isRemote: false,
              costCenter: row['Centro de Custo'] || null,
              client: row.Tomador || null,
              company: row.Empresa || null,
              bank: row.Banco || null,
              accountType: row['Tipo de Conta'] || null,
              agency: row.Agência || null,
              operation: row.Operação || null,
              account: row.Conta || null,
              digit: row.Dígito || null,
              pixKeyType: row['Tipo Chave PIX'] || null,
              pixKey: row['Chave PIX'] || null,
              modality: row.Modalidade || null,
              familySalary: familySalary > 0 ? familySalary : null,
              dangerPay: dangerPay > 0 ? (salary * dangerPay / 100) : null,
              unhealthyPay: unhealthyPay > 0 ? (salary * unhealthyPay / 100) : null,
              polo: row.Polo || null,
              categoriaFinanceira: row['Categoria Financeira'] || null,
              dailyFoodVoucher: dailyFoodVoucher,
              dailyTransportVoucher: dailyTransportVoucher,
              requiresTimeClock: requiresTimeClock
            }
          });

          // Criar acréscimo fixo se o valor for maior que zero
          if (fixedAdjustments > 0) {
            await tx.salaryAdjustment.create({
              data: {
                employeeId: employee.id,
                type: 'OTHER',
                description: 'Acréscimo fixo mensal',
                amount: fixedAdjustments,
                isFixed: true,
                createdBy: user.id
              }
            });
          }

          return { user, employee };
        });

        successes.push({
          linha: lineNumber,
          nome: row.Nome,
          email: row.Email,
          matricula: employeeId
        });
      } catch (error: any) {
        errors.push({
          linha: lineNumber,
          nome: row.Nome || 'N/A',
          erro: error.message || 'Erro desconhecido'
        });
      }
    }

    return res.json({
      success: true,
      data: {
        total: rows.length,
        sucessos: successes.length,
        erros: errors.length,
        detalhes: {
          sucessos: successes,
          erros: errors
        }
      }
    });
  } catch (error: any) {
    console.error('Erro ao importar funcionários:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
};

/**
 * Importação em massa a partir de dados já processados (array de funcionários)
 */
export const importEmployeesBulk = async (req: Request, res: Response) => {
  try {
    const { employees } = req.body;

    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      throw createError('Array de funcionários vazio ou inválido', 400);
    }

    const errors: any[] = [];
    const successes: any[] = [];

    // Buscar a última matrícula do ano atual
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const lastEmployee = await prisma.employee.findFirst({
      where: {
        employeeId: {
          startsWith: currentYear
        }
      },
      orderBy: {
        employeeId: 'desc'
      }
    });

    let nextSequence = 1;
    if (lastEmployee) {
      const lastSequence = parseInt(lastEmployee.employeeId.slice(2)) || 0;
      nextSequence = lastSequence + 1;
    }

    // Processar cada funcionário
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const lineNumber = i + 1;

      try {
        // Validações obrigatórias
        if (!emp.Nome || !emp.Email || !emp.CPF || !emp.Setor || !emp.Cargo || !emp['Data de Admissão'] || !emp.Salário) {
          errors.push({
            linha: lineNumber,
            erro: 'Campos obrigatórios faltando: Nome, Email, CPF, Setor, Cargo, Data de Admissão, Salário'
          });
          continue;
        }

        // Limpar CPF
        const cleanCpf = emp.CPF.replace(/[.-]/g, '');
        if (cleanCpf.length !== 11) {
          errors.push({
            linha: lineNumber,
            nome: emp.Nome,
            erro: `CPF inválido: ${emp.CPF}`
          });
          continue;
        }

        // Verificar se já existe email
        const existingEmail = await prisma.user.findUnique({
          where: { email: emp.Email }
        });

        if (existingEmail) {
          errors.push({
            linha: lineNumber,
            nome: emp.Nome,
            erro: `Email ${emp.Email} já está cadastrado no sistema`
          });
          continue;
        }

        // Verificar se já existe CPF
        const existingCpf = await prisma.user.findUnique({
          where: { cpf: cleanCpf }
        });

        if (existingCpf) {
          errors.push({
            linha: lineNumber,
            nome: emp.Nome,
            erro: `CPF ${emp.CPF} já está cadastrado no sistema`
          });
          continue;
        }

        // Usar matrícula gerada ou gerar nova
        let employeeId = emp.matriculaGerada;
        if (!employeeId) {
          employeeId = `${currentYear}${nextSequence.toString().padStart(4, '0')}`;
        }
        nextSequence++;

        const existingEmployee = await prisma.employee.findUnique({
          where: { employeeId: employeeId }
        });

        if (existingEmployee) {
          errors.push({
            linha: lineNumber,
            nome: emp.Nome,
            erro: `Matrícula ${employeeId} já cadastrada`
          });
          continue;
        }

        // Senha padrão
        const defaultPassword = '123456';

        // Processar datas
        const hireDate = new Date(emp['Data de Admissão']);
        if (isNaN(hireDate.getTime())) {
          errors.push({
            linha: lineNumber,
            nome: emp.Nome,
            erro: `Data de admissão inválida: ${emp['Data de Admissão']}`
          });
          continue;
        }

        let birthDate: Date | null = null;
        if (emp['Data de Nascimento']) {
          birthDate = new Date(emp['Data de Nascimento']);
          if (isNaN(birthDate.getTime())) {
            birthDate = null;
          }
        }

        // Horário de trabalho padrão
        const workStartTime = '07:00';
        const workEndTime = '17:00';
        const lunchStartTime = '12:00';
        const lunchEndTime = '13:00';

        // Processar valores monetários
        const salary = parseFloat(emp.Salário.replace(/[^\d,.-]/g, '').replace(',', '.'));
        if (isNaN(salary) || salary <= 0) {
          errors.push({
            linha: lineNumber,
            nome: emp.Nome,
            erro: `Salário inválido: ${emp.Salário}`
          });
          continue;
        }

        const dailyFoodVoucher = emp['VA Diário'] ? parseFloat(emp['VA Diário'].replace(/[^\d,.-]/g, '').replace(',', '.')) : 33.40;
        const dailyTransportVoucher = emp['VT Diário'] ? parseFloat(emp['VT Diário'].replace(/[^\d,.-]/g, '').replace(',', '.')) : 11.00;

        // Processar periculosidade e insalubridade
        const dangerPay = emp.Periculosidade ? parseFloat(emp.Periculosidade.replace(/[^\d,.-]/g, '').replace(',', '.')) : 0;
        const unhealthyPay = emp.Insalubridade ? parseFloat(emp.Insalubridade.replace(/[^\d,.-]/g, '').replace(',', '.')) : 0;
        const familySalary = emp['Salário Família'] ? parseFloat(emp['Salário Família'].replace(/[^\d,.-]/g, '').replace(',', '.')) : 0;

        // Processar acréscimo fixo
        const fixedAdjustments = emp['Acréscimo Fixo'] ? parseFloat(emp['Acréscimo Fixo'].replace(/[^\d,.-]/g, '').replace(',', '.')) : 0;

        // Processar "Precisa Bater Ponto"
        const requiresTimeClock = emp['Precisa Bater Ponto']?.toLowerCase() === 'sim' || emp['Precisa Bater Ponto']?.toLowerCase() === 's' || !emp['Precisa Bater Ponto'];

        // Criar usuário e funcionário
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const result = await prisma.$transaction(async (tx: any) => {
          const user = await tx.user.create({
            data: {
              name: emp.Nome,
              email: emp.Email,
              cpf: cleanCpf,
              password: hashedPassword,
              role: 'EMPLOYEE'
            }
          });

          const employee = await tx.employee.create({
            data: {
              userId: user.id,
              employeeId: employeeId,
              department: emp.Setor,
              position: emp.Cargo,
              hireDate: hireDate,
              birthDate: birthDate,
              salary: salary,
              workSchedule: {
                startTime: workStartTime,
                endTime: workEndTime,
                lunchStartTime: lunchStartTime,
                lunchEndTime: lunchEndTime,
                workDays: [1, 2, 3, 4, 5]
              },
              isRemote: false,
              costCenter: emp['Centro de Custo'] || null,
              client: emp.Tomador || null,
              company: emp.Empresa || null,
              bank: emp.Banco || null,
              accountType: emp['Tipo de Conta'] || null,
              agency: emp.Agência || null,
              operation: emp.Operação || null,
              account: emp.Conta || null,
              digit: emp.Dígito || null,
              pixKeyType: emp['Tipo Chave PIX'] || null,
              pixKey: emp['Chave PIX'] || null,
              modality: emp.Modalidade || null,
              familySalary: familySalary > 0 ? familySalary : null,
              dangerPay: dangerPay > 0 ? (salary * dangerPay / 100) : null,
              unhealthyPay: unhealthyPay > 0 ? (salary * unhealthyPay / 100) : null,
              polo: emp.Polo || null,
              categoriaFinanceira: emp['Categoria Financeira'] || null,
              dailyFoodVoucher: dailyFoodVoucher,
              dailyTransportVoucher: dailyTransportVoucher,
              requiresTimeClock: requiresTimeClock
            }
          });

          // Criar acréscimo fixo se o valor for maior que zero
          if (fixedAdjustments > 0) {
            await tx.salaryAdjustment.create({
              data: {
                employeeId: employee.id,
                type: 'OTHER',
                description: 'Acréscimo fixo mensal',
                amount: fixedAdjustments,
                isFixed: true,
                createdBy: user.id
              }
            });
          }

          return { user, employee };
        });

        successes.push({
          linha: lineNumber,
          nome: emp.Nome,
          email: emp.Email,
          matricula: employeeId
        });
      } catch (error: any) {
        errors.push({
          linha: lineNumber,
          nome: emp.Nome || 'N/A',
          erro: error.message || 'Erro desconhecido'
        });
      }
    }

    return res.json({
      success: true,
      data: {
        total: employees.length,
        sucessos: successes.length,
        erros: errors.length,
        detalhes: {
          sucessos: successes,
          erros: errors
        }
      }
    });
  } catch (error: any) {
    console.error('Erro ao importar funcionários em massa:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
};
