import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileId } = body;

    if (!fileId || fileId === '-' || fileId.trim() === '') {
      return new NextResponse("Missing fileId", { status: 400 });
    }

    const baseUrl = req.nextUrl.origin;
    const tokenRes = await fetch(`${baseUrl}/api/gdrive/refresh`, { method: "POST" });
    
    if (!tokenRes.ok) {
      return new NextResponse("Failed to obtain Google Drive token", { status: 401 });
    }
    
    const tokenData = await tokenRes.json();
    const token = tokenData.accessToken;

    if (!token) {
      return new NextResponse("No access token returned", { status: 401 });
    }

    const deleteRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!deleteRes.ok) {
      const errText = await deleteRes.text();
      console.error("Failed to delete file:", errText);
      return new NextResponse(`Failed to delete file: ${errText}`, { status: deleteRes.status });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("GDrive delete error:", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
