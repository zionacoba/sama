export type RefundResult = {
  success: boolean
  refundId?: string
  error?: string
  requiresManualProcessing?: boolean
}

export async function processPayMongoRefund({
  paymentId,
  paymentMethod,
  amountPesos,
  reason = 'others',
  notes,
}: {
  paymentId: string | null | undefined
  paymentMethod: string | null | undefined
  amountPesos: number
  reason?: 'duplicate' | 'fraudulent' | 'others'
  notes?: string
}): Promise<RefundResult> {
  if (paymentMethod === 'qrph') {
    return { success: false, requiresManualProcessing: true, error: 'QR Ph payments require manual refund' }
  }

  if (!paymentId) {
    return { success: false, error: 'No payment transaction ID found' }
  }

  if (amountPesos <= 0) {
    return { success: true }
  }

  const secretKey = process.env.PAYMONGO_SECRET_KEY
  if (!secretKey) {
    return { success: false, error: 'Payment service not configured' }
  }

  const amountCentavos = Math.round(amountPesos * 100)

  try {
    const response = await fetch('https://api.paymongo.com/v1/refunds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64'),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountCentavos,
            payment_id: paymentId,
            reason,
            notes: notes ?? 'Sama booking cancellation',
          },
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data?.errors?.[0]?.detail ?? 'Refund failed' }
    }

    return { success: true, refundId: data?.data?.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
