import TelegramBot from 'node-telegram-bot-api';
import https from 'https';
import { log } from './vite';

export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const ADMIN_IDS = ['5286005736', '8566122835'];

export const botConfig = { BOT_USERNAME: 'hamyafkabot' };

export const BONUS_AMOUNT = 2500;
export const BONUS_COOLDOWN = 12 * 60 * 60 * 1000;

export const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 5,
  rejectUnauthorized: true,
});

export const requestOptions = {
  agent: httpsAgent,
  timeout: 30000,
  forever: true,
};

export function safeParseInt(value: string | null | undefined, defaultValue: number = 0): number {
  if (!value) return defaultValue;
  const floatValue = parseFloat(value);
  if (isNaN(floatValue) || !isFinite(floatValue)) return defaultValue;
  if (floatValue > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  if (floatValue < 0) return Math.max(0, Math.floor(floatValue));
  return Math.floor(floatValue);
}

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');

export const bot = new TelegramBot(BOT_TOKEN, { request: requestOptions });

export async function notifyAllAdmins(message: string, keyboard?: any) {
  try {
    const options: any = keyboard ? { reply_markup: keyboard } : {};
    for (const adminId of ADMIN_IDS) {
      await bot.sendMessage(adminId, message, options).catch(() => {});
    }
    log(`Admin notification sent: ${message.substring(0, 50)}...`);
  } catch (error) {
    log(`Error sending admin notification: ${error}`);
  }
}
