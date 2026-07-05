// Minimal Telegram sender. The agent reports its own completion so n8n never has to
// watch for it. Node 18+ has global fetch, so there is no dependency here.

const token = process.env.TELEGRAM_BOT_TOKEN;

export async function sendMessage(chatId, text) {
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN not set — skipping confirmation:', text);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.warn('Telegram sendMessage HTTP', res.status, await res.text());
    }
  } catch (err) {
    // A failed confirmation must never crash the worker — the file is already saved.
    console.warn('Telegram sendMessage error:', err.message);
  }
}
