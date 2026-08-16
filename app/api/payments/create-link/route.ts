import { NextResponse } from 'next/server';
import { createRazorpayPaymentLink } from '@/lib/razorpay';
import { memoryStore } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { request_id, amount, description, customer_name, customer_phone } = await req.json();

    const link = await createRazorpayPaymentLink({
      amount: Number(amount) || 500,
      description: description || 'SilverHands Product Purchase',
      customerName: customer_name || 'Aarav Mehta',
      customerPhone: customer_phone || '+91 97777 88888'
    });

    if (request_id) {
      memoryStore.payments.push({
        id: `pay-${Date.now()}`,
        request_id,
        amount: Number(amount),
        razorpay_link_id: link.id,
        status: 'created'
      });
    }

    return NextResponse.json({ success: true, payment_link: link });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error creating payment link' }, { status: 500 });
  }
}
