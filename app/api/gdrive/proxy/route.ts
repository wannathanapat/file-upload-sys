import { NextRequest, NextResponse } from "next/server";
import { initFirebase } from '@/lib/firebase';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

async function getValidAccessTokenServer() {
  initFirebase();
  const db = getFirestore();
  const prefRef = doc(db, 'app_config', 'gdrive_preferences');
  const prefSnap = await getDoc(prefRef);

  if (!prefSnap.exists()) {
    throw new Error('No GDrive prefs found');
  }

  const prefs = prefSnap.data();
  const { clientId, clientSecret, refreshToken, accessToken, tokenExpiresAt } = prefs;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing refresh_token, clientId, or clientSecret in stored prefs');
  }

  const now = Date.now();
  if (accessToken && tokenExpiresAt && now < tokenExpiresAt - 120000) {
    return accessToken;
  }

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
    throw new Error(`Token refresh failed: ${errText}`);
  }

  const refreshData = await refreshRes.json();
  const newAccessToken = refreshData.access_token;
  const newExpiresAt = Date.now() + (refreshData.expires_in || 3600) * 1000;

  await setDoc(
    prefRef,
    {
      accessToken: newAccessToken,
      tokenExpiresAt: newExpiresAt,
    },
    { merge: true }
  );

  return newAccessToken;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fileId = url.searchParams.get("fileId");

  if (!fileId) {
    return new NextResponse("Missing fileId", { status: 400 });
  }

  try {
    const token = await getValidAccessTokenServer();

    if (!token) {
      return new NextResponse("No access token returned", { status: 401 });
    }

    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${token}`
    };
    
    // Forward range requests for video streaming
    const range = req.headers.get("range");
    if (range) {
      headersObj["Range"] = range;
    }

    const response = await fetch(driveUrl, {
      headers: headersObj
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("GDrive Proxy fetch error:", errorText);
      return new NextResponse(`Failed to fetch file from Google Drive: ${response.status} - ${errorText}`, { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");
    const contentRange = response.headers.get("content-range");
    const acceptRanges = response.headers.get("accept-ranges");
    
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", "inline"); 
    
    if (contentLength) headers.set("Content-Length", contentLength);
    if (contentRange) headers.set("Content-Range", contentRange);
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

    return new NextResponse(response.body, {
      status: response.status,
      headers
    });
  } catch (error: any) {
    console.error("GDrive Proxy exception:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
