import { bot, botConfig, ADMIN_IDS, safeParseInt, notifyAllAdmins } from './bot-shared';
import { storage } from './storage';
import { log } from './vite';
import type { BotUser, AdTask } from '@shared/schema';

async function handleBalanceCheck(msg: any) {
  try {
    const userId = msg.from?.id.toString();
    const chatId = msg.chat.id;

    if (!userId) {
      return;
    }

    // Get user from storage
    const user = await storage.getBotUserByTelegramId(userId);

    if (!user || !user.isRegistered) {
      await bot.sendMessage(chatId, 'Вы не зарегистрированы в боте. Напишите боту в личные сообщения для регистрации.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const balance = parseInt(user.hamsters || '0');

    await bot.sendMessage(chatId, `${user.nickname}, ваш баланс: ${balance} хамяфков`, {
      reply_to_message_id: msg.message_id
    });

    log(`Balance check for user ${user.nickname}: ${balance} hamsters`);
  } catch (error: any) {
    log(`Error handling balance check: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при проверке баланса.', {
      reply_to_message_id: msg.message_id
    });
  }
}

// Hamsters transfer function
async function handleHamstersTransfer(msg: any) {
  try {
    const senderId = msg.from?.id.toString();
    const receiverId = msg.reply_to_message?.from?.id.toString();
    const text = msg.text || '';
    const chatId = msg.chat.id;

    if (!senderId || !receiverId || senderId === receiverId) {
      return; // Invalid transfer
    }

    // Parse amount from message (х 100, х100, Х 100, etc.)
    const amountMatch = text.match(/[хХ]\s*(\d+)/);
    if (!amountMatch) {
      return; // Invalid format
    }

    const amount = parseInt(amountMatch[1]);
    if (isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, 'Неверная сумма для передачи.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    if (amount < 10) {
      await bot.sendMessage(chatId, 'Минимальная сумма для передачи: 10 хамяфков.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Get sender and receiver users
    const senderUser = await storage.getBotUserByTelegramId(senderId);
    const receiverUser = await storage.getBotUserByTelegramId(receiverId);

    if (!senderUser || !senderUser.isRegistered) {
      await bot.sendMessage(chatId, 'Вы не зарегистрированы в боте. Напишите боту в личные сообщения для регистрации.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    if (!receiverUser || !receiverUser.isRegistered) {
      await bot.sendMessage(chatId, 'Получатель не зарегистрирован в боте.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Check sender balance
    const senderBalance = parseInt(senderUser.hamsters || '0');
    if (senderBalance < amount) {
      await bot.sendMessage(chatId, `У вас недостаточно хамяфков. Ваш баланс: ${senderBalance} хамяфков.`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Perform transfer
    const newSenderBalance = senderBalance - amount;
    const receiverBalance = parseInt(receiverUser.hamsters || '0');
    const newReceiverBalance = receiverBalance + amount;

    // Update balances
    await storage.updateBotUser(senderUser.id, { hamsters: newSenderBalance.toString() });
    await storage.updateBotUser(receiverUser.id, { hamsters: newReceiverBalance.toString() });

    // Send confirmation message
    const senderName = senderUser.nickname;
    const receiverName = receiverUser.nickname;

    await bot.sendMessage(chatId,
      `${senderName} передал ${amount} хамяфков ${receiverName}`,
      {
        reply_to_message_id: msg.message_id
      }
    );

    // Notify sender and receiver in private messages
    try {
      await bot.sendMessage(senderUser.telegramId,
        `Вы передали ${amount} хамяфков пользователю ${receiverName}.\n` +
        `Ваш новый баланс: ${newSenderBalance} хамяфков.`
      );
    } catch (error) {
      // Ignore if can't send private message to sender
    }

    try {
      await bot.sendMessage(receiverUser.telegramId,
        `Вы получили ${amount} хамяфков от пользователя ${senderName}.\n` +
        `Ваш новый баланс: ${newReceiverBalance} хамяфков.`
      );
    } catch (error) {
      // Ignore if can't send private message to receiver
    }

    // Notify admin about transfer
    await notifyAdminTransfer(senderUser, receiverUser, amount, newSenderBalance, newReceiverBalance);

    log(`Hamsters transfer: ${senderName} -> ${receiverName}, amount: ${amount}`);
  } catch (error: any) {
    log(`Error handling hamsters transfer: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при передаче хамяфков.', {
      reply_to_message_id: msg.message_id
    });
  }
}

// Notify admin about hamsters transfer
async function notifyAdminTransfer(sender: BotUser, receiver: BotUser, amount: number, senderBalance: number, receiverBalance: number) {
  try {
    const adminMessage = `Передача хамяфков!

От: ${sender.nickname} (${sender.telegramId})
Кому: ${receiver.nickname} (${receiver.telegramId})
Сумма: ${amount} хамяфков

Баланс отправителя: ${senderBalance} хамяфков
Баланс получателя: ${receiverBalance} хамяфков
Дата: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for transfer: ${sender.nickname} -> ${receiver.nickname}`);
  } catch (error) {
    log(`Error sending admin transfer notification: ${error}`);
  }
}

// Casino roulette system
const rouletteBets = new Map<string, { userId: string, color: 'red' | 'black', amount: number, nickname: string }>();

// Handle roulette bet (х к 100 or х ч 100)
async function handleRouletteBet(msg: any) {
  try {
    const userId = msg.from?.id.toString();
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (!userId) return;

    // Parse bet: х к 100 or х ч 100
    const betMatch = text.toLowerCase().match(/^х\s+([кч])\s+(\d+)$/);
    if (!betMatch) return;

    const colorLetter = betMatch[1];
    const amount = parseInt(betMatch[2]);
    const color = colorLetter === 'к' ? 'red' : 'black';

    if (isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, 'Неверная сумма ставки.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    if (amount < 10) {
      await bot.sendMessage(chatId, 'Минимальная ставка: 10 хамяфков.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Get user from storage
    const user = await storage.getBotUserByTelegramId(userId);
    if (!user || !user.isRegistered) {
      await bot.sendMessage(chatId, 'Вы не зарегистрированы в боте. Напишите боту в личные сообщения для регистрации.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Check user balance
    const userBalance = safeParseInt(user.hamsters);
    if (userBalance < amount) {
      await bot.sendMessage(chatId, `У вас недостаточно хамяфков. Ваш баланс: ${userBalance} хамяфков.`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Store bet
    const betKey = `${chatId}_${userId}`;
    rouletteBets.set(betKey, {
      userId,
      color,
      amount,
      nickname: user.nickname
    });

    const colorText = color === 'red' ? 'красный' : 'черный';
    await bot.sendMessage(chatId,
      `${user.nickname} поставил ${amount} хамяфков на ${colorText}!\n\n` +
      `Для запуска рулетки напишите: х го`,
      {
        reply_to_message_id: msg.message_id
      }
    );

    log(`Roulette bet: ${user.nickname} bet ${amount} on ${color}`);
  } catch (error: any) {
    log(`Error handling roulette bet: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при размещении ставки.', {
      reply_to_message_id: msg.message_id
    });
  }
}

// Handle roulette spin (х го)
async function handleRouletteSpin(msg: any) {
  try {
    const chatId = msg.chat.id;
    const spinUserId = msg.from?.id.toString();

    if (!spinUserId) return;

    // Get all bets for this chat
    const chatBets = [];
    for (const [key, bet] of rouletteBets.entries()) {
      if (key.startsWith(`${chatId}_`)) {
        chatBets.push({ key, ...bet });
      }
    }

    if (chatBets.length === 0) {
      await bot.sendMessage(chatId, 'Нет активных ставок для рулетки!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Generate random color (50/50 chance)
    const winningColor = Math.random() >= 0.5 ? 'red' : 'black';
    const colorText = winningColor === 'red' ? 'красный' : 'черный';
    const colorCircle = winningColor === 'red' ? '🔴' : '⚫';

    await bot.sendMessage(chatId,
      `🎰 РУЛЕТКА КРУТИТСЯ... 🎰\n\n` +
      `${colorCircle} Выпал ${colorText}! ${colorCircle}`,
      {
        reply_to_message_id: msg.message_id
      }
    );

    // Process all bets
    const winners = [];
    const losers = [];

    for (const bet of chatBets) {
      const user = await storage.getBotUserByTelegramId(bet.userId);
      if (!user) continue;

      const currentBalance = parseInt(user.hamsters || '0');

      if (bet.color === winningColor) {
        // Winner: gets 2x their bet
        const winAmount = bet.amount * 2;
        const newBalance = currentBalance + winAmount;

        await storage.updateBotUser(user.id, { hamsters: newBalance.toString() });

        winners.push({
          nickname: bet.nickname,
          bet: bet.amount,
          won: winAmount,
          newBalance
        });
      } else {
        // Loser: loses their bet
        const newBalance = Math.max(0, currentBalance - bet.amount);

        await storage.updateBotUser(user.id, { hamsters: newBalance.toString() });

        losers.push({
          nickname: bet.nickname,
          lost: bet.amount,
          newBalance
        });
      }

      // Remove bet
      rouletteBets.delete(bet.key);
    }

    // Send results
    let resultText = `🎰 РЕЗУЛЬТАТЫ РУЛЕТКИ 🎰\n\n`;
    resultText += `${colorCircle} Выпал: ${colorText} ${colorCircle}\n\n`;

    if (winners.length > 0) {
      resultText += `🏆 ПОБЕДИТЕЛИ:\n`;
      for (const winner of winners) {
        resultText += `• ${winner.nickname}: +${winner.won} хамяфков (баланс: ${winner.newBalance})\n`;
      }
      resultText += `\n`;
    }

    if (losers.length > 0) {
      resultText += `💸 ПРОИГРАВШИЕ:\n`;
      for (const loser of losers) {
        resultText += `• ${loser.nickname}: -${loser.lost} хамяфков (баланс: ${loser.newBalance})\n`;
      }
    }

    await bot.sendMessage(chatId, resultText);

    // Notify admin about roulette results
    await notifyAdminRoulette(chatId, winningColor, winners, losers);

    log(`Roulette spin in chat ${chatId}: ${winningColor} won, ${winners.length} winners, ${losers.length} losers`);
  } catch (error: any) {
    log(`Error handling roulette spin: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при запуске рулетки.', {
      reply_to_message_id: msg.message_id
    });
  }
}

// Notify admin about roulette results
async function notifyAdminRoulette(chatId: number, winningColor: string, winners: any[], losers: any[]) {
  try {
    const colorText = winningColor === 'red' ? 'красный' : 'черный';

    let adminMessage = `🎰 Рулетка в чате ${chatId}!\n\n`;
    adminMessage += `Выпал: ${colorText}\n`;
    adminMessage += `Победителей: ${winners.length}\n`;
    adminMessage += `Проигравших: ${losers.length}\n\n`;

    if (winners.length > 0) {
      adminMessage += `Победители:\n`;
      for (const winner of winners) {
        adminMessage += `• ${winner.nickname}: +${winner.won} хамяфков\n`;
      }
    }

    if (losers.length > 0) {
      adminMessage += `\nПроигравшие:\n`;
      for (const loser of losers) {
        adminMessage += `• ${loser.nickname}: -${loser.lost} хамяфков\n`;
      }
    }

    adminMessage += `\nДата: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for roulette in chat ${chatId}`);
  } catch (error) {
    log(`Error sending admin roulette notification: ${error}`);
  }
}

// Task Management Functions
async function showMyTasks(chatId: number, user: BotUser) {
  try {
    const userTasks = await storage.getUserAdTasks(user.id);

    if (userTasks.length === 0) {
      await bot.sendMessage(chatId, `Мои задания

У вас пока нет активных заданий.`);
      return;
    }

    let tasksText = `Мои задания

Ваши активные задания:

`;

    const buttons = [];

    for (const task of userTasks) {
      const subscribersGot = parseInt(task.subscribersGot || '0');
      const subscribersNeeded = parseInt(task.subscribersNeeded || '0');
      const remainingSubscribers = subscribersNeeded - subscribersGot;
      const isCompleted = remainingSubscribers <= 0;

      tasksText += `📝 ${task.title}\n`;
      tasksText += `🔗 ${task.link}\n`;
      tasksText += `👥 Подписчики: ${subscribersGot}/${subscribersNeeded}\n`;
      tasksText += `💰 Осталось: ${task.remainingAmount} хамяфков\n`;
      tasksText += `📊 Статус: ${isCompleted ? '✅ Завершено' : '🔄 В процессе'}\n\n`;

      // Можно удалить только незавершенные задания
      if (!isCompleted) {
        buttons.push([{
          text: `🗑 Удалить "${task.title}"`,
          callback_data: `delete_task_${task.id}`
        }]);
      }
    }

    buttons.push([{ text: '↩️ Назад', callback_data: 'additional_menu' }]);

    const keyboard = {
      inline_keyboard: buttons
    };

    await bot.sendMessage(chatId, tasksText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error showing my tasks: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке ваших заданий.');
  }
}

async function deleteUserTask(chatId: number, user: BotUser, taskId: string) {
  try {
    const task = await storage.getAdTask(taskId);

    if (!task || task.creatorId !== user.id) {
      await bot.sendMessage(chatId, 'Задание не найдено или у вас нет прав для его удаления.');
      return;
    }

    // Проверяем, что задание еще активно (не удалено ранее)
    if (!task.isActive) {
      await bot.sendMessage(chatId, `❌ Задание "${task.title}" уже было удалено ранее.`);
      return;
    }

    const subscribersGot = parseInt(task.subscribersGot || '0');
    const subscribersNeeded = parseInt(task.subscribersNeeded || '0');
    const isCompleted = subscribersGot >= subscribersNeeded;

    if (isCompleted) {
      await bot.sendMessage(chatId, `❌ Нельзя удалить завершенное задание "${task.title}".

Все подписчики уже получили награду.`);
      return;
    }

    // Правильный подсчет возврата средств
    const rewardPerSubscriber = parseInt(task.rewardPerSubscriber || '600');
    const remainingSubscribers = subscribersNeeded - subscribersGot;
    const refundAmount = remainingSubscribers * rewardPerSubscriber;

    const confirmText = `⚠️ Подтвердите удаление задания

📝 Задание: ${task.title}
Ссылка: ${task.link}
👥 Выполнено: ${subscribersGot}/${subscribersNeeded}
💰 К возврату: ${refundAmount} хамяфков

${subscribersGot > 0 ? `⚠️ Задание частично выполнено! ${subscribersGot} подписчиков уже получили награду.` : ''}

Вы уверены, что хотите удалить это задание?`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Да, удалить', callback_data: `confirm_delete_task_${taskId}` },
          { text: '❌ Отмена', callback_data: `cancel_delete_task_${taskId}` }
        ]
      ]
    };

    await bot.sendMessage(chatId, confirmText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error deleting user task: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при попытке удалить задание.');
  }
}

async function confirmDeleteTask(chatId: number, user: BotUser, taskId: string) {
  try {
    const task = await storage.getAdTask(taskId);

    if (!task || task.creatorId !== user.id) {
      await bot.sendMessage(chatId, 'Задание не найдено или у вас нет прав для его удаления.');
      return;
    }

    // Проверяем, что задание еще активно
    if (!task.isActive) {
      await bot.sendMessage(chatId, `❌ Задание "${task.title}" уже было удалено ранее.`);
      return;
    }

    const subscribersGot = parseInt(task.subscribersGot || '0');
    const subscribersNeeded = parseInt(task.subscribersNeeded || '0');
    const isCompleted = subscribersGot >= subscribersNeeded;

    if (isCompleted) {
      await bot.sendMessage(chatId, `❌ Нельзя удалить завершенное задание "${task.title}".`);
      return;
    }

    // Правильно рассчитываем возврат: количество оставшихся подписчиков * цену за подписчика
    const rewardPerSubscriber = parseInt(task.rewardPerSubscriber || '600');
    const remainingSubscribers = subscribersNeeded - subscribersGot;
    const refundAmount = remainingSubscribers * rewardPerSubscriber;
    const userCurrentBalance = parseInt(user.hamsters || '0');
    const newBalance = userCurrentBalance + refundAmount;

    // Обновляем баланс пользователя
    await storage.updateBotUser(user.id, { hamsters: newBalance.toString() });

    // Помечаем задание как неактивное
    await storage.updateAdTask(taskId, { isActive: false });

    // Отправляем подтверждение
    await bot.sendMessage(chatId, `✅ Задание "${task.title}" успешно удалено!

💰 Возвращено хамяфков: ${refundAmount}
💳 Ваш новый баланс: ${newBalance} хамяфков

${subscribersGot > 0 ? `📊 Задание было частично выполнено: ${subscribersGot} из ${subscribersNeeded} подписчиков получили награду.` : ''}`);

    // Уведомляем админа
    await notifyAdminTaskDeletion(user, task, refundAmount, subscribersGot, subscribersNeeded);

    // Возвращаемся к списку заданий
    setTimeout(() => showMyTasks(chatId, user), 2000);

    log(`Task deleted by user: ${task.title} by ${user.nickname}, refund: ${refundAmount}`);
  } catch (error) {
    log(`Error confirming task deletion: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при удалении задания.');
  }
}

async function notifyAdminTaskDeletion(user: BotUser, task: AdTask, refundAmount: number, subscribersGot: number, subscribersNeeded: number) {
  try {
    const adminMessage = `🗑 Задание удалено пользователем!

👤 Пользователь: ${user.nickname} (${user.telegramId})
📝 Задание: ${task.title}
Ссылка: ${task.link}
👥 Выполнено: ${subscribersGot}/${subscribersNeeded}
💰 Возвращено: ${refundAmount} хамяфков
📅 Дата удаления: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for task deletion: ${task.title} by ${user.nickname}`);
  } catch (error) {
    log(`Error sending admin task deletion notification: ${error}`);
  }
}

// Function to process web messages and send them via bot
export async function processWebMessages() {
  try {
    const webMessages = await storage.getUnprocessedWebMessages();

    for (const message of webMessages) {
      // Skip messages without text or target
      if (!message.messageText || (!message.targetUserId && !message.targetChatId)) {
        await storage.markWebMessageAsProcessed(message.id, false);
        continue;
      }

      try {
        const targetId = message.targetUserId || message.targetChatId;
        await bot.sendMessage(targetId, message.messageText);

        // Mark as processed
        await storage.markWebMessageAsProcessed(message.id);

        // Save the sent message to regular messages table
        await storage.createMessage({
          telegramChatId: targetId,
          telegramUserId: 'web',
          userName: 'Администратор',
          messageText: message.messageText,
          messageType: 'text',
          isFromBot: true
        });

        log(`Web message sent to ${targetId}: ${message.messageText}`);
      } catch (error) {
        log(`Error sending web message to ${message.targetUserId || message.targetChatId}: ${error}`);

        // Mark as failed
        await storage.markWebMessageAsProcessed(message.id, false);
      }
    }
  } catch (error) {
    log(`Error processing web messages: ${error}`);
  }
}

// Mute and admin management functions
async function handleHamstersTransferByIdentifier(msg: any, recipientIdentifier: string, amount: number) {
  try {
    const senderId = msg.from?.id.toString();
    const chatId = msg.chat.id;

    if (!senderId) return;

    if (amount < 10) {
      await bot.sendMessage(chatId, 'Минимальная сумма для передачи: 10 хамяфков.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const senderUser = await storage.getBotUserByTelegramId(senderId);
    if (!senderUser || !senderUser.isRegistered) {
      await bot.sendMessage(chatId, 'Вы не зарегистрированы в боте.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Find receiver by nickname or telegramId
    let receiverUser: BotUser | undefined;
    if (/^\d+$/.test(recipientIdentifier)) {
      // It's an ID
      receiverUser = await storage.getBotUserByTelegramId(recipientIdentifier);
    } else {
      // It's a nickname
      receiverUser = await storage.getBotUserByNickname(recipientIdentifier);
    }

    if (!receiverUser || !receiverUser.isRegistered) {
      await bot.sendMessage(chatId, `Пользователь "${recipientIdentifier}" не найден или не зарегистрирован.`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    if (senderUser.id === receiverUser.id) {
      await bot.sendMessage(chatId, 'Нельзя передать хамяфков самому себе.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Check sender balance
    const senderBalance = parseInt(senderUser.hamsters || '0');
    if (senderBalance < amount) {
      await bot.sendMessage(chatId, `У вас недостаточно хамяфков. Ваш баланс: ${senderBalance} хамяфков.`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Perform transfer
    const newSenderBalance = senderBalance - amount;
    const receiverBalance = parseInt(receiverUser.hamsters || '0');
    const newReceiverBalance = receiverBalance + amount;

    await storage.updateBotUser(senderUser.id, { hamsters: newSenderBalance.toString() });
    await storage.updateBotUser(receiverUser.id, { hamsters: newReceiverBalance.toString() });

    await bot.sendMessage(chatId,
      `${senderUser.nickname} передал ${amount} хамяфков ${receiverUser.nickname}`,
      { reply_to_message_id: msg.message_id }
    );

    try {
      await bot.sendMessage(senderUser.telegramId,
        `Вы передали ${amount} хамяфков пользователю ${receiverUser.nickname}.
Ваш новый баланс: ${newSenderBalance} хамяфков.`
      );
    } catch (e) { /* ignore */ }

    try {
      await bot.sendMessage(receiverUser.telegramId,
        `Вы получили ${amount} хамяфков от пользователя ${senderUser.nickname}.
Ваш новый баланс: ${newReceiverBalance} хамяфков.`
      );
    } catch (e) { /* ignore */ }

    await notifyAdminTransfer(senderUser, receiverUser, amount, newSenderBalance, newReceiverBalance);
  } catch (error) {
    log(`Error in handleHamstersTransferByIdentifier: ${error}`);
  }
}

async function handleTop(msg: any, type: 'hamsters' | 'army') {
  try {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const telegramChatId = msg.chat.id.toString();

    // Get active user IDs in this chat
    const activeUserIds = await storage.getChatActiveUserIds(telegramChatId);
    if (activeUserIds.length === 0) {
      await bot.sendMessage(chatId, 'В этом чате пока нет активных участников.', {
        reply_to_message_id: messageId
      });
      return;
    }

    // Get all registered bot users matching these IDs
    const allUsers = await storage.getBotUsers();
    const chatUsers = allUsers.filter(u =>
      u.isRegistered && activeUserIds.includes(u.telegramId)
    );

    if (chatUsers.length === 0) {
      await bot.sendMessage(chatId, 'Нет зарегистрированных пользователей в этом чате.', {
        reply_to_message_id: messageId
      });
      return;
    }

    // Sort and get top 100
    const field = type === 'hamsters' ? 'hamsters' : 'armyHamsters';
    const sorted = chatUsers
      .sort((a, b) => safeParseInt(b[field]) - safeParseInt(a[field]))
      .slice(0, 100);

    const title = type === 'hamsters'
      ? '🐟 ТОП-100 по балансу хамяфов в этом чате'
      : '🛡️ ТОП-100 по армии в этом чате';

    let text = `${title}\n\n`;
    sorted.forEach((u, i) => {
      const val = safeParseInt(u[field]);
      text += `${i + 1}. ${u.nickname} — ${val} ${type === 'hamsters' ? 'хамяфов' : 'воинов'}\n`;
    });

    // Split messages longer than 4096 chars (Telegram limit)
    const MAX_LEN = 4000;
    if (text.length <= MAX_LEN) {
      await bot.sendMessage(chatId, text, { reply_to_message_id: messageId });
    } else {
      const parts = [];
      let current = '';
      for (const line of text.split('\n')) {
        if ((current + line + '\n').length > MAX_LEN) {
          parts.push(current);
          current = '';
        }
        current += line + '\n';
      }
      if (current.trim()) parts.push(current);
      for (let i = 0; i < parts.length; i++) {
        await bot.sendMessage(chatId, parts[i], i === 0 ? { reply_to_message_id: messageId } : {});
      }
    }
  } catch (error) {
    log(`Error in handleTop: ${error}`);
  }
}

async function handleTopPrivate(user: BotUser, type: 'hamsters' | 'army') {
  try {
    const chatId = Number(user.telegramId);
    const limit = 100;
    const users = type === 'hamsters'
      ? await storage.getTopHamsters(limit)
      : await storage.getTopArmyHamsters(limit);

    const title = type === 'hamsters'
      ? '🌟 Глобальный ТОП-100 по балансу хамяфов'
      : '🌟 Глобальный ТОП-100 по армии';

    let text = `${title}\n\n`;
    users.forEach((u, i) => {
      const field = type === 'hamsters' ? 'hamsters' : 'armyHamsters';
      const val = safeParseInt(u[field]);
      text += `${i + 1}. ${u.nickname} — ${val} ${type === 'hamsters' ? 'хамяфов' : 'воинов'}\n`;
    });

    // Split messages longer than 4096 chars (Telegram limit)
    const MAX_LEN = 4000;
    if (text.length <= MAX_LEN) {
      await bot.sendMessage(chatId, text);
    } else {
      const parts: string[] = [];
      let current = '';
      for (const line of text.split('\n')) {
        if ((current + line + '\n').length > MAX_LEN) {
          parts.push(current);
          current = '';
        }
        current += line + '\n';
      }
      if (current.trim()) parts.push(current);
      for (const part of parts) {
        await bot.sendMessage(chatId, part);
      }
    }
  } catch (error) {
    log(`Error in handleTopPrivate: ${error}`);

  }
}

export {
  handleBalanceCheck, handleHamstersTransfer, notifyAdminTransfer,
  rouletteBets, handleRouletteBet, handleRouletteSpin, notifyAdminRoulette,
  showMyTasks, deleteUserTask, confirmDeleteTask, notifyAdminTaskDeletion,
  handleHamstersTransferByIdentifier, handleTop, handleTopPrivate
};
