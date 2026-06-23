import { NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

export async function POST() {
  try {
    initFirebase();
    const db = getFirestore();
    const prefRef = doc(db, 'app_config', 'gdrive_preferences');
    const prefSnap = await getDoc(prefRef);

    if (!prefSnap.exists()) {
      return NextResponse.json({ error: 'No GDrive prefs found' }, { status: 404 });
    }

    const prefs = prefSnap.data();
    const { clientId, clientSecret, refreshToken, accessToken, tokenExpiresAt } = prefs;

    if (!refreshToken || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Missing refresh_token, clientId, or clientSecret in stored prefs' },
        { status: 400 }
      );
    }

    // Check if current access token is still valid (with 2-minute buffer)
    const now = Date.now();
    if (accessToken && tokenExpiresAt && now < tokenExpiresAt - 120000) {
      return NextResponse.json({
        accessToken,
        tokenExpiresAt,
        refreshed: false,
      });
    }

    // Refresh the access token using the refresh token
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!refreshRes.ok) {
      const errText = await refreshRes.text();
      console.error('Token refresh failed:', errText);
      return NextResponse.json(
        { error: 'Token refresh failed', details: errText },
        { status: 400 }
      );
    }

    const refreshData = await refreshRes.json();
    const newAccessToken = refreshData.access_token;
    const newExpiresAt = Date.now() + (refreshData.expires_in || 3600) * 1000;

    // Update Firestore with new access token
    await setDoc(
      prefRef,
      {
        accessToken: newAccessToken,
        tokenExpiresAt: newExpiresAt,
      },
      { merge: true }
    );

    return NextResponse.json({
      accessToken: newAccessToken,
      tokenExpiresAt: newExpiresAt,
      refreshed: true,
    });
  } catch (err: any) {
    console.error('Refresh route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
