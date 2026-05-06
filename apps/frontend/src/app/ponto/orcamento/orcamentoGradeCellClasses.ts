/**
 * Estilo “célula de planilha” para inputs/selects dentro de tabelas de orçamento
 * (memorial, montagem, analítico, ficha/planilha analítica).
 */
/** Altura mínima das células (2,75rem), igual à memória; use em todo `<tr>` da grade (`thead` e `tbody`). */
export const gradeTableRowTrCls =
  '[&>td]:min-h-[2.75rem] [&>th]:min-h-[2.75rem] [&>td]:align-middle [&>th]:align-middle';

/**
 * Mesma regra aplicada na `<table>` (orçamento / analítico / memória): cobre todas as linhas de uma vez.
 */
export const gradeTableCls =
  '[&_td]:min-h-[2.75rem] [&_th]:min-h-[2.75rem] [&_td]:align-middle [&_th]:align-middle';

export const inputGradeCls =
  'box-border block h-full min-h-[2.75rem] w-full min-w-0 border-0 rounded-none bg-transparent px-2 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-none outline-none ring-0 transition-[background-color,box-shadow] placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:z-[1] focus:bg-red-50/95 dark:focus:bg-red-950/40 focus:ring-1 focus:ring-inset focus:ring-red-500 dark:focus:ring-red-400';

export const inputGradeBloqueadoCls =
  'box-border block h-full min-h-[2.75rem] w-full min-w-0 border-0 rounded-none bg-transparent px-2 py-2.5 text-sm text-gray-500 dark:text-gray-400 cursor-not-allowed text-center shadow-none outline-none ring-0';

/** Select nativo na mesma linha visual dos inputs de grade. */
export const selectGradeCls =
  'box-border min-h-[2.75rem] w-full min-w-0 border-0 rounded-none bg-transparent px-2 py-2 text-xs sm:text-sm text-gray-900 dark:text-gray-100 shadow-none outline-none ring-0 cursor-pointer focus:z-[1] focus:bg-red-50/95 dark:focus:bg-red-950/40 focus:ring-1 focus:ring-inset focus:ring-red-500 dark:focus:ring-red-400';

/**
 * Cabeçalho memória de cálculo (C/L/H/N): lista suspensa sem seta — parece texto até abrir.
 */
export const selectGradeHeaderMemorialCls =
  'box-border min-h-[2.75rem] w-full min-w-0 cursor-pointer appearance-none border-0 rounded-none bg-transparent px-1 py-2 text-center text-[11px] font-bold tracking-wide text-gray-700 shadow-none [-moz-appearance:none] [-webkit-appearance:none] outline-none ring-0 dark:text-gray-200 [&::-ms-expand]:hidden focus:z-[1] focus:bg-red-50/90 dark:focus:bg-red-950/35 focus:ring-1 focus:ring-inset focus:ring-red-500 dark:focus:ring-red-400';

/**
 * Tipo MO/MA/LO (planilha analítica / ficha de demanda): mesmo padrão, sem seta visível.
 */
export const selectGradeSemSetaCls =
  'box-border min-h-[2.75rem] w-full min-w-0 cursor-pointer appearance-none border-0 rounded-none bg-transparent px-2 py-2 text-center text-xs font-medium text-gray-900 shadow-none [-moz-appearance:none] [-webkit-appearance:none] outline-none ring-0 dark:text-gray-100 sm:text-sm [&::-ms-expand]:hidden focus:z-[1] focus:bg-red-50/95 dark:focus:bg-red-950/40 focus:ring-1 focus:ring-inset focus:ring-red-500 dark:focus:ring-red-400';

/**
 * R$ + valor monetário: o realce de foco (anel vermelho) envolve os dois —
 * use com `inputGradeMoedaCls` no &lt;input&gt; (sem ring no próprio input).
 */
export const moedaGradeFieldWrapperCls =
  'flex min-h-[2.75rem] w-full min-w-0 items-center gap-1.5 px-2 transition-[background-color,box-shadow] focus-within:z-[1] focus-within:bg-red-50/95 dark:focus-within:bg-red-950/40 focus-within:ring-1 focus-within:ring-inset focus-within:ring-red-500 dark:focus-within:ring-red-400';

export const inputGradeMoedaCls =
  'box-border block min-h-0 min-w-0 flex-1 border-0 rounded-none bg-transparent py-2.5 text-sm tabular-nums text-gray-900 dark:text-gray-100 shadow-none outline-none ring-0 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:bg-transparent dark:focus:bg-transparent focus:outline-none focus:ring-0';
