export interface RazorpayLinkResponse {
  id: string;
  short_url: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Creates a Razorpay Payment Link using Test Mode credentials or fallback stub
 */
export async function createRazorpayPaymentLink(params: {
  amount: number; // in INR
  description: string;
  customerName: string;
  customerPhone: string;
}): Promise<RazorpayLinkResponse> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (keyId && keySecret) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          amount: params.amount * 100, // convert to paise
          currency: 'INR',
          accept_partial: false,
          description: params.description,
          customer: {
            name: params.customerName,
            contact: params.customerPhone
          },
          notify: {
            sms: true,
            email: false
          },
          reminder_enable: true,
          callback_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/buy/success`,
          callback_method: 'get'
        })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          id: data.id,
          short_url: data.short_url,
          amount: params.amount,
          currency: 'INR',
          status: data.status || 'created'
        };
      } else {
        console.warn('[Razorpay] API call failed, using mock payment link:', await response.text());
      }
    } catch (err) {
      console.warn('[Razorpay] Network error calling Razorpay API:', err);
    }
  } else {
    // TODO: Razorpay Key ID / Secret missing in .env - returning test mode simulated payment link
    console.log('[Razorpay] RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET missing in .env. Using mock payment link stub.');
  }

  // Simulated Razorpay link fallback
  const mockLinkId = `plink_test_${Math.random().toString(36).substring(2, 9)}`;
  return {
    id: mockLinkId,
    short_url: `#mock-payment-modal?link_id=${mockLinkId}&amount=${params.amount}`,
    amount: params.amount,
    currency: 'INR',
    status: 'created'
  };
}
