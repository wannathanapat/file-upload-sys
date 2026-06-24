import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, chatId, message } = body;

    if (!token || !chatId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: token, chatId, message' },
        { status: 400 }
      );
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('Telegram API error response:', errText);
      return NextResponse.json(
        { error: 'Telegram API returned error', details: errText },
        { status: 400 }
      );
    }

    const resData = await res.json();
    return NextResponse.json({ success: true, data: resData });
  } catch (err: any) {
    console.error('Telegram API route proxy error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
