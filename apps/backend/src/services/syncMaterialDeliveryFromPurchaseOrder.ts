import { syncMaterialDeliveryPaymentsFromPurchaseOrder } from './syncMaterialDeliveryFromStockMovement';

/** Entregas passam a ser criadas apenas por entrada de estoque; aqui só sincroniza pagamento/dados da OC. */
export async function syncMaterialDeliveryFromPurchaseOrder(
  purchaseOrderId: string,
  _createdByUserId: string
): Promise<void> {
  await syncMaterialDeliveryPaymentsFromPurchaseOrder(purchaseOrderId);
}

export async function safeSyncMaterialDeliveryFromPurchaseOrder(
  purchaseOrderId: string,
  createdByUserId: string
): Promise<void> {
  try {
    await syncMaterialDeliveryFromPurchaseOrder(purchaseOrderId, createdByUserId);
  } catch (error) {
    console.error('[MaterialDelivery] sync from purchase order failed', purchaseOrderId, error);
  }
}
