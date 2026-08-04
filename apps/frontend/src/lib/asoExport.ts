import * as XLSX from 'xlsx';

type AsoResultado = 'APTO' | 'APTO_COM_RESTRICAO' | 'INAPTO';

export type AsoExportRow = {
  dataExame: string;
  dataValidade: string;
  resultado: AsoResultado;
  medicoResponsavel: string;
  crmMedico: string;
  clinica: string;
  valor?: string | number | null;
  observacoes?: string | null;
  validadePadrao: boolean;
  tipoAso?: { nome: string } | null;
  funcionario?: {
    employeeId: string;
    position: string;
    department: string;
    user?: { name: string; cpf: string } | null;
  } | null;
};

const RESULTADO_LABEL: Record<AsoResultado, string> = {
  APTO: 'Apto',
  APTO_COM_RESTRICAO: 'Apto com restrição',
  INAPTO: 'Inapto',
};

function formatDateBrExport(value?: string | null): string {
  if (!value) return '';
  const d = String(value).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return '';
  return `${day}/${m}/${y}`;
}

function formatMoneyExport(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function exportAsoRegistrosToExcel(rows: AsoExportRow[]): void {
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const in30 = todayUtc + 30 * 24 * 60 * 60 * 1000;

  const data = rows.map((row) => {
    const parts = String(row.dataValidade).slice(0, 10).split('-').map(Number);
    const validadeUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    const statusValidade =
      validadeUtc < todayUtc ? 'Vencido' : validadeUtc <= in30 ? 'A vencer' : 'Válido';

    return {
      Funcionário: row.funcionario?.user?.name || '',
      Matrícula: row.funcionario?.employeeId || '',
      CPF: row.funcionario?.user?.cpf || '',
      Cargo: row.funcionario?.position || '',
      Setor: row.funcionario?.department || '',
      'Tipo de ASO': row.tipoAso?.nome || '',
      'Data do Exame': formatDateBrExport(row.dataExame),
      'Data de Validade': formatDateBrExport(row.dataValidade),
      'Status Validade': statusValidade,
      Resultado: RESULTADO_LABEL[row.resultado] || row.resultado,
      Valor: formatMoneyExport(row.valor),
      'Médico Responsável': row.medicoResponsavel,
      CRM: row.crmMedico,
      Clínica: row.clinica,
      'Validade Padrão (12m)': row.validadePadrao ? 'Sim' : 'Não',
      Observações: row.observacoes || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 16 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
    { wch: 12 },
    { wch: 22 },
    { wch: 18 },
    { wch: 32 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ASOs');

  const suffix = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `aso-registros_${suffix}.xlsx`);
}
