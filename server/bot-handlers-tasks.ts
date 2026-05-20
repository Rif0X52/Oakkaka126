import { bot, botConfig, ADMIN_IDS, safeParseInt, notifyAllAdmins } from './bot-shared';
import { storage } from './storage';
import { log } from './vite';
import type { BotUser, AdTask } from '@shared/schema';

async function notifyAdminReactionProofReview(adminUser: BotUser, task: any, proof: any, action: string, awardedHamsters: number) {
  try {
    const adminMessage = `Проверка доказательства реакции завершена!

Администратор: ${adminUser.nickname} (${adminUser.telegramId})
Пользователь: ${proof.userId}
Задание: ${task.title || `ID: ${task.id}`}
Действие: ${action === 'approve' ? 'Одобрено' : 'Отклонено'}
Награждено: ${awardedHamsters} хамяфков
Дата: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for reaction proof review result: ${action} for user ${proof.userId} on task ${task.id}`);
  } catch (error) {
    log(`Error sending admin reaction proof review result notification: ${error}`);
  }
}

// Check if chat is a channel or group
async function approveReactionProof(chatId: number, taskOwner: BotUser, proofId: string) {
  try {
    const proof = await storage.getReactionProof(proofId);
    if (!proof) {
      await bot.sendMessage(chatId, 'Доказательство не найдено.');
      return;
    }

    const task = await storage.getReactionTask(proof.taskId);
    if (!task || task.creatorId !== taskOwner.id) {
      await bot.sendMessage(chatId, 'У вас нет прав для проверки этого задания.');
      return;
    }

    // Update proof status
    await storage.updateReactionProof(proofId, { status: 'approved' });

    // Award user
    const awardedHamsters = parseInt(task.pricePerReaction || '600');
    await storage.addHamsters(proof.userId, awardedHamsters);

    // Update task progress
    const newReactionsGot = parseInt(task.reactionsGot || '0') + 1;
    await storage.updateReactionTask(proof.taskId, { reactionsGot: newReactionsGot.toString() });

    // Check if task is completed
    if (newReactionsGot >= parseInt(task.reactionsNeeded || '0')) {
      await storage.updateReactionTask(proof.taskId, { status: 'completed' });
    }

    // Notify user
    const proofUser = await storage.getBotUser(proof.userId);
    if (proofUser) {
      await bot.sendMessage(proofUser.telegramId,
        `✅ Ваше доказательство одобрено!\n\n` +
        `Получено: ${awardedHamsters} хамяфков\n` +
        `Спасибо за выполнение задания!`
      );
    }

    await bot.sendMessage(chatId, '✅ Доказательство одобрено! Пользователь получил ' + awardedHamsters + ' хамяфков.');

    log(`Reaction proof approved: ${proofId} by task owner ${taskOwner.nickname}`);
  } catch (error) {
    log(`Error approving reaction proof: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при одобрении доказательства.');
  }
}

async function rejectReactionProof(chatId: number, taskOwner: BotUser, proofId: string) {
  try {
    const proof = await storage.getReactionProof(proofId);
    if (!proof) {
      await bot.sendMessage(chatId, 'Доказательство не найдено.');
      return;
    }

    const task = await storage.getReactionTask(proof.taskId);
    if (!task || task.creatorId !== taskOwner.id) {
      await bot.sendMessage(chatId, 'У вас нет прав для проверки этого задания.');
      return;
    }

    // Update proof status
    await storage.updateReactionProof(proofId, { status: 'rejected' });

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

    log(`Reaction proof rejected: ${proofId} by task owner ${taskOwner.nickname}`);
  } catch (error) {
    log(`Error rejecting reaction proof: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при отклонении доказательства.');
  }
}

async function submitAppeal(chatId: number, user: BotUser, proofId: string) {
  try {
    const proof = await storage.getReactionProof(proofId);
    if (!proof || proof.userId !== user.id) {
      await bot.sendMessage(chatId, 'Доказательство не найдено или у вас нет прав на апелляцию.');
      return;
    }

    if (proof.status !== 'rejected') {
      await bot.sendMessage(chatId, 'Апелляция возможна только для отклоненных доказательств.');
      return;
    }

    // Update proof status to appealed
    await storage.updateReactionProof(proofId, {
      status: 'appealed',
      appealedAt: new Date().toISOString()
    });

    await bot.sendMessage(chatId,
      `📝 Апелляция подана!

Ваше доказательство отправлено на рассмотрение администратору.

⏳ Ожидайте результата рассмотрения.`
    );

    // Notify admin
    await notifyAdminAboutAppeal(user, proofId);

    log(`Appeal submitted: ${proofId} by user ${user.nickname}`);
  } catch (error) {
    log(`Error submitting appeal: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при подаче апелляции.');
  }
}

async function adminApproveAppeal(chatId: number, proofId: string) {
  try {
    const proof = await storage.getReactionProof(proofId);
    if (!proof) {
      await bot.sendMessage(chatId, 'Доказательство не найдено.');
      return;
    }

    const task = await storage.getReactionTask(proof.taskId);
    if (!task) {
      await bot.sendMessage(chatId, 'Задание не найдено.');
      return;
    }

    const reward = parseInt(task.pricePerReaction || '0');

    // Update proof status
    await storage.updateReactionProof(proofId, { status: 'appeal_approved' });

    // Charge advertiser (can go negative)
    await storage.addHamsters(task.creatorId, -reward);

    // Award performer
    await storage.addHamsters(proof.userId, reward);

    // Increment reactions got
    const newReactionsGot = parseInt(task.reactionsGot || '0') + 1;
    await storage.updateReactionTask(proof.taskId, { reactionsGot: newReactionsGot.toString() });
    if (newReactionsGot >= parseInt(task.reactionsNeeded || '0')) {
      await storage.updateReactionTask(proof.taskId, { status: 'completed' });
    }

    // Notify performer
    const proofUser = await storage.getBotUser(proof.userId);
    if (proofUser) {
      await bot.sendMessage(proofUser.telegramId,
        `✅ Апелляция одобрена администратором!\n\n` +
        `Получено: ${reward} хамяфов\n\n` +
        `Спасибо за терпение!`
      );
    }

    // Notify advertiser
    const advertiser = await storage.getBotUser(task.creatorId);
    if (advertiser) {
      await bot.sendMessage(advertiser.telegramId,
        `⚠️ Апелляция по заданию одобрена администратором.\n` +
        `Списано: ${reward} хамяфов с вашего баланса.`
      );
    }

    await bot.sendMessage(chatId, `✅ Апелляция одобрена! Исполнитель получил ${reward} хамяфов.`);

    log(`Appeal approved by admin: ${proofId}, reward: ${reward} hamsters`);
  } catch (error) {
    log(`Error approving appeal: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при одобрении апелляции.');
  }
}

async function adminRejectAppeal(chatId: number, proofId: string) {
  try {
    const proof = await storage.getReactionProof(proofId);
    if (!proof) {
      await bot.sendMessage(chatId, 'Доказательство не найдено.');
      return;
    }

    // Update proof status
    await storage.updateReactionProof(proofId, { status: 'appeal_rejected' });

    // Notify user
    const proofUser = await storage.getBotUser(proof.userId);
    if (proofUser) {
      await bot.sendMessage(proofUser.telegramId,
        `❌ Ваша апелляция отклонена администратором.

К сожалению, задание признано невыполненным.`
      );
    }

    await bot.sendMessage(chatId, '❌ Апелляция отклонена. Пользователь уведомлен.');

    log(`Appeal rejected by admin: ${proofId}`);
  } catch (error) {
    log(`Error rejecting appeal: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при отклонении апелляции.');
  }
}

// Notification functions
async function notifyTaskOwnerForReactionReview(user: BotUser, taskId: string, photoFileId: string, proofId: string) {
  try {
    const task = await storage.getReactionTask(taskId);
    if (!task) return;

    const taskOwner = await storage.getBotUser(task.creatorId);
    if (!taskOwner) return;

    const reviewText = `📋 Новое доказательство реакции!

👤 От пользователя: ${user.nickname}
💰 Награда: ${task.pricePerReaction} хамяфков

Проверьте доказательство и примите решение:`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ Одобрить', callback_data: `approve_proof_${proofId}` }],
        [{ text: '❌ Отклонить', callback_data: `reject_proof_${proofId}` }]
      ]
    };

    await bot.sendPhoto(taskOwner.telegramId, photoFileId, {
      caption: reviewText,
      reply_markup: keyboard
    });
    await notifyAllAdmins(`📋 Новое доказательство реакции:\n${user.nickname}\n${task.title || taskId}`);
    await notifyAllAdmins(`📋 Новое доказательство реакции:\n${user.nickname}\n${task.title || taskId}`);

    log(`Task owner notified for reaction review: ${taskOwner.nickname} for proof ${proofId}`);
  } catch (error) {
    log(`Error notifying task owner: ${error}`);
  }
}

async function notifyAdminAboutAppeal(user: BotUser, proofId: string) {
  try {
    const proof = await storage.getReactionProof(proofId);
    const task = await storage.getReactionTask(proof.taskId);

    const adminMessage = `📝 Новая апелляция!

👤 Пользователь: ${user.nickname} (${user.telegramId})
💰 Задание: ${task?.pricePerReaction || 600} хамяфков
📅 Дата: ${new Date().toLocaleString('ru-RU')}

Доказательство пользователя было отклонено владельцем задания.
Требуется рассмотрение администратором.

Используйте /admin_menu для просмотра всех апелляций.`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notified about appeal: ${proofId} from user ${user.nickname}`);
  } catch (error) {
    log(`Error notifying admin about appeal: ${error}`);
  }
}

// Auto-compensation system
async function scheduleAutoCompensation(proofId: string, userId: string, amount: number) {
  // Store auto-compensation data
  const autoCompensation = {
    proofId,
    userId,
    amount: amount.toString(),
    scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
    processed: false,
    createdAt: new Date().toISOString()
  };

  await storage.createAutoCompensation(autoCompensation);
  log(`Auto-compensation scheduled for proof ${proofId} in 24 hours: ${amount} hamsters`);
}

// Check for auto-compensations (run every hour)
// Auto-approve proof after 24h if advertiser didn't review
async function checkAutoCompensations() {
  try {
    const pendingCompensations = await storage.getPendingAutoCompensations();

    for (const compensation of pendingCompensations) {
      const scheduledDate = new Date(compensation.scheduledFor);
      const now = new Date();

      if (now >= scheduledDate) {
        const proof = await storage.getReactionProof(compensation.proofId);

        if (proof && proof.status === 'pending') {
          const task = await storage.getReactionTask(proof.taskId);
          if (task) {
            const reward = parseInt(task.pricePerReaction || '0');

            // Auto-approve: charge advertiser, reward performer
            await storage.addHamsters(task.creatorId, -reward);
            await storage.addHamsters(proof.userId, reward);

            // Update task progress
            const newReactionsGot = parseInt(task.reactionsGot || '0') + 1;
            await storage.updateReactionTask(proof.taskId, { reactionsGot: newReactionsGot.toString() });
            if (newReactionsGot >= parseInt(task.reactionsNeeded || '0')) {
              await storage.updateReactionTask(proof.taskId, { status: 'completed' });
            }

            // Update proof
            await storage.updateReactionProof(compensation.proofId, { status: 'auto_approved' });

            // Notify performer
            const user = await storage.getBotUser(compensation.userId);
            if (user) {
              await bot.sendMessage(user.telegramId,
                `🔔 Автоматическое одобрение!

Владелец задания не рассмотрел ваше доказательство в течение 24 часов.

Задание автоматически одобрено!\n` +
                `Получено: ${reward} хамяфов`
              );
            }

            // Notify advertiser
            const advertiser = await storage.getBotUser(task.creatorId);
            if (advertiser) {
              await bot.sendMessage(advertiser.telegramId,
                `⏰ Задание автоматически одобрено (вы не проверили в течение 24 ч).\n` +
                `Списано: ${reward} хамяфов`
              );
            }

            log(`Auto-approved after 24h: proof ${compensation.proofId}, reward ${reward} hamsters`);
          }
        }

        // Mark compensation as processed regardless
        await storage.updateAutoCompensation(compensation.id, { processed: true });
      }
    }
  } catch (error) {
    log(`Error checking auto-compensations: ${error}`);
  }
}



// Start auto-compensation checking (run every hour)
// Note: checkAutoCompensations is scheduled in bot-setup.ts



// Creator management functions
async function showManageTasksMenu(chatId: number, user: BotUser) {
  const menuText = `📁 Управление заданиями

Выберите тип заданий:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📢 Каналы', callback_data: 'manage_tasks_channel' }],
      [{ text: '💬 Чаты', callback_data: 'manage_tasks_chat' }],
      [{ text: '👁 Просмотр постов', callback_data: 'manage_tasks_post_view' }],
      [{ text: '👍 Реакции', callback_data: 'manage_tasks_reaction' }],
      [{ text: '⬅️ Назад', callback_data: 'additional_menu' }]
    ]
  };

  await bot.sendMessage(chatId, menuText, { reply_markup: keyboard });
}

// Show user's tasks by type with management options
async function showManageTasksByType(chatId: number, user: BotUser, type: string) {
  try {
    const userTasks = await storage.getUserAdTasks(user.id);
    const filteredTasks = userTasks.filter(t => t.type === type && t.isActive);

    const typeLabels: Record<string, string> = {
      channel: 'Каналы',
      chat: 'Чаты',
      post_view: 'Просмотр постов',
      reaction: 'Реакции'
    };

    if (filteredTasks.length === 0) {
      await bot.sendMessage(chatId,
        `📁 ${typeLabels[type] || type}\n\nУ вас нет активных заданий этого типа.`,
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'manage_my_tasks' }]] } }
      );
      return;
    }

    let text = `📁 Ваши задания: ${typeLabels[type] || type}\n\n`;
    const buttons = [];

    for (const task of filteredTasks) {
      const got = parseInt(task.subscribersGot || '0');
      const need = parseInt(task.subscribersNeeded || '0');
      const remaining = need - got;
      const isCompleted = remaining <= 0;

      text += `📝 ${task.title}\n`;
      text += `🔗 ${task.link}\n`;
      text += `👥 Выполнено: ${got}/${need}\n`;
      text += `💰 Осталось: ${task.remainingAmount} хамяфков\n`;
      text += `📊 Статус: ${isCompleted ? '✅ Завершено' : '🔄 В процессе'}\n\n`;

      if (!isCompleted) {
        buttons.push([{
          text: `🗑 Удалить "${task.title.substring(0, 20)}${task.title.length > 20 ? '...' : ''}"`,
          callback_data: `delete_managed_${task.id}`
        }]);
      }
    }

    buttons.push([{ text: '⬅️ Назад', callback_data: 'manage_my_tasks' }]);

    await bot.sendMessage(chatId, text, { reply_markup: { inline_keyboard: buttons } });
  } catch (error) {
    log(`Error showing managed tasks: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при загрузке заданий.');
  }
}

// Delete a managed task with partial refund based on completions
async function deleteManagedTask(chatId: number, user: BotUser, taskId: string) {
  try {
    const task = await storage.getAdTask(taskId);

    if (!task || task.creatorId !== user.id) {
      await bot.sendMessage(chatId, 'Задание не найдено.');
      return;
    }

    if (!task.isActive) {
      await bot.sendMessage(chatId, '❌ Это задание уже удалено.');
      return;
    }

    const got = parseInt(task.subscribersGot || '0');
    const need = parseInt(task.subscribersNeeded || '0');
    const rewardPer = parseInt(task.rewardPerSubscriber || '600');
    const remaining = need - got;

    if (remaining <= 0) {
      await bot.sendMessage(chatId, '❌ Задание уже завершено, удаление невозможно.');
      return;
    }

    const refundAmount = remaining * rewardPer;
    const currentBalance = parseInt(user.hamsters || '0');
    const newBalance = currentBalance + refundAmount;

    await storage.updateBotUser(user.id, { hamsters: newBalance.toString() });
    await storage.updateAdTask(taskId, { isActive: false });

    await bot.sendMessage(chatId,
      `✅ Задание удалено!\n\n` +
      `📝 ${task.title}\n` +
      `👥 Выполнено: ${got}/${need}\n` +
      `💰 Возврат: ${refundAmount} хамяфков\n` +
      `💳 Новый баланс: ${newBalance} хамяфков`
    );

    log(`Managed task deleted: ${task.title} by ${user.nickname}, refund: ${refundAmount}`);

    // Return to task type list
    setTimeout(() => showManageTasksByType(chatId, user, task.type), 2000);
  } catch (error) {
    log(`Error deleting managed task: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при удалении задания.');
  }
}

// Periodic check for active channel/chat tasks - delete if channel removed or username changed
async function checkActiveTasksHealth() {
  try {
    const activeTasks = await storage.getActiveAdTasks();
    const channelChatTasks = activeTasks.filter(t =>
      (t.type === 'channel' || t.type === 'chat') && t.isActive
    );

    for (const task of channelChatTasks) {
      try {
        let chatUsername = task.link;
        if (chatUsername.includes('t.me/')) {
          chatUsername = '@' + chatUsername.split('t.me/')[1];
        }

        // Try to get chat info - if it fails, channel was deleted or username changed
        const chatInfo = await bot.getChat(chatUsername);

        // If we got chat info successfully, check if title matches
        // If title changed drastically, the channel might have been repurposed
        // (Skip this check as it's too aggressive)

      } catch (error: any) {
        // Chat not found - channel deleted or username changed
        log(`Channel/chat not found for task ${task.title} (${task.id}). Deleting task.`);

        const creator = await storage.getBotUser(task.creatorId);
        if (creator) {
          const got = parseInt(task.subscribersGot || '0');
          const need = parseInt(task.subscribersNeeded || '0');
          const rewardPer = parseInt(task.rewardPerSubscriber || '600');
          const remaining = need - got;
          const refundAmount = remaining * rewardPer;

          const currentBalance = parseInt(creator.hamsters || '0');
          const newBalance = currentBalance + refundAmount;

          await storage.updateBotUser(creator.id, { hamsters: newBalance.toString() });

          // Notify creator
          await bot.sendMessage(creator.telegramId,
            `⚠️ Ваше задание автоматически удалено!\n\n` +
            `📝 ${task.title}\n` +
            `Причина: канал/чат был удалён или сменил юзернейм\n\n` +
            `💰 Возврат: ${refundAmount} хамяфков\n` +
            `💳 Новый баланс: ${newBalance} хамяфков`
          );
        }

        // Mark task as inactive
        await storage.updateAdTask(task.id, { isActive: false });
      }
    }
  } catch (error) {
    log(`Error checking active tasks health: ${error}`);
  }
}

// Handle resubscribe after penalty warning
async function startReactionTask(chatId: number, user: BotUser, taskId: string) {
  try {
    const task = await storage.getReactionTask(taskId);
    if (!task) {
      await bot.sendMessage(chatId, 'Задание не найдено.');
      return;
    }

    const proofExists = await storage.hasReactionProofForUser(user.id, taskId);
    if (proofExists) {
      await bot.sendMessage(chatId, 'Вы уже выполняли это задание.');
      return;
    }

    let text = `✈️ Задание на реакцию

`;
    text += `Награда: ${task.pricePerReaction} хамяфов\n\n`;

    if (task.messageLink) {
      text += `📝 Перейдите по ссылке и поставьте реакцию:\n${task.messageLink}\n\n`;
      text += `После выполнения отправьте скриншот-подтверждение.`;
    } else if (task.photoFileId) {
      text += `🖼 Поставьте реакцию на фото выше!\n\n`;
      text += `После выполнения отправьте скриншот-подтверждение.`;
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: `📸 Отправить скриншот (+${task.pricePerReaction})`, callback_data: `upload_reaction_proof_${taskId}` }]
      ]
    };

    if (task.messageLink) {
      keyboard.inline_keyboard.unshift([{ text: '📌 Открыть пост', url: task.messageLink }]);
    } else if (task.photoFileId) {
      await bot.sendPhoto(chatId, task.photoFileId, { caption: text, reply_markup: keyboard });
      return;
    }

    await bot.sendMessage(chatId, text, { reply_markup: keyboard });
  } catch (error) {
    log(`Error in startReactionTask: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при загрузке задания.');
  }
}


export {
  notifyAdminReactionProofReview,
  approveReactionProof, rejectReactionProof, submitAppeal,
  adminApproveAppeal, adminRejectAppeal,
  notifyTaskOwnerForReactionReview, notifyAdminAboutAppeal,
  scheduleAutoCompensation, checkAutoCompensations,
  showManageTasksMenu, showManageTasksByType, deleteManagedTask,
  checkActiveTasksHealth, startReactionTask
};
