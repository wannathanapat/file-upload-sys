// ==========================================
// AS INS Storage System & Notification API
// ==========================================

function doGet(e) {
  return HtmlService.createHtmlOutput('AS INS File Upload and Notification API is running...');
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    let responseData = { success: false, message: 'Invalid action' };

    if (action === 'uploadFile') {
      responseData = handleFileUpload(payload);
    } else if (action === 'sendLineNotification') {
      responseData = handleSendLineNotification(payload);
    } else if (action === 'sendTelegramNotification') {
      responseData = handleSendTelegramNotification(payload);
    }

    return createJsonResponse(responseData);
  } catch (err) {
    return createJsonResponse({ success: false, message: 'Error: ' + err.toString() });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .addHeader('Access-Control-Allow-Origin', '*')
    .addHeader('Access-Control-Allow-Headers', '*');
}

// ==========================================
// 1. Google Drive File Upload Handlers
// ==========================================
function handleFileUpload(payload) {
  try {
    const fileData = payload.fileData.split(',')[1] || payload.fileData;
    const decodedFile = Utilities.base64Decode(fileData);
    const blob = Utilities.newBlob(decodedFile, getMimeType(payload.fileName), payload.fileName);
    
    let parentFolder;
    
    // Check if dynamic parentFolderId is provided by client settings
    if (payload.parentFolderId) {
      try {
        parentFolder = DriveApp.getFolderById(payload.parentFolderId);
      } catch (e) {
        console.warn("Could not retrieve custom parent folder ID: " + payload.parentFolderId + ", falling back to default.", e);
      }
    }
    
    // Fallback: If no custom parentFolderId or retrieval fails, locate/create default parent folder
    if (!parentFolder) {
      let rootCenterFolder;
      const rootFolders = DriveApp.getFoldersByName('AS_INS_Center');
      if (rootFolders.hasNext()) {
        rootCenterFolder = rootFolders.next();
      } else {
        rootCenterFolder = DriveApp.createFolder('AS_INS_Center');
      }
      
      const categoryName = payload.workType || 'งานทั่วไป';
      const catFolders = rootCenterFolder.getFoldersByName(categoryName);
      if (catFolders.hasNext()) {
        parentFolder = catFolders.next();
      } else {
        parentFolder = rootCenterFolder.createFolder(categoryName);
      }
    }
    
    let targetFolder;
    
    // For video uploads, we can place them in the same subfolder as their corresponding PDF using subFolderId
    if (payload.subFolderId) {
      try {
        targetFolder = DriveApp.getFolderById(payload.subFolderId);
      } catch (e) {
        console.warn("Could not retrieve subFolderId: " + payload.subFolderId + ", creating new subfolder.", e);
      }
    }
    
    // Create new subfolder named by timestamp for this upload if not provided
    if (!targetFolder) {
      const folderName = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");
      targetFolder = parentFolder.createFolder(folderName);
    }
    
    const file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return {
      success: true,
      fileUrl: file.getUrl(),
      folderId: targetFolder.getId(),
      message: 'อัปโหลดไฟล์เสร็จสมบูรณ์'
    };
  } catch (err) {
    return { success: false, message: 'อัปโหลดไฟล์ล้มเหลว: ' + err.toString() };
  }
}

function getMimeType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'avi') return 'video/x-msvideo';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return 'application/octet-stream';
}

// ==========================================
// 2. Notification Proxy Handlers (LINE / Telegram)
// ==========================================
function handleSendLineNotification(payload) {
  try {
    const token = payload.token;
    const message = payload.message;
    
    if (!token || !message) {
      return { success: false, message: 'Missing token or message' };
    }
    
    const url = 'https://notify-api.line.me/api/notify';
    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      payload: {
        message: message
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    const result = JSON.parse(responseText);
    
    if (responseCode === 200 && result.status === 200) {
      return { success: true, message: 'ส่งข้อความแจ้งเตือนทาง LINE เรียบร้อยแล้ว' };
    } else {
      return { success: false, message: 'LINE Notify Error: ' + (result.message || responseText) };
    }
  } catch (err) {
    return { success: false, message: 'LINE Notify Exception: ' + err.toString() };
  }
}

function handleSendTelegramNotification(payload) {
  try {
    const token = payload.token;
    const chatId = payload.chatId;
    const message = payload.message;
    
    if (!token || !chatId || !message) {
      return { success: false, message: 'ข้อมูลไม่ครบถ้วน (Token, Chat ID หรือ Message ขาดหาย)' };
    }
    
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      }),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    const result = JSON.parse(responseText);
    
    if (responseCode === 200 && result.ok) {
      return { success: true, message: 'ส่งข้อความแจ้งเตือนทาง Telegram เรียบร้อยแล้ว' };
    } else {
      return { success: false, message: 'Telegram Error: ' + (result.description || responseText) };
    }
  } catch (err) {
    return { success: false, message: 'Telegram Exception: ' + err.toString() };
  }
}
