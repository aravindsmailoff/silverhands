import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { action, phone, otp } = await req.json();

    if (action === 'send') {
      const mockOtp = '424242';
      console.log(`[Mock SMS Gateway API] Generated OTP for ${phone}: ${mockOtp}`);
      return NextResponse.json({
        success: true,
        message: 'Mock OTP generated and sent to console/response',
        mockOtp,
        note: 'Mock OTP is 424242 for testing'
      });
    }

    if (action === 'verify') {
      const isValid = otp === '424242' || (otp && otp.length === 6);
      return NextResponse.json({
        success: isValid,
        message: isValid ? 'OTP Verified successfully' : 'Invalid OTP entered'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'OTP API Error' }, { status: 500 });
  }
}
