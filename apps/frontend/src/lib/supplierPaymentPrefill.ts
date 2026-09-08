/**
 * Monta texto de "Dados do pagamento" a partir do cadastro bancário do fornecedor.
 */
export function buildSupplierPaymentDetailsText(supplier: {
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  accountDigit?: string | null;
  name?: string | null;
  tradeName?: string | null;
}): string {
  const lines: string[] = [];
  const bank = supplier.bank?.trim();
  const agency = supplier.agency?.trim();
  const account = supplier.account?.trim();
  const digit = supplier.accountDigit?.trim();
  const favorecido =
    supplier.tradeName?.trim() || supplier.name?.trim() || '';

  if (bank) lines.push(`Banco: ${bank}`);
  if (agency) lines.push(`Agência: ${agency}`);
  if (account) {
    lines.push(digit ? `Conta: ${account}-${digit}` : `Conta: ${account}`);
  }
  if (favorecido) lines.push(`Favorecido: ${favorecido}`);

  return lines.join('\n');
}

/** Prefill de pagamento/PIX a partir do cadastro do fornecedor (só o que existir). */
export function buildSupplierPaymentPrefill(supplier: {
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  accountDigit?: string | null;
  name?: string | null;
  tradeName?: string | null;
  pixKeyType?: string | null;
  pixKey?: string | null;
}): { paymentDetails: string; pixKeyType: string; pixKey: string } {
  return {
    paymentDetails: buildSupplierPaymentDetailsText(supplier),
    pixKeyType: supplier.pixKeyType?.trim() || '',
    pixKey: supplier.pixKey?.trim() || '',
  };
}
