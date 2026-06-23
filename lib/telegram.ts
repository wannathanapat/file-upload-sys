export async function sendTelegramDirect(
  token: string,
  chatId: string,
  message: string
): Promise<any> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  // Set up standard abort controller for 10 seconds timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error: ${errorText}`);
    }
    
    return await response.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("ระบบแจ้งเตือน Telegram หมดเวลาเชื่อมต่อ (Timeout 10s)");
    }
    throw err;
  }
}
