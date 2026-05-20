import { bot, botConfig, ADMIN_IDS, safeParseInt, notifyAllAdmins } from './bot-shared';
import { storage } from './storage';
import { log } from './vite';
import type { BotUser, AdTask } from '@shared/schema';
import { randomUUID } from 'crypto';
import { notifyAdminPenalty } from './notifications';
import { notifyTaskOwnerForReactionReview } from './bot-handlers-tasks';

async function showEarnMenu(chatId: number, user: BotUser) {
  const earnText = `Заработок хамяфков

Выберите тип заданий:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📢 Каналы', callback_data: 'earn_channels' }],
      [{ text: '💬 Чаты', callback_data: 'earn_chats' }],
      [{ text: '👁 Просмотр постов', callback_data: 'earn_post_views' }],
      [{ text: '👍 Реакции', callback_data: 'earn_reactions' }],
      [{ text: '⬅️ Назад', callback_data: 'back_to_main' }]
    ]
  };

  await bot.sendMessage(chatId, earnText, { reply_markup: keyboard });
}

async function showEarnChannels(chatId: number, user: BotUser) {
  try {
    const allTasks = await storage.getActiveAdTasks();

    // Filter channels created by other users
    const channelTasks = allTasks.filter(task =>
      task.creatorId !== user.id && task.type === 'channel'
    );

    if (channelTasks.length === 0) {
      await bot.sendMessage(chatId, `Каналы для подписки

Пока нет доступных каналов для заработка.
Заходите позже!`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Назад к меню заработка', callback_data: 'back_to_earn' }]
          ]
        }
      });
      return;
    }

    // Filter out completed tasks
    const userSubscriptions = await storage.getUserAdSubscriptions(user.id);
    const completedTaskIds = userSubscriptions
      .filter(sub => sub.rewardClaimed)
      .map(sub => sub.taskId);

    const availableChannels = channelTasks.filter(task => !completedTaskIds.includes(task.id));

    if (availableChannels.length === 0) {
      await bot.sendMessage(chatId, `Каналы для подписки

Вы уже выполнили все доступные задания по каналам!
Заходите позже за новыми заданиями.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Назад к меню заработка', callback_data: 'back_to_earn' }]
          ]
        }
      });
      return;
    }

    let earnText = `Каналы для подписки

Доступные каналы:

`;

    const buttons = [];

    for (const task of availableChannels.slice(0, 10)) {
      const remainingSubscribers = safeParseInt(task.subscribersNeeded) - safeParseInt(task.subscribersGot);
      if (remainingSubscribers <= 0) continue;

      earnText += `${task.title}\n`;
      earnText += `Ссылка: ${task.link}\n`;
      earnText += `Награда: ${task.rewardPerSubscriber} хамяфков\n`;
      earnText += `Осталось мест: ${remainingSubscribers}\n\n`;

      // Fix URL format for button
      let taskUrl = task.link;
      if (taskUrl.startsWith('@')) {
        taskUrl = `https://t.me/${taskUrl.substring(1)}`;
      } else if (!taskUrl.startsWith('http')) {
        taskUrl = `https://t.me/${taskUrl}`;
      }

      buttons.push([
        { text: `+${task.rewardPerSubscriber}`, url: taskUrl },
        { text: 'Проверить', callback_data: `check_${task.id}` }
      ]);
    }

    buttons.push([{ text: 'Назад к меню заработка', callback_data: 'back_to_earn' }]);

    const keyboard = {
      inline_keyboard: buttons
    };

    await bot.sendMessage(chatId, earnText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error showing earn channels: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке каналов.');
  }
}

async function showEarnPostViews(chatId: number, user: BotUser) {
  const availableTasks = await storage.getActiveAdTasks();
  const availablePostViews = availableTasks.filter(task =>
    task.type === 'post_view' &&
    task.creatorId !== user.id &&
    parseInt(task.remainingAmount || '0') > 0
  );

  let earnText = `Просмотр постов\n\nДоступные задания:\n\n`;

  if (availablePostViews.length === 0) {
    earnText += `Пока нет доступных заданий на просмотр постов.\n\nПроверьте позже!`;

    const keyboard = {
      inline_keyboard: [
        [{ text: 'Назад к заработку', callback_data: 'back_to_earn' }]
      ]
    };

    await bot.sendMessage(chatId, earnText, { reply_markup: keyboard });
    return;
  }

  const buttons = [];

  for (const task of availablePostViews.slice(0, 10)) {
    const remainingViews = safeParseInt(task.subscribersNeeded) - safeParseInt(task.subscribersGot);
    if (remainingViews <= 0) continue;

    earnText += `${task.title}\n`;
    earnText += `Награда: ${task.rewardPerSubscriber} хамяфек\n`;
    earnText += `Осталось мест: ${remainingViews}\n\n`;

    buttons.push([
      { text: `+${task.rewardPerSubscriber}`, callback_data: `view_post_${task.id}` },
      { text: 'Следующий', callback_data: `next_post_${task.id}` }
    ]);
  }

  buttons.push([{ text: 'Назад к заработку', callback_data: 'back_to_earn' }]);

  const keyboard = { inline_keyboard: buttons };

  await bot.sendMessage(chatId, earnText, { reply_markup: keyboard });
}

async function showEarnChats(chatId: number, user: BotUser) {
  try {
    const allTasks = await storage.getActiveAdTasks();

    // Filter chats created by other users
    const chatTasks = allTasks.filter(task =>
      task.creatorId !== user.id && task.type === 'chat'
    );

    if (chatTasks.length === 0) {
      await bot.sendMessage(chatId, `Чаты для вступления

Пока нет доступных чатов для заработка.
Заходите позже!`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Назад к меню заработка', callback_data: 'back_to_earn' }]
          ]
        }
      });
      return;
    }

    // Filter out completed tasks
    const userSubscriptions = await storage.getUserAdSubscriptions(user.id);
    const completedTaskIds = userSubscriptions
      .filter(sub => sub.rewardClaimed)
      .map(sub => sub.taskId);

    const availableChats = chatTasks.filter(task => !completedTaskIds.includes(task.id));

    if (availableChats.length === 0) {
      await bot.sendMessage(chatId, `Чаты для вступления

Вы уже выполнили все доступные задания по чатам!
Заходите позже за новыми заданиями.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Назад к меню заработка', callback_data: 'back_to_earn' }]
          ]
        }
      });
      return;
    }

    let earnText = `Чаты для вступления

Доступные чаты:

`;

    const buttons = [];

    for (const task of availableChats.slice(0, 10)) {
      const remainingSubscribers = safeParseInt(task.subscribersNeeded) - safeParseInt(task.subscribersGot);
      if (remainingSubscribers <= 0) continue;

      earnText += `${task.title}\n`;
      earnText += `Ссылка: ${task.link}\n`;
      earnText += `Награда: ${task.rewardPerSubscriber} хамяфков\n`;
      earnText += `Осталось мест: ${remainingSubscribers}\n\n`;

      // Fix URL format for button
      let taskUrl = task.link;
      if (taskUrl.startsWith('@')) {
        taskUrl = `https://t.me/${taskUrl.substring(1)}`;
      } else if (!taskUrl.startsWith('http')) {
        taskUrl = `https://t.me/${taskUrl}`;
      }

      buttons.push([
        { text: `+${task.rewardPerSubscriber}`, url: taskUrl },
        { text: 'Проверить', callback_data: `check_${task.id}` }
      ]);
    }

    buttons.push([{ text: 'Назад к меню заработка', callback_data: 'back_to_earn' }]);

    const keyboard = {
      inline_keyboard: buttons
    };

    await bot.sendMessage(chatId, earnText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error showing earn chats: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке чатов.');
  }
}

async function subscribeToTask(chatId: number, user: BotUser, taskId: string) {
  try {
    const task = await storage.getAdTask(taskId);
    if (!task || !task.isActive || parseInt(task.remainingAmount || '0') < 600) {
      await bot.sendMessage(chatId, 'Это задание больше не доступно.');
      return;
    }

    // Check if user already subscribed
    const existingSubscription = await storage.getAdSubscription(user.id, taskId);
    if (existingSubscription) {
      if (existingSubscription.rewardClaimed) {
        await bot.sendMessage(chatId, 'Вы уже выполнили это задание!');
        return;
      }

      // Allow re-checking
      await showSubscriptionCheck(chatId, user, task);
      return;
    }

    // Create new subscription record
    await storage.createAdSubscription({
      userId: user.id,
      taskId: taskId,
      subscribed: false,
      rewardClaimed: false,
      subscribedAt: null
    });

    await showSubscriptionInstructions(chatId, user, task);
  } catch (error) {
    log(`Error subscribing to task: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при подписке на задание.');
  }
}

async function showSubscriptionInstructions(chatId: number, user: BotUser, task: AdTask) {
  const typeText = task.type === 'channel' ? 'канал' : 'чат';

  const instructionText = `Подписка на ${typeText}

${task.title}
Награда: ${task.rewardPerSubscriber} хамяфков

Инструкция:
1. Нажмите кнопку ниже для перехода
2. Подпишитесь на ${typeText}
3. Вернитесь сюда и нажмите "Проверить"

ВАЖНО: Не отписывайтесь в течение 7 дней после получения награды! Иначе получите штраф 2000 хамяфков!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: `Перейти к ${typeText}`, url: task.link }],
      [{ text: 'Проверить', callback_data: `check_${task.id}` }],
      [{ text: 'Назад к меню заработка', callback_data: 'back_to_earn' }]
    ]
  };

  await bot.sendMessage(chatId, instructionText, { reply_markup: keyboard });
}

async function showSubscriptionCheck(chatId: number, user: BotUser, task: AdTask) {
  const typeText = task.type === 'channel' ? 'канал' : 'чат';

  const checkText = `Проверка подписки

Ссылка: ${task.link}

Если вы уже подписались, нажмите "Проверить подписку"`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Проверить подписку', callback_data: `check_${task.id}` }],
      [{ text: 'Назад к заработку', callback_data: 'back_to_earn' }]
    ]
  };

  await bot.sendMessage(chatId, checkText, { reply_markup: keyboard });
}

async function viewPost(chatId: number, user: BotUser, taskId: string) {
  try {
    const task = await storage.getAdTask(taskId);
    if (!task || !task.isActive || task.type !== 'post_view') {
      await bot.sendMessage(chatId, 'Это задание больше не доступно.');
      return;
    }

    // Check if user already viewed this post
    const existingSubscription = await storage.getAdSubscription(user.id, taskId);
    if (existingSubscription?.rewardClaimed) {
      await bot.sendMessage(chatId, 'Вы уже просмотрели этот пост!');
      return;
    }

    // Check if task still has budget
    const rewardAmount = safeParseInt(task.rewardPerSubscriber, 100);
    if (safeParseInt(task.remainingAmount) < rewardAmount) {
      await bot.sendMessage(chatId, 'К сожалению, бюджет этого задания исчерпан.');
      return;
    }

    // Forward or send the post content
    if (task.channelId && task.messageId) {
      try {
        // Try to forward the original message
        await bot.forwardMessage(chatId, task.channelId, parseInt(task.messageId));
      } catch (error) {
        // If forward fails, send the text content
        await bot.sendMessage(chatId, task.postMessage || 'Содержимое поста недоступно');
      }
    } else {
      // Send the saved post message
      await bot.sendMessage(chatId, task.postMessage || 'Содержимое поста недоступно');
    }

    // Wait 2 seconds as requested
    setTimeout(async () => {
      // Reward the user after 2 seconds
      if (!existingSubscription) {
        // Create subscription record
        await storage.createAdSubscription({
          userId: user.id,
          taskId: taskId,
          subscribed: true,
          rewardClaimed: true,
          subscribedAt: new Date().toISOString()
        });
      } else {
        // Update existing subscription
        await storage.updateAdSubscription(existingSubscription.id, {
          subscribed: true,
          rewardClaimed: true,
          subscribedAt: new Date().toISOString()
        });
      }

      // Give reward to user
      await storage.addHamsters(user.id, rewardAmount);

      // Update task statistics
      const newViewsGot = parseInt(task.subscribersGot || '0') + 1;
      const newRemainingAmount = parseInt(task.remainingAmount || '0') - rewardAmount;

      await storage.updateAdTask(taskId, {
        subscribersGot: newViewsGot.toString(),
        remainingAmount: newRemainingAmount.toString(),
        isActive: newRemainingAmount > 0
      });

      // Notify task creator
      const taskCreator = await storage.getBotUser(task.creatorId);
      if (taskCreator) {
        await bot.sendMessage(taskCreator.telegramId,
          `Новый просмотр поста!\n\n` +
          `${task.title}\n` +
          `Просмотров: ${newViewsGot}/${task.subscribersNeeded}\n` +
          `Остаток бюджета: ${newRemainingAmount} хамяфков`
        );
      }

      // Show next post automatically after 2 seconds
      setTimeout(() => {
        showEarnPostViews(chatId, user);
      }, 1000);

    }, 2000); // 2 second delay as requested

  } catch (error) {
    log(`Error viewing post: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при просмотре поста.');
  }
}

async function showNextPost(chatId: number, user: BotUser, currentTaskId: string) {
  // Simply show the post views menu again
  await showEarnPostViews(chatId, user);
}

async function checkSubscription(chatId: number, user: BotUser, taskId: string) {
  try {
    const task = await storage.getAdTask(taskId);
    if (!task || !task.isActive) {
      await bot.sendMessage(chatId, 'Это задание больше не доступно.');
      return;
    }

    let subscription = await storage.getAdSubscription(user.id, taskId);
    if (!subscription) {
      // Create subscription automatically when user checks for the first time
      subscription = await storage.createAdSubscription({
        userId: user.id,
        taskId: taskId,
        subscribed: false,
        rewardClaimed: false,
        subscribedAt: null
      });
    }

    if (subscription.rewardClaimed) {
      await bot.sendMessage(chatId, 'Вы уже получили награду за это задание!');
      return;
    }

    // Check if task still has budget
    const rewardAmount = parseInt(task.rewardPerSubscriber || '600');
    if (safeParseInt(task.remainingAmount) < rewardAmount) {
      await bot.sendMessage(chatId, 'К сожалению, бюджет этого задания исчерпан.');
      return;
    }

    // Real subscription check via Telegram API
    const subscriptionResult = await checkRealSubscription(user.telegramId, task.link);

    if (subscriptionResult.error) {
      await bot.sendMessage(chatId,
        `⚠️ Ошибка проверки подписки\n\n` +
        `Произошла временная ошибка при проверке подписки. Попробуйте еще раз через несколько минут.`
      );
      return;
    }

    if (subscriptionResult.subscribed) {
      // Update subscription record
      await storage.updateAdSubscription(subscription.id, {
        subscribed: true,
        rewardClaimed: true,
        subscribedAt: new Date().toISOString()
      });

      // Give reward to user
      await storage.addHamsters(user.id, rewardAmount);

      // Update task statistics
      const newSubscribersGot = parseInt(task.subscribersGot || '0') + 1;
      const newRemainingAmount = parseInt(task.remainingAmount || '0') - rewardAmount;

      await storage.updateAdTask(taskId, {
        subscribersGot: newSubscribersGot.toString(),
        remainingAmount: newRemainingAmount.toString(),
        isActive: newRemainingAmount > 0
      });

      // Schedule unsubscribe check in 7 days with 2000 hamsters penalty
      await scheduleUnsubscribeCheck(user.id, taskId, rewardAmount, 2000);

      // Notify task creator
      const taskCreator = await storage.getBotUser(task.creatorId);
      if (taskCreator) {
        await bot.sendMessage(taskCreator.telegramId,
          `Новый подписчик на ваш ${task.type === 'channel' ? 'канал' : 'чат'}!\n\n` +
          `${task.title}\n` +
          `Подписчиков: ${newSubscribersGot}/${task.subscribersNeeded}\n` +
          `Остаток бюджета: ${newRemainingAmount} хамяфков`
        );
      }

      await bot.sendMessage(chatId,
        `Поздравляем!\n\n` +
        `Подписка подтверждена ✅\n` +
        `Вы получили ${rewardAmount} хамяфков!\n\n` +
        `ВАЖНО: Если вы отпишетесь в течение 7 дней после получения награды, с вас будет списано 2000 хамяфков в качестве штрафа!\n\n` +
        `Спасибо за участие!`
      );

      // Show earn menu again
      setTimeout(() => showEarnMenu(chatId, user), 2000);
    } else {
      await bot.sendMessage(chatId,
        `❌ Подписка не найдена\n\n` +
        `Пожалуйста, убедитесь что вы:\n` +
        `1. Перешли по ссылке\n` +
        `2. Подписались на ${task.type === 'channel' ? 'канал' : 'чат'}\n` +
        `3. Не отписались после подписки\n\n` +
        `Попробуйте еще раз через несколько минут.`
      );
    }
  } catch (error) {
    log(`Error checking subscription: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при проверке подписки.');
  }
}

// Advertise menu functions
async function showAdvertiseMenu(chatId: number, user: BotUser) {
  const menuText = `Реклама

Выберите тип для рекламы:

Канал/Чат: от 600 до 2000 хамяфек за подписчика
Просмотр постов: от 100 до 500 хамяфек за просмотр
Реакции: от 600 до 1500 хамяфек за реакцию`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Рекламировать канал', callback_data: 'advertise_channel' }],
      [{ text: 'Рекламировать чат', callback_data: 'advertise_chat' }],
      [{ text: 'Просмотр постов', callback_data: 'advertise_post_view' }],
      [{ text: 'Реклама реакций', callback_data: 'advertise_reaction' }],
      [{ text: '❌ Отмена', callback_data: 'cancel_ad_creation' }],
      [{ text: 'Назад в главное меню', callback_data: 'back_to_main' }]
    ]
  };

  await bot.sendMessage(chatId, menuText, { reply_markup: keyboard });
}

async function startPostViewAd(chatId: number, user: BotUser) {
  await storage.updateBotUser(user.id, {
    registrationStep: 'creating_post_view'
  });

  const postText = `Просмотр постов

Отправьте ссылку на ваш канал откуда будет пересылаться пост:

• @channel_name
• https://t.me/channel_name

Пример: @my_channel

ВАЖНО: Не нужны права администратора. Просто отправьте ссылку на канал.

Если не хотите рекламировать - отправьте "отмена"`;

  const keyboard = {
    inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'cancel_ad_creation' }]]
  };

  await bot.sendMessage(chatId, postText, { reply_markup: keyboard });
}

async function startChannelAd(chatId: number, user: BotUser) {
  await storage.updateBotUser(user.id, {
    registrationStep: 'creating_ad_channel'
  });

  const channelText = `Реклама канала

ВАЖНО: Добавьте бота в ваш канал и сделайте его администратором, чтобы он мог проверять подписки!

Отправьте ссылку на ваш канал в формате:
• @channel_name
• https://t.me/channel_name

Пример: @my_channel

Если не хотите рекламировать - отправьте "отмена"`;

  const keyboard = {
    inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'cancel_ad_creation' }]]
  };

  await bot.sendMessage(chatId, channelText, { reply_markup: keyboard });
}

async function startChatAd(chatId: number, user: BotUser) {
  await storage.updateBotUser(user.id, {
    registrationStep: 'creating_ad_chat'
  });

  const chatText = `Реклама чата

ВАЖНО: Добавьте бота в ваш чат и сделайте его администратором, чтобы он мог проверять подписки!

Отправьте ссылку на ваш чат в формате:
• @chat_name
• https://t.me/chat_name

Пример: @my_chat

Если не хотите рекламировать - отправьте "отмена"`;

  const keyboard = {
    inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'cancel_ad_creation' }]]
  };

  await bot.sendMessage(chatId, chatText, { reply_markup: keyboard });
}

async function startReactionAd(chatId: number, user: BotUser) {
  const reactionText = `Реклама реакций

Выберите тип задания на реакцию:

1. Любая реакция - пользователи ставят любую реакцию на ваше сообщение
2. Реакция на фото - пользователи ставят реакцию на ваше фото

Цена: от 600 до 1500 хамяфков за реакцию`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Любая реакция', callback_data: 'reaction_type_1' }],
      [{ text: 'Реакция на фото', callback_data: 'reaction_type_2' }],
      [{ text: '❌ Отмена', callback_data: 'cancel_ad_creation' }],
      [{ text: 'Назад', callback_data: 'back_to_advertise' }]
    ]
  };

  await bot.sendMessage(chatId, reactionText, { reply_markup: keyboard });
}

async function handleReactionType(chatId: number, user: BotUser, reactionType: number) {
  await storage.updateBotUser(user.id, {
    password: JSON.stringify({ type: 'reaction', reactionType }),
    registrationStep: reactionType === 1 ? 'creating_reaction_ad' : 'awaiting_reaction_link'
  });

  if (reactionType === 1) {
    const messageText = `Любая реакция на сообщение

Отправьте ссылку на сообщение, на которое нужно поставить реакцию.

Формат ссылки:
https://t.me/channel_name/message_id

Пример:
https://t.me/my_channel/123

Эту ссылку получите, нажав "Поделиться" на нужном сообщении в Telegram.`;

    await bot.sendMessage(chatId, messageText);
  } else {
    const linkText = `Реакция на фото

Сначала отправьте ссылку на пост, где будет размещено ваше фото.

Формат ссылки:
https://t.me/channel_name/message_id

Пример:
https://t.me/my_channel/123

Эту ссылку получите, нажав "Поделиться" на нужном сообщении в Telegram.

После этого вы сможете отправить фото.`;

    await bot.sendMessage(chatId, linkText);
  }
}

async function handleReactionAdInput(chatId: number, user: BotUser, input: string) {
  const adInfo = JSON.parse(user.password || '{}');

  // Handle message link for both types of reactions
  if (adInfo.reactionType !== 1 && adInfo.reactionType !== 2) return;

  // Validate message link format
  const linkPattern = /^https:\/\/t\.me\/([^\/]+)\/(\d+)$/;
  const match = input.match(linkPattern);

  if (!match) {
    await bot.sendMessage(chatId, `Неверный формат ссылки!

Отправьте ссылку в формате:
https://t.me/channel_name/message_id

Пример:
https://t.me/my_channel/123`);
    return;
  }

  const channelName = match[1];
  const messageId = match[2];

  const nextStep = adInfo.reactionType === 1 ? 'awaiting_reaction_price' : 'awaiting_reaction_photo';

  await storage.updateBotUser(user.id, {
    password: JSON.stringify({
      ...adInfo,
      messageLink: input,
      channelName: channelName,
      messageId: messageId
    }),
    registrationStep: nextStep
  });

  if (adInfo.reactionType === 1) {
    await bot.sendMessage(chatId, `Ссылка на сообщение принята!

Канал: @${channelName}
Сообщение: ${messageId}

Укажите цену за реакцию (от 600 до 1500 хамяфков):`);
  } else {
    await bot.sendMessage(chatId, `Ссылка на пост принята!

Канал: @${channelName}
Сообщение: ${messageId}

Теперь отправьте фото, на которое пользователи будут ставить реакцию.`);
  }
}

async function handleReactionPhotoInput(chatId: number, user: BotUser, msg: any) {
  if (!msg.photo) {
    await bot.sendMessage(chatId, 'Пожалуйста, отправьте фото.');
    return;
  }

  const adInfo = JSON.parse(user.password || '{}');
  const photoFileId = msg.photo[msg.photo.length - 1].file_id;

    // Send the photo back for confirmation
  await bot.sendPhoto(chatId, photoFileId, {
    caption: 'Фото получено! Это фото будет использоваться для задания на реакцию.'
  });

  await storage.updateBotUser(user.id, {
    password: JSON.stringify({ ...adInfo, photoFileId }),
    registrationStep: 'awaiting_reaction_price'
  });

  await bot.sendMessage(chatId, `Фото сохранено!

Теперь укажите цену за реакцию (от 600 до 1500 хамяфков):`);
}


async function handleReactionPriceInput(chatId: number, user: BotUser, priceText: string) {
  const price = parseInt(priceText);

  if (isNaN(price) || price < 500 || price > 2000) {
    await bot.sendMessage(chatId, '❌ Неверная цена!\n\nУкажите цену от 500 до 2000 хамяфов.');
    return;
  }

  const adInfo = JSON.parse(user.password || '{}');
  await storage.updateBotUser(user.id, {
    password: JSON.stringify({ ...adInfo, price }),
    registrationStep: 'awaiting_reaction_count'
  });

  await bot.sendMessage(chatId, `✅ Цена за реакцию: ${price} хамяфов.\n\nСколько реакций вам нужно? (минимум 1):`);
}

async function handleReactionCountInput(chatId: number, user: BotUser, countText: string) {
  const count = parseInt(countText);

  if (isNaN(count) || count < 1) {
    await bot.sendMessage(chatId, 'Неверное количество реакций! Укажите число больше 0.');
    return;
  }

  const adInfo = JSON.parse(user.password || '{}');
  const price = adInfo.price || 600;
  const totalCost = count * price;
  const userBalance = safeParseInt(user.hamsters);

  if (totalCost > userBalance) {
    await bot.sendMessage(chatId,
      `Недостаточно средств!\n\n` +
      `Требуется: ${totalCost} хамяфков\n` +
      `Ваш баланс: ${userBalance} хамяфков\n` +
      `Не хватает: ${totalCost - userBalance} хамяфков`
    );
    return;
  }

  await storage.updateBotUser(user.id, {
    password: JSON.stringify({ ...adInfo, count, totalCost }),
    registrationStep: 'awaiting_reaction_proof'
  });

  let confirmationMessage = `Подтверждение рекламы реакций\n\n`;
  confirmationMessage += `Тип: ${adInfo.reactionType === 1 ? 'Любая реакция' : 'Реакция на фото'}\n`;
  if (adInfo.photoFileId) {
    confirmationMessage += `Фото: [Прикреплено]\n`;
    await bot.sendPhoto(chatId, adInfo.photoFileId, {
      caption: 'Фото для задания'
    });
  }
  confirmationMessage += `Цена за реакцию: ${price} хамяфков\n`;
  confirmationMessage += `Количество реакций: ${count}\n`;
  confirmationMessage += `Общая стоимость: ${totalCost} хамяфков\n\n`;
  confirmationMessage += `Средства (${totalCost} хамяфков) будут списаны с вашего баланса после подтверждения.\n\n`;
  confirmationMessage += `Вам нужно будет предоставить доказательства выполнения задания (скриншот с реакцией).`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Подтвердить и создать задание', callback_data: 'confirm_reaction_ad' }],
      [{ text: 'Отменить', callback_data: 'cancel_ad' }]
    ]
  };

  await bot.sendMessage(chatId, confirmationMessage, { reply_markup: keyboard });
}

async function confirmReactionAd(chatId: number, user: BotUser) {
  try {
    const adInfo = JSON.parse(user.password || '{}');

    if (!adInfo.type || !adInfo.reactionType || !adInfo.count || !adInfo.totalCost) {
      await bot.sendMessage(chatId, 'Ошибка данных рекламы. Попробуйте еще раз.');
      await showAdvertiseMenu(chatId, user);
      return;
    }

    const userBalance = safeParseInt(user.hamsters);
    const totalCost = parseInt(adInfo.totalCost);

    if (totalCost > userBalance) {
      await bot.sendMessage(chatId, 'Недостаточно средств для создания рекламы.');
      await showAdvertiseMenu(chatId, user);
      return;
    }

    // Deduct cost from user balance
    await storage.addHamsters(user.id, -totalCost);

    // Create the reaction ad task
    const newTask = await storage.createReactionTask({
      creatorId: user.id,
      type: adInfo.reactionType,
      photoFileId: adInfo.photoFileId,
      messageLink: adInfo.messageLink,
      channelName: adInfo.channelName,
      messageId: adInfo.messageId,
      pricePerReaction: adInfo.price.toString(),
      reactionsNeeded: adInfo.count.toString(),
      reactionsGot: '0',
      totalCost: adInfo.totalCost.toString(),
      status: 'active',
      createdAt: new Date().toISOString()
    });

    // Reset user state
    await storage.updateBotUser(user.id, {
      password: '',
      registrationStep: 'none'
    });

    const newBalance = userBalance - totalCost;

    await bot.sendMessage(chatId,
      `✅ Задание на реакцию создано!\n\n` +
      `Тип: ${adInfo.reactionType === 1 ? 'Любая реакция' : 'Реакция на фото'}\n` +
      `Цена за реакцию: ${adInfo.price} хамяфов\n` +
      `Нужно реакций: ${adInfo.count}\n` +
      `Резерв с баланса: ${totalCost} хамяфов\n` +
      `Ваш баланс: ${newBalance} хамяфов\n\n` +
      `💡 Когда исполнитель отправит скриншот — вы получите уведомление для проверки.\n` +
      `⚠️ Если не проверите за 24 часа — бот автоматически одобрит задание.`
    );

    await showAdvertiseMenu(chatId, user);
  } catch (error: any) {
    log(`Error confirming reaction ad: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при создании задания.');
    await showAdvertiseMenu(chatId, user);
  }
}

async function viewReactionPhoto(chatId: number, user: BotUser, taskId: string) {
  try {
    const task = await storage.getReactionTask(taskId);
    if (!task || !task.photoFileId) {
      await bot.sendMessage(chatId, 'Фото для этого задания не найдено.');
      return;
    }

    const photoText = `📷 Фото для реакции

Поставьте реакцию на это фото и сделайте скриншот!

Награда: ${task.pricePerReaction} хамяфков`;

    const keyboard = {
      inline_keyboard: [
        [{ text: `📸 Отправить скриншот (+${task.pricePerReaction})`, callback_data: `upload_reaction_proof_${taskId}` }],
        [{ text: '↩️ Назад к заданиям', callback_data: 'earn_reactions' }]
      ]
    };

    await bot.sendPhoto(chatId, task.photoFileId, {
      caption: photoText,
      reply_markup: keyboard
    });
  } catch (error) {
    log(`Error in viewReactionPhoto: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке фото.');
  }
}

async function uploadReactionProof(chatId: number, user: BotUser, taskId: string) {
  try {
    const task = await storage.getReactionTask(taskId);
    if (!task) {
      await bot.sendMessage(chatId, 'Задание не найдено.');
      return;
    }

    await storage.updateBotUser(user.id, {
      registrationStep: `awaiting_reaction_proof_${taskId}`
    });

    let proofText = `Отправка доказательства реакции\n\n`;

    if (task.messageLink) {
      proofText += `Ссылка на пост:\n${task.messageLink}\n\n`;
      proofText += `Инструкция:\n`;
      proofText += `1. Перейдите по ссылке выше\n`;
      proofText += `2. Поставьте любую реакцию под постом\n`;
      proofText += `3. Сделайте скриншот с вашей реакцией\n`;
      proofText += `4. Отправьте скриншот сюда как фото\n\n`;
      proofText += `Важно: На скриншоте должна быть видна ваша реакция`;
    } else if (task.photoFileId) {
      proofText += `Поставьте реакцию на фото выше!\n\n`;
      proofText += `Инструкция:\n`;
      proofText += `1. Нажмите на реакцию под фото выше\n`;
      proofText += `2. Выберите любую реакцию\n`;
      proofText += `3. Сделайте скриншот с вашей реакцией\n`;
      proofText += `4. Отправьте скриншот сюда как фото\n\n`;
      proofText += `Важно: На скриншоте должна быть видна ваша реакция`;
    } else {
      proofText += `Отправьте скриншот с вашей реакцией как фото.\n\n`;
    }

    proofText += `\nНаграда: ${task.pricePerReaction} хамяфков`;

    const keyboard = task.messageLink ? {
      inline_keyboard: [
        [{ text: 'Открыть пост для реакции', url: task.messageLink }]
      ]
    } : undefined;

    await bot.sendMessage(chatId, proofText, keyboard ? { reply_markup: keyboard } : undefined);
  } catch (error) {
    log(`Error in uploadReactionProof: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
}

async function handleReactionProofInput(chatId: number, user: BotUser, msg: any) {
  const registrationStep = user.registrationStep;
  const taskIdMatch = registrationStep?.match(/^awaiting_reaction_proof_([a-zA-Z0-9-]+)$/);

  if (!taskIdMatch) {
    await bot.sendMessage(chatId, 'Ошибка в шаге регистрации. Попробуйте снова.');
    return;
  }

  const taskId = taskIdMatch[1];

  // Check if message contains photo
  if (!msg.photo || msg.photo.length === 0) {
    await bot.sendMessage(chatId, `Пожалуйста, отправьте скриншот в виде фото!

Инструкция:
1. Сделайте скриншот с вашей реакцией
2. Отправьте его как фото (не как файл)

Попробуйте еще раз.`);
    return;
  }

  const photoFileId = msg.photo[msg.photo.length - 1].file_id;

  try {
    // Check if user already submitted proof for this task
    const existingProof = await storage.getReactionProofByUserAndTask(user.id, taskId);

    if (existingProof && existingProof.status === 'pending') {
      await bot.sendMessage(chatId, 'Вы уже отправили доказательство для этого задания. Ожидайте проверки.');
      await storage.updateBotUser(user.id, { registrationStep: 'none' });
      return;
    }

    const proof = await storage.createReactionProof({
      taskId,
      userId: user.id,
      proofPhotoId: photoFileId,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    await storage.updateBotUser(user.id, { registrationStep: 'none' });

    const task = await storage.getReactionTask(taskId);

    await bot.sendMessage(chatId, `Скриншот получен и отправлен владельцу задания!

Ожидайте проверки. Владелец задания рассмотрит ваше доказательство.

Что дальше:
• Если одобрит - вы получите ${task?.pricePerReaction || 600} хамяфков
• Если отклонит - вы сможете подать апелляцию
• Если нет ответа 24 часа - автоматически получите 2000 хамяфков компенсации

Спасибо за участие!`);

    // Notify task owner for review
    await notifyTaskOwnerForReactionReview(user, taskId, photoFileId, proof.id);

    // Notify admin about new proof
    await notifyAdminReactionProofForReview(user, taskId, photoFileId, proof.id);

    // Schedule auto-compensation after 24 hours
    await scheduleAutoCompensation(proof.id, user.id, 2000);

    log(`Reaction proof submitted: user ${user.nickname}, task ${taskId}, proof ${proof.id}`);

  } catch (error) {
    log(`Error uploading reaction proof: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при отправке скриншота. Попробуйте еще раз.');
  }
}

async function reviewReactionProof(chatId: number, user: BotUser, proofId: string, action: string) {
  try {
    const proof = await storage.getReactionProof(proofId);
    if (!proof || proof.status !== 'pending') {
      await bot.sendMessage(chatId, 'Доказательство не найдено или уже обработано.');
      return;
    }

    const task = await storage.getReactionTask(proof.taskId);
    if (!task || task.creatorId !== user.id) {
      await bot.sendMessage(chatId, 'У вас нет прав для проверки этого задания.');
      return;
    }

    // Update proof status
    await storage.updateReactionProof(proofId, { status: action });

    if (action === 'approved') {
      const reward = parseInt(task.pricePerReaction || '0');

      // Charge advertiser, reward performer
      await storage.addHamsters(task.creatorId, -reward);
      await storage.addHamsters(proof.userId, reward);

      // Increment reactionsGot for the task
      const newReactionsGot = parseInt(task.reactionsGot || '0') + 1;
      await storage.updateReactionTask(proof.taskId, { reactionsGot: newReactionsGot.toString() });

      // Check if task is completed
      if (newReactionsGot >= parseInt(task.reactionsNeeded || '0')) {
        await storage.updateReactionTask(proof.taskId, { status: 'completed' });
      }

      // Notify performer
      const proofUser = await storage.getBotUser(proof.userId);
      if (proofUser) {
        await bot.sendMessage(proofUser.telegramId,
          `✅ Ваше доказательство одобрено!\n\n` +
          `Получено: ${reward} хамяфов\n` +
          `Спасибо за выполнение задания!`
        );
      }

      await bot.sendMessage(chatId, `✅ Одобрено! Списано ${reward} хамяфов. Исполнитель награжден.`);

      log(`Reaction proof approved: ${proofId} by owner ${user.nickname}, reward ${reward}`);
    } else if (action === 'rejected') {
      // Notify user with appeal option
      const appealText = `❌ Ваше доказательство отклонено владельцем задания.

🔄 Вы можете подать апелляцию, если считаете, что задание выполнено правильно.

При подаче апелляции ваше доказательство будет рассмотрено администратором.`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '📝 Подать апелляцию', callback_data: `appeal_proof_${proofId}` }],
          [{ text: '❌ Закрыть', callback_data: 'close_appeal' }]
        ]
      };

      const proofUser = await storage.getBotUser(proof.userId);
      if (proofUser) {
        await bot.sendMessage(proofUser.telegramId, appealText, { reply_markup: keyboard });
      }

      await bot.sendMessage(chatId, '❌ Доказательство отклонено. Пользователь уведомлен.');

      log(`Reaction proof rejected: ${proofId} by task owner ${user.nickname}`);
    }
  } catch (error) {
    log(`Error reviewing reaction proof: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при проверке доказательства.');
  }
}

async function showEarnReactions(chatId: number, user: BotUser) {
  // Step 1: Ask for reaction type
  const text = `✈️ Заработок на реакциях

Выберите тип реакций:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '👍 Позитивные', callback_data: 'earn_reactions_type_1' }],
      [{ text: '🖼 Выбранные на фото', callback_data: 'earn_reactions_type_2' }],
      [{ text: '⬅️ Назад', callback_data: 'back_to_earn' }]
    ]
  };

  await bot.sendMessage(chatId, text, { reply_markup: keyboard });
}

async function showEarnReactionsByType(chatId: number, user: BotUser, reactionType: number, page: number = 0) {
  try {
    const reactionTasks = await storage.getPendingReactionTasks(user.id);
    const perPage = 8;

    // Filter by type and availability
    const availableTasks = reactionTasks.filter(task => {
      const remainingReactions = parseInt(task.reactionsNeeded || '0') - parseInt(task.reactionsGot || '0');
      const hasRemainingBudget = parseInt(task.totalCost || '0') > 0;
      const taskType = task.reactionType || 1;
      return remainingReactions > 0 && hasRemainingBudget && task.status === 'active' && taskType === reactionType;
    });

    // Sort by price descending (most expensive first)
    availableTasks.sort((a, b) => parseInt(b.pricePerReaction || '0') - parseInt(a.pricePerReaction || '0'));

    if (availableTasks.length === 0) {
      await bot.sendMessage(chatId,
        `✈️ Задания на реакциях

${reactionType === 1 ? '👍 Позитивные' : '🖼 Выбранные на фото'}

Пока нет доступных заданий.
Заходите позже!`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Назад к типам', callback_data: 'earn_reactions' }],
            [{ text: '⬅️ Назад к меню', callback_data: 'back_to_earn' }]
          ]
        }
      });
      return;
    }

    const totalPages = Math.ceil(availableTasks.length / perPage);
    const pageTasks = availableTasks.slice(page * perPage, (page + 1) * perPage);

    let earnText = `✈️ Доступные задания (${page + 1}/${totalPages})

`;

    const buttons = [];

    for (const task of pageTasks) {
      const remainingReactions = parseInt(task.reactionsNeeded || '0') - parseInt(task.reactionsGot || '0');
      const proofExists = await storage.hasReactionProofForUser(user.id, task.id);

      if (!proofExists) {
        buttons.push([{
          text: `[✨ ${task.pricePerReaction} хамяфов ] Осталось: ${remainingReactions}`,
          callback_data: `do_reaction_task_${task.id}`
        }]);
      }
    }

    // Pagination
    const navRow = [];
    if (page > 0) {
      navRow.push({ text: '⬅️ Назад', callback_data: `reactions_page_${reactionType}_${page - 1}` });
    }
    if (page < totalPages - 1) {
      navRow.push({ text: 'Далее ➡️', callback_data: `reactions_page_${reactionType}_${page + 1}` });
    }
    if (navRow.length > 0) buttons.push(navRow);

    buttons.push([
      { text: '⬅️ Назад к типам', callback_data: 'earn_reactions' },
      { text: '⬅️ Меню', callback_data: 'back_to_earn' }
    ]);

    await bot.sendMessage(chatId, earnText, {
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (error) {
    log(`Error showing earn reactions by type: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при загрузке заданий.');
  }
}


// Utility functions
function isValidTelegramLink(link: string): boolean {
  const patterns = [
    /^@[a-zA-Z0-9_]{5,32}$/,
    /^https:\/\/t\.me\/[a-zA-Z0-9_]{5,32}$/
  ];

  return patterns.some(pattern => pattern.test(link));
}

function extractTitleFromLink(link: string): string {
  if (link.startsWith('@')) {
    return link;
  }

  const match = link.match(/t\.me\/([a-zA-Z0-9_]+)/);
  return match ? `@${match[1]}` : link;
}

async function notifyAdminAdCreated(user: BotUser, adInfo: any, title: string) {
  try {
    const typeText = adInfo.type === 'channel' ? 'канал' : 'чат';

    const adminMessage = `Создана новая реклама!

Пользователь: ${user.nickname} (${user.telegramId})
Тип: ${typeText}
Ссылка: ${adInfo.link}
Название: ${title}
Общая сумма: ${adInfo.totalAmount} хамяфек
Цена за подписчика: ${adInfo.price} хамяфек
Цель подписчиков: ${adInfo.subscribers}
Дата: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for new ad: ${title} by ${user.nickname}`);
  } catch (error) {
    log(`Error sending admin ad notification: ${error}`);
  }
}

async function notifyAdminPostViewAdCreated(user: BotUser, adInfo: any) {
  try {
    const adminMessage = `Создана новая реклама просмотра постов!

Пользователь: ${user.nickname} (${user.telegramId})
Канал: ${adInfo.title}
Ссылка: ${adInfo.channelLink}
Цена за просмотр: ${adInfo.price} хамяфек
Количество просмотров: ${adInfo.views}
Общая сумма: ${adInfo.totalAmount} хамяфек
Дата: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for new post view ad by ${user.nickname}`);
  } catch (error) {
    log(`Error sending admin post view ad notification: ${error}`);
  }
}

async function notifyAdminReactionTaskForReview(user: BotUser, task: any, reactionType: number) {
  try {
    const adminMessage = `Новое задание на реакцию для проверки!

Автор: ${user.nickname} (${user.telegramId})
Тип: ${reactionType === 1 ? 'Любая реакция' : 'Реакция на фото'}
Цена: ${task.pricePerReaction} хамяфков
Нужно: ${task.reactionsNeeded} реакций
Общая стоимость: ${task.totalCost} хамяфков
Фото: ${task.photoFileId ? 'Прикреплено' : 'Нет'}
Дата: ${new Date().toLocaleString('ru-RU')}`;

    const keyboard = {
      inline_keyboard: [
        [{ text: 'Проверить', callback_data: `review_reaction_proof_approve_${task.id}_${user.id}` }], // Dummy proofId and userId for admin review
        [{ text: 'Отклонить', callback_data: `review_reaction_proof_reject_${task.id}_${user.id}` }]
      ]
    };

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for reaction task review by ${user.nickname}`);
  } catch (error) {
    log(`Error sending admin reaction task review notification: ${error}`);
  }
}

async function notifyAdminReactionProofForReview(user: BotUser, taskId: string, proofPhotoId: string, proofId: string) {
  try {
    const task = await storage.getReactionTask(taskId);
    const adminMessage = `Новое доказательство реакции для проверки!

Пользователь: ${user.nickname} (${user.telegramId})
Задание: ${task?.title || `ID: ${taskId}`}
Награда: ${task?.pricePerReaction || 600} хамяфков
Дата: ${new Date().toLocaleString('ru-RU')}

Отправьте /admin_menu для проверки доказательств`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for reaction proof review by ${user.nickname} for task ${taskId}`);
  } catch (error) {
    log(`Error sending admin reaction proof review notification: ${error}`);
  }
}

async function checkChatType(link: string): Promise<{ type: string | null; error: string | null }> {
  try {
    let chatUsername = link;
    if (chatUsername.includes('t.me/')) {
      chatUsername = '@' + chatUsername.split('t.me/')[1];
    }

    const chatInfo = await bot.getChat(chatUsername);
    const chatType = chatInfo.type;

    if (chatType === 'channel') {
      return { type: 'channel', error: null };
    } else if (chatType === 'group' || chatType === 'supergroup') {
      return { type: 'chat', error: null };
    } else {
      return { type: 'private', error: null };
    }
  } catch (error: any) {
    log(`Error checking chat type: ${error}`);
    return { type: null, error: 'Не удалось проверить тип чата' };
  }
}

// Real subscription check function
async function checkBotAdminRights(link: string): Promise<{ isAdmin: boolean; error: boolean; message?: string }> {
  try {
    // Extract channel/chat username from link
    let chatUsername = link;
    if (chatUsername.includes('t.me/')) {
      chatUsername = '@' + chatUsername.split('t.me/')[1];
    }

    // Extract bot ID from token (format: "bot_id:token")
    const botId = BOT_TOKEN.split(':')[0];

    // Get bot's own member info
    const botMember = await bot.getChatMember(chatUsername, parseInt(botId));

    // Bot must be administrator or creator to track subscriptions
    const isAdmin = ['administrator', 'creator'].includes(botMember.status);

    if (!isAdmin) {
      return { 
        isAdmin: false, 
        error: false, 
        message: 'Бот не является администратором в этом канале/чате. Добавьте бота в качестве администратора для отслеживания подписок.'
      };
    }

    return { isAdmin: true, error: false };
  } catch (error: any) {
    log(`Error checking bot admin rights: ${error}`);
    return { 
      isAdmin: false, 
      error: true, 
      message: 'Не удалось проверить права бота. Убедитесь, что бот добавлен в канал/чат как администратор.'
    };
  }
}

async function checkRealSubscription(telegramId: string, link: string): Promise<{ subscribed: boolean; error: boolean }> {
  try {
    // Extract channel/chat username from link
    let chatUsername = link;
    if (chatUsername.includes('t.me/')) {
      chatUsername = '@' + chatUsername.split('t.me/')[1];
    }

    // Check if user is member of the channel/chat
    const chatMember = await bot.getChatMember(chatUsername, parseInt(telegramId));

    // User is subscribed if they are member, administrator, or creator
    const isSubscribed = ['member', 'administrator', 'creator'].includes(chatMember.status);
    return { subscribed: isSubscribed, error: false };
  } catch (error: any) {
    // Don't log every single error - too spammy
    // Only log if it's not a "chat not found" error
    if (!error.message?.includes('chat not found')) {
      log(`Error checking real subscription: ${error}`);
    }
    return { subscribed: false, error: true }; // Indicate this was an error, not unsubscription
  }
}

// Schedule unsubscribe check in 7 days
async function scheduleUnsubscribeCheck(userId: string, taskId: string, rewardAmount: number, penaltyAmount: number = 2000) {
  // Check if penalty check already exists for this user and task
  const existingCheck = await storage.getPenaltyCheckByUserAndTask(userId, taskId);
  if (existingCheck) {
    log(`Penalty check already exists for user ${userId}, task ${taskId}, skipping creation`);
    return;
  }

  // Store penalty check data
  const penaltyCheck = {
    userId,
    taskId,
    rewardAmount: rewardAmount.toString(),
    penaltyAmount: penaltyAmount.toString(),
    checkDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    checked: false,
    penaltyApplied: false,
    createdAt: new Date().toISOString()
  };

  // Save to storage
  await storage.createPenaltyCheck(penaltyCheck);

  log(`Scheduled penalty check for user ${userId}, task ${taskId} in 7 days with ${penaltyAmount} hamsters penalty`);
}

// Function to check all pending penalties (check every 3 seconds)
async function checkPendingPenalties() {
  try {
    const pendingChecks = await storage.getPendingPenaltyChecks();

    for (const check of pendingChecks) {
      // Skip if penalty was already applied
      if (check.penaltyApplied) {
        await storage.updatePenaltyCheck(check.id, { checked: true });
        continue;
      }

      const user = await storage.getBotUser(check.userId);
      const task = await storage.getAdTask(check.taskId);

      if (!user || !task) {
        // Mark as checked if user/task not found
        await storage.updatePenaltyCheck(check.id, { checked: true });
        continue;
      }

      // Check if penalty period has expired
      const checkDate = new Date(check.checkDate);
      const now = new Date();

      if (now >= checkDate) {
        // Period expired - no more penalty risk
        log(`7-day penalty period expired for user ${user.nickname}, task ${task.title} - no penalty will be applied`);
        await storage.updatePenaltyCheck(check.id, { checked: true });
      } else {
        // Still within penalty period - check if user is subscribed
        const subscriptionResult = await checkRealSubscription(user.telegramId, task.link);

        if (subscriptionResult.error) {
          // Network or API error - skip this check and try again later
          log(`Skipping penalty check for user ${user.nickname} due to network error`);
          continue;
        }

        if (!subscriptionResult.subscribed) {
          // User unsubscribed within penalty period
          // Check if second chance was already offered
          if (!check.secondChanceOffered) {
            // First time detecting unsubscription - offer second chance
            await storage.updatePenaltyCheck(check.id, {
              secondChanceOffered: true
            });

            const resubscribeKeyboard = {
              inline_keyboard: [
                [{ text: '✅ Подписаться обратно', callback_data: `resubscribe_${check.taskId}` }]
              ]
            };

            await bot.sendMessage(user.telegramId,
              `⚠️ ВЫ ОТПИСАЛИСЬ!\n\n` +
              `Вы отписались от ${task.type === 'channel' ? 'канала' : 'чата'}: ${task.title}\n\n` +
              `Если вы не подпишетесь обратно до конца 7-дневного срока, с вас будет списано ${check.penaltyAmount} хамяфков!\n\n` +
              `👉 Подпишитесь обратно — и штрафа не будет!`,
              { reply_markup: resubscribeKeyboard }
            );

            log(`Second chance offered to user ${user.nickname} for task ${task.title}`);
          } else if (!check.secondChanceUsed) {
            // Second chance offered but not used - check if period expired
            if (now >= checkDate) {
              // 7 days expired - apply penalty
              const currentHamsters = parseInt(user.hamsters || '0');
              const penaltyAmount = parseInt(check.penaltyAmount);
              const newBalance = Math.max(0, currentHamsters - penaltyAmount);

              await storage.updateBotUser(user.id, {
                hamsters: newBalance.toString()
              });

              await bot.sendMessage(user.telegramId,
                `❌ ШТРАФ ПРИМЕНЁН ❌\n\n` +
                `Вы отписались от ${task.type === 'channel' ? 'канала' : 'чата'}: ${task.title}\n\n` +
                `Списано ${penaltyAmount} хамяфков\n` +
                `Текущий баланс: ${newBalance} хамяфков\n\n` +
                `⚠️ Не отписывайтесь в течение 7 дней после получения награды!`
              );

              await notifyAdminPenalty(user.nickname || user.telegramId, user.telegramId, penaltyAmount.toString(), `Отписка от ${task.type === 'channel' ? 'канала' : 'чата'}: ${task.title}`);

              log(`Penalty applied: ${penaltyAmount} hamsters deducted from user ${user.nickname} for task ${task.title} (unsubscribed within 7 days, no resubscribe)`);

              await storage.updatePenaltyCheck(check.id, {
                checked: true,
                penaltyApplied: true
              });
            }
          } else {
            // Second chance was used but user unsubscribed AGAIN - apply penalty immediately!
            const currentHamsters = parseInt(user.hamsters || '0');
            const penaltyAmount = parseInt(check.penaltyAmount);
            const newBalance = Math.max(0, currentHamsters - penaltyAmount);

            await storage.updateBotUser(user.id, {
              hamsters: newBalance.toString()
            });

            await bot.sendMessage(user.telegramId,
              `❌ ШТРАФ ПРИМЕНЁН ❌\n\n` +
              `Вы отписались от ${task.type === 'channel' ? 'канала' : 'чата'}: ${task.title}\n
` +
              `Списано ${penaltyAmount} хамяфков\n` +
              `Текущий баланс: ${newBalance} хамяфков\n\n` +
              `⚠️ Вы уже использовали второй шанс. Повторная отписка = штраф сразу!`
            );

            await notifyAdminPenalty(user.nickname || user.telegramId, user.telegramId, penaltyAmount.toString(), `Повторная отписка от ${task.type === 'channel' ? 'канала' : 'чата'}: ${task.title}`);

            log(`Penalty applied: ${penaltyAmount} hamsters deducted from user ${user.nickname} for task ${task.title} (unsubscribed AGAIN after using second chance)`);

            await storage.updatePenaltyCheck(check.id, {
              checked: true,
              penaltyApplied: true
            });
          }
        }
        // If still subscribed within penalty period, continue monitoring
      }
    }
  } catch (error) {
    log(`Error checking pending penalties: ${error}`);
  }
}



// ─── Недостающие функции рекламного потока ────────────────────────────────────

// Обрабатывает пересланное сообщение для рекламы просмотров постов
async function handleForwardedMessage(chatId: number, user: BotUser, msg: any) {
  try {
    const chat = msg.forward_from_chat;
    if (!chat) {
      await bot.sendMessage(chatId, 'Перешлите сообщение из канала.');
      return;
    }
    const channelLink = chat.username ? `@${chat.username}` : `id:${chat.id}`;
    const title = chat.title || channelLink;
    const messageId = msg.forward_from_message_id || msg.message_id;

    const adInfo = { type: 'post_view', link: channelLink, title, messageId };
    await storage.updateBotUser(user.id, {
      password: JSON.stringify(adInfo),
      registrationStep: 'awaiting_post_price'
    });
    await bot.sendMessage(chatId,
      `✅ Пост из канала "${title}" принят!\n\nТеперь укажите цену за просмотр (от 100 до 500 хамяфков):`
    );
  } catch (error) {
    log(`Error handling forwarded message: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
}

// Обрабатывает ввод ссылки на канал при создании рекламы канала
async function handleChannelAdInput(chatId: number, user: BotUser, input: string) {
  try {
    if (input.toLowerCase() === 'отмена') {
      await storage.updateBotUser(user.id, { registrationStep: 'none', password: null });
      await showAdvertiseMenu(chatId, user);
      return;
    }
    const link = input.trim();
    if (!isValidTelegramLink(link)) {
      await bot.sendMessage(chatId,
        '❌ Неверный формат ссылки!\n\nОтправьте ссылку в формате:\n• @channel_name\n• https://t.me/channel_name'
      );
      return;
    }
    const title = extractTitleFromLink(link);
    const adInfo = { type: 'channel', link, title };
    await storage.updateBotUser(user.id, {
      password: JSON.stringify(adInfo),
      registrationStep: 'awaiting_ad_subscribers'
    });
    await bot.sendMessage(chatId,
      `✅ Канал принят: ${link}\n\nСколько подписчиков вам нужно? (минимум 1, цена: 600–2000 хамяфков за подписчика):\n\nВведите количество подписчиков:`
    );
    await storage.updateBotUser(user.id, {
      password: JSON.stringify({ ...adInfo, step: 'awaiting_subscribers' }),
      registrationStep: 'awaiting_ad_subscribers'
    });
  } catch (error) {
    log(`Error handling channel ad input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
}

// Обрабатывает ввод ссылки на чат при создании рекламы чата
async function handleChatAdInput(chatId: number, user: BotUser, input: string) {
  try {
    if (input.toLowerCase() === 'отмена') {
      await storage.updateBotUser(user.id, { registrationStep: 'none', password: null });
      await showAdvertiseMenu(chatId, user);
      return;
    }
    const link = input.trim();
    if (!isValidTelegramLink(link)) {
      await bot.sendMessage(chatId,
        '❌ Неверный формат ссылки!\n\nОтправьте ссылку в формате:\n• @chat_name\n• https://t.me/chat_name'
      );
      return;
    }
    const title = extractTitleFromLink(link);
    const adInfo = { type: 'chat', link, title };
    await storage.updateBotUser(user.id, {
      password: JSON.stringify(adInfo),
      registrationStep: 'awaiting_ad_subscribers'
    });
    await bot.sendMessage(chatId,
      `✅ Чат принят: ${link}\n\nСколько участников вам нужно? (минимум 1, цена: 600–2000 хамяфков за участника):\n\nВведите количество участников:`
    );
  } catch (error) {
    log(`Error handling chat ad input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
}

// Обрабатывает ввод ссылки на канал при создании рекламы просмотров постов
async function handlePostViewInput(chatId: number, user: BotUser, input: string) {
  try {
    if (input.toLowerCase() === 'отмена') {
      await storage.updateBotUser(user.id, { registrationStep: 'none', password: null });
      await showAdvertiseMenu(chatId, user);
      return;
    }
    const link = input.trim();
    if (!isValidTelegramLink(link)) {
      await bot.sendMessage(chatId,
        '❌ Неверный формат ссылки!\n\nОтправьте ссылку в формате:\n• @channel_name\n• https://t.me/channel_name'
      );
      return;
    }
    const title = extractTitleFromLink(link);
    const adInfo = { type: 'post_view', link, title };
    await storage.updateBotUser(user.id, {
      password: JSON.stringify(adInfo),
      registrationStep: 'awaiting_post_message'
    });
    await bot.sendMessage(chatId,
      `✅ Канал принят: ${link}\n\nТеперь перешлите сюда любое сообщение из вашего канала, которое будут смотреть пользователи.`
    );
  } catch (error) {
    log(`Error handling post view input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
}

// Обрабатывает ввод цены за просмотр/подписку
async function handlePostPriceInput(chatId: number, user: BotUser, priceText: string) {
  try {
    const price = parseInt(priceText);
    const adInfo = JSON.parse(user.password || '{}');
    const isPostView = adInfo.type === 'post_view';
    const minPrice = isPostView ? 100 : 600;
    const maxPrice = isPostView ? 500 : 2000;

    if (isNaN(price) || price < minPrice || price > maxPrice) {
      await bot.sendMessage(chatId,
        `❌ Неверная цена!\n\nУкажите цену от ${minPrice} до ${maxPrice} хамяфков.`
      );
      return;
    }
    await storage.updateBotUser(user.id, {
      password: JSON.stringify({ ...adInfo, price }),
      registrationStep: isPostView ? 'awaiting_post_views' : 'awaiting_ad_subscribers'
    });
    const nextLabel = isPostView ? 'количество просмотров' : 'количество подписчиков';
    await bot.sendMessage(chatId,
      `✅ Цена: ${price} хамяфков.\n\nТеперь укажите ${nextLabel} (минимум 1):`
    );
  } catch (error) {
    log(`Error handling post price input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
}

// Обрабатывает ввод количества подписчиков для рекламы канала/чата
async function handleAdSubscribersInput(chatId: number, user: BotUser, countText: string) {
  try {
    const count = parseInt(countText);
    if (isNaN(count) || count < 1) {
      await bot.sendMessage(chatId, '❌ Неверное количество! Введите число больше 0.');
      return;
    }
    const adInfo = JSON.parse(user.password || '{}');
    const price = adInfo.price || 600;
    const totalCost = count * price;
    const userBalance = safeParseInt(user.hamsters);

    if (totalCost > userBalance) {
      await bot.sendMessage(chatId,
        `❌ Недостаточно средств!\n\nТребуется: ${totalCost} хамяфков\nВаш баланс: ${userBalance} хамяфков\nНе хватает: ${totalCost - userBalance} хамяфков`
      );
      return;
    }

    const fullAdInfo = { ...adInfo, count, totalCost };
    await storage.updateBotUser(user.id, {
      password: JSON.stringify(fullAdInfo),
      registrationStep: 'awaiting_ad_confirmation'
    });

    const typeLabel = adInfo.type === 'channel' ? 'канал' : 'чат';
    const countLabel = adInfo.type === 'channel' ? 'подписчиков' : 'участников';
    await bot.sendMessage(chatId,
      `📋 Подтверждение рекламы\n\n` +
      `Тип: ${typeLabel}\n` +
      `Ссылка: ${adInfo.link}\n` +
      `Цена за ${adInfo.type === 'channel' ? 'подписчика' : 'участника'}: ${price} хамяфков\n` +
      `Количество ${countLabel}: ${count}\n` +
      `Общая стоимость: ${totalCost} хамяфков\n` +
      `Ваш баланс: ${userBalance} хамяфков`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Подтвердить', callback_data: 'confirm_ad_creation' }],
            [{ text: '❌ Отмена', callback_data: 'cancel_ad_creation' }]
          ]
        }
      }
    );
  } catch (error) {
    log(`Error handling ad subscribers input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
}

// Обрабатывает ввод количества просмотров для рекламы постов
async function handlePostViewsInput(chatId: number, user: BotUser, countText: string) {
  try {
    const count = parseInt(countText);
    if (isNaN(count) || count < 1) {
      await bot.sendMessage(chatId, '❌ Неверное количество! Введите число больше 0.');
      return;
    }
    const adInfo = JSON.parse(user.password || '{}');
    const price = adInfo.price || 100;
    const totalCost = count * price;
    const userBalance = safeParseInt(user.hamsters);

    if (totalCost > userBalance) {
      await bot.sendMessage(chatId,
        `❌ Недостаточно средств!\n\nТребуется: ${totalCost} хамяфков\nВаш баланс: ${userBalance} хамяфков\nНе хватает: ${totalCost - userBalance} хамяфков`
      );
      return;
    }

    const fullAdInfo = { ...adInfo, count, totalCost };
    await storage.updateBotUser(user.id, {
      password: JSON.stringify(fullAdInfo),
      registrationStep: 'awaiting_post_view_confirmation'
    });

    await bot.sendMessage(chatId,
      `📋 Подтверждение рекламы просмотров\n\n` +
      `Канал: ${adInfo.link}\n` +
      `Цена за просмотр: ${price} хамяфков\n` +
      `Просмотров: ${count}\n` +
      `Общая стоимость: ${totalCost} хамяфков\n` +
      `Ваш баланс: ${userBalance} хамяфков`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Подтвердить', callback_data: 'confirm_post_view_ad' }],
            [{ text: '❌ Отмена', callback_data: 'cancel_ad_creation' }]
          ]
        }
      }
    );
  } catch (error) {
    log(`Error handling post views input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
}

// Подтверждение создания рекламы канала/чата
async function confirmAdCreation(chatId: number, user: BotUser) {
  try {
    const adInfo = JSON.parse(user.password || '{}');
    if (!adInfo.link || !adInfo.count || !adInfo.totalCost) {
      await bot.sendMessage(chatId, '❌ Данные рекламы не найдены. Начните заново.');
      await showAdvertiseMenu(chatId, user);
      return;
    }
    const userBalance = safeParseInt(user.hamsters);
    const totalCost = parseInt(adInfo.totalCost);
    if (totalCost > userBalance) {
      await bot.sendMessage(chatId, '❌ Недостаточно средств для создания рекламы.');
      await showAdvertiseMenu(chatId, user);
      return;
    }

    await storage.addHamsters(user.id, -totalCost);

    const title = adInfo.title || extractTitleFromLink(adInfo.link);
    const newTask = await storage.createAdTask({
      creatorId: user.id,
      type: adInfo.type || 'channel',
      title,
      link: adInfo.link,
      rewardPerSubscriber: (adInfo.price || 600).toString(),
      subscribersNeeded: adInfo.count.toString(),
      subscribersGot: '0',
      remainingAmount: totalCost.toString(),
      isActive: true,
      createdAt: new Date().toISOString()
    });

    await storage.updateBotUser(user.id, { password: null, registrationStep: 'none' });

    const newBalance = userBalance - totalCost;
    const typeLabel = adInfo.type === 'channel' ? 'канал' : 'чат';
    await bot.sendMessage(chatId,
      `✅ Реклама ${typeLabel} создана!\n\n` +
      `Ссылка: ${adInfo.link}\n` +
      `Цена за подписчика: ${adInfo.price || 600} хамяфков\n` +
      `Нужно подписчиков: ${adInfo.count}\n` +
      `Списано: ${totalCost} хамяфков\n` +
      `Ваш баланс: ${newBalance} хамяфков`
    );

    await notifyAdminAdCreated(user, adInfo, title);
    await showAdvertiseMenu(chatId, user);
  } catch (error) {
    log(`Error confirming ad creation: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при создании рекламы.');
    await showAdvertiseMenu(chatId, user);
  }
}

// Подтверждение создания рекламы просмотров постов
async function confirmPostViewAd(chatId: number, user: BotUser) {
  try {
    const adInfo = JSON.parse(user.password || '{}');
    if (!adInfo.link || !adInfo.count || !adInfo.totalCost) {
      await bot.sendMessage(chatId, '❌ Данные рекламы не найдены. Начните заново.');
      await showAdvertiseMenu(chatId, user);
      return;
    }
    const userBalance = safeParseInt(user.hamsters);
    const totalCost = parseInt(adInfo.totalCost);
    if (totalCost > userBalance) {
      await bot.sendMessage(chatId, '❌ Недостаточно средств для создания рекламы.');
      await showAdvertiseMenu(chatId, user);
      return;
    }

    await storage.addHamsters(user.id, -totalCost);

    const title = adInfo.title || extractTitleFromLink(adInfo.link);
    await storage.createAdTask({
      creatorId: user.id,
      type: 'post_view',
      title,
      link: adInfo.link,
      rewardPerSubscriber: (adInfo.price || 100).toString(),
      subscribersNeeded: adInfo.count.toString(),
      subscribersGot: '0',
      remainingAmount: totalCost.toString(),
      isActive: true,
      createdAt: new Date().toISOString()
    });

    await storage.updateBotUser(user.id, { password: null, registrationStep: 'none' });

    const newBalance = userBalance - totalCost;
    await bot.sendMessage(chatId,
      `✅ Реклама просмотров создана!\n\n` +
      `Канал: ${adInfo.link}\n` +
      `Цена за просмотр: ${adInfo.price || 100} хамяфков\n` +
      `Нужно просмотров: ${adInfo.count}\n` +
      `Списано: ${totalCost} хамяфков\n` +
      `Ваш баланс: ${newBalance} хамяфков`
    );

    await notifyAdminPostViewAdCreated(user, adInfo);
    await showAdvertiseMenu(chatId, user);
  } catch (error) {
    log(`Error confirming post view ad: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при создании рекламы.');
    await showAdvertiseMenu(chatId, user);
  }
}

// Проверяет подписку пользователя на канал хамяфки
async function checkHamyafkaSubscription(chatId: number, user: BotUser) {
  try {
    const HAMYAFKA_CHANNEL = botConfig.HAMYAFKA_CHANNEL || '@hamyafka';
    const result = await checkRealSubscription(user.telegramId, HAMYAFKA_CHANNEL);
    if (result.error) {
      await bot.sendMessage(chatId,
        `⚠️ Не удалось проверить подписку на ${HAMYAFKA_CHANNEL}. Попробуйте позже.`
      );
      return;
    }
    if (result.subscribed) {
      await bot.sendMessage(chatId,
        `✅ Вы подписаны на ${HAMYAFKA_CHANNEL}!\n\nСпасибо за поддержку!`
      );
    } else {
      await bot.sendMessage(chatId,
        `❌ Вы не подписаны на ${HAMYAFKA_CHANNEL}.\n\nПодпишитесь и возвращайтесь!`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📢 Подписаться', url: `https://t.me/${HAMYAFKA_CHANNEL.replace('@', '')}` }
            ]]
          }
        }
      );
    }
  } catch (error) {
    log(`Error checking hamyafka subscription: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при проверке подписки.');
  }
}

// Обрабатывает повторную подписку на канал для избежания штрафа
async function handleResubscribe(chatId: number, user: BotUser, taskId: string) {
  try {
    const task = await storage.getAdTask(taskId);
    if (!task) {
      await bot.sendMessage(chatId, 'Задание не найдено.');
      return;
    }
    const result = await checkRealSubscription(user.telegramId, task.link);
    if (result.error) {
      await bot.sendMessage(chatId,
        '⚠️ Не удалось проверить подписку. Попробуйте позже.'
      );
      return;
    }
    if (result.subscribed) {
      // Mark second chance as used
      const checks = await storage.getPendingPenaltyChecks();
      const check = checks.find(c => c.userId === user.id && c.taskId === taskId);
      if (check) {
        await storage.updatePenaltyCheck(check.id, { secondChanceUsed: true });
      }
      await bot.sendMessage(chatId,
        `✅ Отлично! Вы снова подписаны на "${task.title}".\n\nШтраф не будет применён. Спасибо!`
      );
    } else {
      await bot.sendMessage(chatId,
        `❌ Подписка не найдена на "${task.title}".\n\nПодпишитесь и нажмите кнопку снова!`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 Перейти к каналу', url: task.link.startsWith('http') ? task.link : `https://t.me/${task.link.replace('@', '')}` }],
              [{ text: '✅ Подписался, проверить', callback_data: `resubscribe_${taskId}` }]
            ]
          }
        }
      );
    }
  } catch (error) {
    log(`Error handling resubscribe: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
}

// Обрабатывает промо-код #hamyafka
async function handlePromoCode(msg: any, user: BotUser) {
  try {
    const chatId = msg.chat.id;
    const PROMO_REWARD = 500;
    const promoKey = `promo_hamyafka_${user.id}`;

    // Check if user already used this promo
    const alreadyUsed = user.registrationStep?.includes('promo_used');
    if (alreadyUsed) {
      await bot.sendMessage(chatId,
        '❌ Вы уже использовали промо-код #hamyafka.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    await storage.addHamsters(user.id, PROMO_REWARD);
    await storage.updateBotUser(user.id, {
      registrationStep: user.registrationStep === 'none' ? 'promo_used' : user.registrationStep
    });

    await bot.sendMessage(chatId,
      `🎉 Промо-код #hamyafka активирован!\n\nВы получили ${PROMO_REWARD} хамяфков!\n💰 Ваш баланс увеличен.`,
      { reply_to_message_id: msg.message_id }
    );
    log(`User ${user.nickname} used promo code #hamyafka, received ${PROMO_REWARD} hamsters`);
  } catch (error) {
    log(`Error handling promo code: ${error}`);
  }
}

// Balance check function
// ─── Три функции, которые отсутствовали ─────────────────────────────────────

async function confirmPassword(chatId: number, user: BotUser) {
  try {
    const adInfo = JSON.parse(user.password || '{}');
    if (!adInfo || Object.keys(adInfo).length === 0) {
      await bot.sendMessage(chatId, 'Нет данных для подтверждения. Начните создание рекламы заново.');
      return;
    }
    await confirmAdCreation(chatId, user);
  } catch (error) {
    log(`Error in confirmPassword: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
}

async function rejectPassword(chatId: number, user: BotUser) {
  try {
    await storage.updateBotUser(user.id, {
      password: null,
      registrationStep: 'none'
    });
    await showAdvertiseMenu(chatId, user);
  } catch (error) {
    log(`Error in rejectPassword: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
}

async function checkAdminRights(chatId: number, user: BotUser) {
  try {
    const adInfo = JSON.parse(user.password || '{}');
    const link = adInfo.link || adInfo.channelName || '';
    if (!link) {
      await bot.sendMessage(chatId, 'Канал не найден. Начните создание рекламы заново.');
      return;
    }
    const channelId = link.startsWith('@') ? link : `@${link.replace('https://t.me/', '')}`;
    try {
      const botInfo = await bot.getMe();
      const member = await bot.getChatMember(channelId, botInfo.id);
      if (member.status === 'administrator' || member.status === 'creator') {
        await bot.sendMessage(chatId,
          `✅ Бот является администратором в канале ${channelId}.\n\nМожно продолжать создание рекламы.`
        );
      } else {
        await bot.sendMessage(chatId,
          `❌ Бот не является администратором в канале ${channelId}.\n\nДобавьте бота как администратора и попробуйте снова.`
        );
      }
    } catch (e) {
      await bot.sendMessage(chatId,
        `⚠️ Не удалось проверить права в канале ${channelId}.\n\nУбедитесь что бот добавлен в канал как администратор.`
      );
    }
  } catch (error) {
    log(`Error in checkAdminRights: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при проверке прав.');
  }
}

export {
  showEarnMenu, showEarnChannels, showEarnChats, showEarnPostViews,
  subscribeToTask, showSubscriptionInstructions, showSubscriptionCheck,
  viewPost, showNextPost, checkSubscription,
  showAdvertiseMenu, startPostViewAd, startChannelAd, startChatAd, startReactionAd,
  handleReactionType, handleReactionAdInput, handleReactionPhotoInput,
  handleReactionPriceInput, handleReactionCountInput, confirmReactionAd,
  viewReactionPhoto, uploadReactionProof, handleReactionProofInput, reviewReactionProof,
  showEarnReactions, showEarnReactionsByType,
  isValidTelegramLink, extractTitleFromLink, notifyAdminAdCreated,
  notifyAdminPostViewAdCreated, notifyAdminReactionTaskForReview,
  notifyAdminReactionProofForReview,
  checkChatType, checkBotAdminRights, checkRealSubscription,
  scheduleUnsubscribeCheck, checkPendingPenalties,
  handleForwardedMessage, handleChannelAdInput, handleChatAdInput,
  handlePostViewInput, handlePostPriceInput, handleAdSubscribersInput,
  handlePostViewsInput, confirmPassword, rejectPassword, checkAdminRights,
  confirmAdCreation, confirmPostViewAd,
  checkHamyafkaSubscription, handleResubscribe, handlePromoCode
};
