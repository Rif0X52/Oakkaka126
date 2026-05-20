import TelegramBot from 'node-telegram-bot-api';
import https from 'https';
import { log } from './vite';

export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8209169673:AAHPACEk6ftCHfSR_oDggmB_6yOPIWMfiN4';
export const ADMIN_IDS = ['5286005736', '8566122835'];

// Mutable config object (object properties are live references in CommonJS)
export const botConfig = { BOT_USERNAME: 'hamyafkabot' };

export const BONUS_AMOUNT = 2500;
export const BONUS_COOLDOWN = 12 * 60 * 60 * 1000; // 12 hours in ms

// HTTPS agent for Docker/TLS compatibility
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

// Safe number parsing (handles scientific notation, very large numbers)
export function safeParseInt(value: string | null | undefined, defaultValue: number = 0): number {
  if (!value) return defaultValue;
  const floatValue = parseFloat(value);
  if (isNaN(floatValue) || !isFinite(floatValue)) return defaultValue;
  if (floatValue > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  if (floatValue < 0) return Math.max(0, Math.floor(floatValue));
  return Math.floor(floatValue);
}

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');

// Single bot instance shared across all modules
export const bot = new TelegramBot(BOT_TOKEN, { request: requestOptions });

// Send message to all admins — used by many modules
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
