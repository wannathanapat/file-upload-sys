interface GDriveUploadResponse {
  id: string;
  url: string;
  webViewLink?: string;
}

export function getMimeTypeFromExt(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'mp4': return 'video/mp4';
    case 'mov': return 'video/quicktime';
    case 'avi': return 'video/x-msvideo';
    case 'mkv': return 'video/x-matroska';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

export async function getOrCreateFolder(accessToken: string, folderName: string): Promise<string> {
  const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  
  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`ค้นหาโฟลเดอร์ล้มเหลว: ${errorText}`);
  }
  
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  
  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`สร้างโฟลเดอร์ล้มเหลว: ${errorText}`);
  }
  
  const createData = await createRes.json();
  return createData.id;
}

export async function getOrCreateFolderWithParent(
  accessToken: string,
  folderName: string,
  parentId: string
): Promise<string> {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }
  
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`ค้นหาโฟลเดอร์ลูกล้มเหลว: ${errorText}`);
  }
  
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  
  const body: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) {
    body.parents = [parentId];
  }
  
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`สร้างโฟลเดอร์ย่อยล้มเหลว: ${errorText}`);
  }
  
  const createData = await createRes.json();
  return createData.id;
}

export async function getOrCreateTargetUploadFolder(
  accessToken: string,
  category: string,
  fileName: string,
  subWorkType = ""
): Promise<string> {
  // 1. Get or create root "Upfile Data Center" folder
  const rootFolderId = await getOrCreateFolder(accessToken, 'Upfile Data Center');
  
  // 2. Get or create category folder inside "Upfile Data Center"
  let currentParentId = await getOrCreateFolderWithParent(accessToken, category, rootFolderId);
  
  // 2b. If category is "งานถอดติดตั้ง (AS)" and subWorkType is specified, create/get that subFolder
  if (category === 'งานถอดติดตั้ง (AS)' && subWorkType) {
    currentParentId = await getOrCreateFolderWithParent(accessToken, subWorkType, currentParentId);
  }
  
  // 3. Get or create subfolder inside parent folder named after the file (without extension)
  const folderName = fileName.replace(/\.[^/.]+$/, "");
  const targetFolderId = await getOrCreateFolderWithParent(accessToken, folderName, currentParentId);
  
  return targetFolderId;
}

export async function deleteTargetUploadFolder(
  accessToken: string,
  category: string,
  fileName: string,
  subWorkType = ""
): Promise<void> {
  try {
    // 1. Find root "Upfile Data Center" folder
    const rootQuery = `mimeType='application/vnd.google-apps.folder' and name='Upfile Data Center' and trashed=false`;
    const rootSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(rootQuery)}&fields=files(id)`;
    const rootSearchRes = await fetch(rootSearchUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!rootSearchRes.ok) return;
    const rootSearchData = await rootSearchRes.json();
    if (!rootSearchData.files || rootSearchData.files.length === 0) return;
    const rootFolderId = rootSearchData.files[0].id;

    // 2. Find category folder inside "Upfile Data Center"
    const catQuery = `mimeType='application/vnd.google-apps.folder' and name='${category}' and '${rootFolderId}' in parents and trashed=false`;
    const catSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(catQuery)}&fields=files(id)`;
    const catSearchRes = await fetch(catSearchUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!catSearchRes.ok) return;
    const catSearchData = await catSearchRes.json();
    if (!catSearchData.files || catSearchData.files.length === 0) return;
    let currentParentId = catSearchData.files[0].id;

    // 2b. If category is "งานถอดติดตั้ง (AS)" and subWorkType is specified
    if (category === 'งานถอดติดตั้ง (AS)' && subWorkType) {
      const subQuery = `mimeType='application/vnd.google-apps.folder' and name='${subWorkType}' and '${currentParentId}' in parents and trashed=false`;
      const subSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subQuery)}&fields=files(id)`;
      const subSearchRes = await fetch(subSearchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (subSearchRes.ok) {
        const subSearchData = await subSearchRes.json();
        if (subSearchData.files && subSearchData.files.length > 0) {
          currentParentId = subSearchData.files[0].id;
        }
      }
    }

    // 3. Find subfolder inside category folder named after the file (without extension)
    const folderName = fileName.replace(/\.[^/.]+$/, "");
    const folderQuery = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${currentParentId}' in parents and trashed=false`;
    const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)`;
    const folderSearchRes = await fetch(folderSearchUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!folderSearchRes.ok) return;
    const folderSearchData = await folderSearchRes.json();
    if (!folderSearchData.files || folderSearchData.files.length === 0) return;
    const targetFolderId = folderSearchData.files[0].id;

    // 4. Delete the target folder
    const deleteUrl = `https://www.googleapis.com/drive/v3/files/${targetFolderId}`;
    const deleteRes = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (deleteRes.ok || deleteRes.status === 204) {
      console.log(`Deleted GDrive folder: ${folderName} (${targetFolderId})`);
    } else {
      console.warn(`Failed to delete GDrive folder: ${deleteRes.statusText}`);
    }
  } catch (err) {
    console.error("Error deleting GDrive folder:", err);
  }
}

export async function directUploadToGDrive(
  accessToken: string,
  file: File,
  parentFolderId: string,
  customName = ""
): Promise<GDriveUploadResponse> {
  const uploadName = customName || file.name;
  const mimeType = file.type || getMimeTypeFromExt(uploadName);
  const metaBody: { name: string; mimeType: string; parents?: string[] } = {
    name: uploadName,
    mimeType: mimeType
  };
  if (parentFolderId) {
    metaBody.parents = [parentFolderId];
  }
  
  const createMetaRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metaBody)
  });
  
  if (!createMetaRes.ok) {
    const errorText = await createMetaRes.text();
    throw new Error(`สร้าง Metadata ไฟล์บน Drive ล้มเหลว: ${errorText}`);
  }
  
  const fileData = await createMetaRes.json();
  const fileId = fileData.id;
  
  const uploadContentRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': mimeType
    },
    body: file
  });
  
  if (!uploadContentRes.ok) {
    const errorText = await uploadContentRes.text();
    throw new Error(`อัปโหลดเนื้อหาไฟล์ล้มเหลว: ${errorText}`);
  }
  
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });
  } catch (permErr) {
    console.warn("Failed to set public view permission for GDrive file:", permErr);
  }
  
  return {
    id: fileId,
    url: `https://drive.google.com/uc?export=view&id=${fileId}`,
    webViewLink: fileData.webViewLink
  };
}

export async function getValidAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const cached = localStorage.getItem('cfg_gdrive_prefs_cache');
    if (!cached) return null;

    const prefs = JSON.parse(cached);
    if (!prefs.connected) return null;

    const now = Date.now();
    // If still valid with 2-minute buffer, return cached token
    if (prefs.accessToken && prefs.tokenExpiresAt && now < prefs.tokenExpiresAt - 120000) {
      return prefs.accessToken;
    }

    // Token expired or close to expiry — call backend to refresh automatically
    console.log('GDrive Access Token expired. Refreshing via backend API...');

    const res = await fetch('/api/gdrive/refresh', { method: 'POST' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Backend refresh failed:', errData);
      return null;
    }

    const data = await res.json();
    if (!data.accessToken) return null;

    // Update local cache with the new token
    const updatedPrefs = {
      ...prefs,
      accessToken: data.accessToken,
      tokenExpiresAt: data.tokenExpiresAt,
    };
    localStorage.setItem('cfg_gdrive_prefs_cache', JSON.stringify(updatedPrefs));

    console.log('GDrive Access Token refreshed successfully.', data.refreshed ? '(new token)' : '(still valid)');
    return data.accessToken;
  } catch (e) {
    console.error('Error in getValidAccessToken:', e);
    return null;
  }
}

