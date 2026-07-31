import { NextRequest, NextResponse } from 'next/server';

// GET /api/accounts/ses-webhook-url
// Returns the absolute URL to paste into the SNS topic's HTTPS subscription
// for SES delivery/open/click/bounce/complaint events.
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  return NextResponse.json({ url: `${base.replace(/\/$/, '')}/api/webhooks/ses` });
}
