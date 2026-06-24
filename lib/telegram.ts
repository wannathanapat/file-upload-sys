export async function sendTelegramDirect(
  token: string,
  chatId: string,
  message: string
): Promise<any> {
  // Set up standard abort controller for 30 seconds timeout to allow for Next.js dev mode compilation
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch('/api/telegram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token,
        chatId,
        message
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
