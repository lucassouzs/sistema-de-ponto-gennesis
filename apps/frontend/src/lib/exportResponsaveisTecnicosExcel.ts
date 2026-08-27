import { exportBrandedExcelTable } from '@/lib/exportBrandedExcelTable';
import {
  RESPONSAVEL_TECNICO_IMPORT_TEMPLATE_HEADERS,
  type ResponsavelTecnicoExportRow,
} from '@/lib/responsavelTecnicoImport';

function formatExportDate(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/**
 * Exporta responsáveis técnicos em .xlsx estilizado (logos Gennesis+ENG PAC, faixa vermelha).
 */
export async function exportResponsaveisTecnicosEntries(
  entries: ResponsavelTecnicoExportRow[],
  filenameSuffix?: string
): Promise<void> {
  const suffix = filenameSuffix || new Date().toISOString().slice(0, 10);
  const headers = RESPONSAVEL_TECNICO_IMPORT_TEMPLATE_HEADERS;
  await exportBrandedExcelTable({
    title: 'Responsáveis Técnicos',
    subtitle: 'Exportação do sistema Gennesis — alinhada ao cadastro de responsáveis técnicos',
    sheetName: 'Responsaveis',
    filename: `responsaveis-tecnicos_${suffix}.xlsx`,
    columns: headers.map((header) => ({
      header,
      width:
        header === 'PROFISSIONAL'
          ? 28
          : header === 'ART/CARGO OU FUNÇÃO'
            ? 28
            : header === 'TÍTULO'
              ? 22
              : header === 'STATUS' || header === 'ANUIDADE' || header === 'CREA'
                ? 12
                : 14,
      align:
        header === 'STATUS' || header === 'ANUIDADE' || header === 'CREA' ? 'center' : 'left',
      statusTone: header === 'STATUS' || header === 'ANUIDADE',
    })),
    rows: entries.map((r) => [
      r.crea || '',
      r.empresa || '',
      r.profissional || '',
      r.cpf || '',
      r.registro || '',
      formatExportDate(r.dataInicio),
      r.titulo || '',
      r.artCargoFuncao || '',
      r.protocolo || '',
      formatExportDate(r.baixaEm),
      r.anuidade2026 || '',
      r.status || '',
    ]),
  });
}
