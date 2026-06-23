import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, clientId, clientSecret, redirectUri } = body;

    if (!code || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Missing required fields: code, clientId, clientSecret' },
        { status: 400 }
      );
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri || 'postmessage',
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Token exchange failed:', errText);
      return NextResponse.json(
        { error: 'Token exchange failed', details: errText },
        { status: 400 }
      );
    }

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!refresh_token) {
      return NextResponse.json(
        { error: 'No refresh_token received. Make sure to request offline access with prompt=consent.' },
        { status: 400 }
      );
    }

    // Fetch user email
    let email = '';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        email = userInfo.email || '';
      }
    } catch (e) {
      console.warn('Could not fetch user email:', e);
    }

    const expiresAt = Date.now() + expires_in * 1000;

    // Save to Firestore
    initFirebase();
    const db = getFirestore();
    await setDoc(
      doc(db, 'app_config', 'gdrive_preferences'),
      {
        connected: true,
        email,
        clientId,
        clientSecret, // stored server-side only in Firestore, never sent back to frontend
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: expiresAt,
        folderName: 'Upfile Data Center',
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      email,
      accessToken: access_token,
      tokenExpiresAt: expiresAt,
    });
  } catch (err: any) {
    console.error('Exchange route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
