import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fileId = url.searchParams.get("fileId");

  if (!fileId) {
    return new NextResponse("Missing fileId", { status: 400 });
  }

  try {
    // Automatically get a valid access token using the refresh route
    const baseUrl = req.nextUrl.origin;
    const tokenRes = await fetch(`${baseUrl}/api/gdrive/refresh`, { method: "POST" });
    
    if (!tokenRes.ok) {
      console.error("Failed to get token via refresh route:", await tokenRes.text());
      return new NextResponse("Failed to obtain Google Drive token", { status: 401 });
    }
    
    const tokenData = await tokenRes.json();
    const token = tokenData.accessToken;

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
