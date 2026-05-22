import TelegramBot from 'node-telegram-bot-api';
import https from 'https';
import type { RequestOptions } from 'node-telegram-bot-api';
import { log } from './vite';
import { BOT_TOKEN } from './bot-shared';
const ADMIN_ID = '5286005736'; // Admin Telegram ID

const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 10000, maxSockets: 2 });

// Create bot instance for notifications
const notificationBot = new TelegramBot(BOT_TOKEN, {
  request: { agent: httpsAgent, timeout: 30000, forever: true } as RequestOptions
});

// Admin notification functions
export async function notifyAdminError(title: string, errorMessage: string, userId?: string) {
  try {
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    let message = `🚨 ОШИБКА\n\n`;
    message += `📝 ${title}\n`;
    message += `⏰ ${timestamp}\n`;
    if (userId) {
      message += `👤 Пользователь ID: ${userId}\n`;
    }
    message += `💾 Детали:\n${errorMessage}`;
    
    await notificationBot.sendMessage(ADMIN_ID, message);
    log(`Admin notified about error: ${title}`);
  } catch (error) {
    log(`Failed to notify admin about error: ${error}`);
  }
}

export async function notifyAdminTaskCreated(creatorNickname: string, creatorId: string, taskType: string, taskTitle: string, totalAmount: string) {
  try {
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    let message = `✅ НОВОЕ ЗАДАНИЕ\n\n`;
    message += `👤 Создатель: ${creatorNickname} (ID: ${creatorId})\n`;
    message += `📝 Тип: ${getTaskTypeText(taskType)}\n`;
    message += `🏷️ Название: ${taskTitle}\n`;
    message += `💰 Сумма: ${totalAmount} хамяфков\n`;
    message += `⏰ ${timestamp}`;
    
    await notificationBot.sendMessage(ADMIN_ID, message);
    log(`Admin notified about task creation by ${creatorNickname}`);
  } catch (error) {
    log(`Failed to notify admin about task creation: ${error}`);
  }
}

export async function notifyAdminUserRegistered(nickname: string, telegramId: string, referredBy?: string) {
  try {
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    let message = `🎉 НОВАЯ РЕГИСТРАЦИЯ\n\n`;
    message += `👤 Никнейм: ${nickname}\n`;
    message += `🆔 Telegram ID: ${telegramId}\n`;
    if (referredBy) {
      // We'll skip referrer lookup here to avoid circular imports
      message += `👥 Реферальный ID: ${referredBy}\n`;
    }
    message += `⏰ ${timestamp}`;
    
    await notificationBot.sendMessage(ADMIN_ID, message);
    log(`Admin notified about user registration: ${nickname}`);
  } catch (error) {
    log(`Failed to notify admin about user registration: ${error}`);
  }
}

export async function notifyAdminClanCreated(creatorNickname: string, creatorId: string, clanName: string) {
  try {
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    let message = `🏰 НОВЫЙ КЛАН СОЗДАН\n\n`;
    message += `👤 Создатель: ${creatorNickname} (ID: ${creatorId})\n`;
    message += `🏷️ Название клана: ${clanName}\n`;
    message += `⏰ ${timestamp}`;
    
    await notificationBot.sendMessage(ADMIN_ID, message);
    log(`Admin notified about clan creation by ${creatorNickname}`);
  } catch (error) {
    log(`Failed to notify admin about clan creation: ${error}`);
  }
}

export async function notifyAdminClanDeleted(clanName: string, clanId: string, deletedByNickname: string, deletedById: string) {
  try {
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    let message = `🗑️ КЛАН УДАЛЕН\n\n`;
    message += `🏷️ Название: ${clanName}\n`;
    message += `🆔 ID клана: ${clanId}\n`;
    message += `👤 Удалил: ${deletedByNickname} (ID: ${deletedById})\n`;
    message += `⏰ ${timestamp}`;
    
    await notificationBot.sendMessage(ADMIN_ID, message);
    log(`Admin notified about clan deletion: ${clanName}`);
  } catch (error) {
    log(`Failed to notify admin about clan deletion: ${error}`);
  }
}

export async function notifyAdminPenalty(userNickname: string, userId: string, penaltyAmount: string, reason: string) {
  try {
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    let message = `⚠️ ШТРАФ ВЫДАН\n\n`;
    message += `👤 Пользователь: ${userNickname} (ID: ${userId})\n`;
    message += `💸 Сумма штрафа: ${penaltyAmount} хамяфков\n`;
    message += `📋 Причина: ${reason}\n`;
    message += `⏰ ${timestamp}`;
    
    await notificationBot.sendMessage(ADMIN_ID, message);
    log(`Admin notified about penalty issued to ${userNickname}`);
  } catch (error) {
    log(`Failed to notify admin about penalty: ${error}`);
  }
}

function getTaskTypeText(type: string): string {
  switch (type) {
    case 'channel': return 'Подписка на канал';
    case 'chat': return 'Подписка на чат';
    case 'post_view': return 'Просмотр поста';
    case 'reaction': return 'Реакция на пост';
    default: return type;
  }
}