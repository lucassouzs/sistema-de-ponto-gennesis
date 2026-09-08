/** Sem anel ou outline ao focar — a borda vermelha animada vem de `globals.css`. */

export const FORM_FIELD_NO_FOCUS_CLS =

  'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0';



/** Fundo cinza escuro no dark mode — mesmo tom dos single-selects (gray-800). */

export const FORM_FIELD_BASE_CLS =

  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50';



export const FORM_FIELD_INPUT_CLS = `${FORM_FIELD_BASE_CLS} ${FORM_FIELD_NO_FOCUS_CLS}`;



export const FORM_FIELD_TEXTAREA_CLS = `${FORM_FIELD_BASE_CLS} min-h-[80px] resize-y ${FORM_FIELD_NO_FOCUS_CLS}`;


