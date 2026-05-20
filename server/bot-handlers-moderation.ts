import { bot, botConfig, ADMIN_IDS, safeParseInt, notifyAllAdmins } from './bot-shared';
import { storage } from './storage';
import { log } from './vite';
import type { BotUser } from '@shared/schema';

async function handleMuteCommand(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const moderatorId = msg.from?.id.toString();
    const targetUserId = msg.reply_to_message?.from?.id.toString();
    const text = msg.text || '';

    if (!moderatorId || !targetUserId || moderatorId === targetUserId) {
      return;
    }

    // Parse mute command: х мут 1день спам
    const muteMatch = text.match(/^х\s+мут\s+(\d+\s*(?:минут?|час|часа|часов|день|дня|дней|недел[яи]|месяц|месяца|месяцев))\s*(.*)$/i);
    if (!muteMatch) {
      await bot.sendMessage(chatId, 'Неверный формат команды!\n\nИспользуйте: х мут [время] [причина]\n\nПримеры времени:\n• 30 минут\n• 2 часа\n• 1 день\n• 1 неделя', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const durationText = muteMatch[1].trim();
    const reason = muteMatch[2].trim() || 'Не указана';

    // Check if moderator has rights (moderator rights OR custom role with mute permission)
    const hasModeratorRights = await checkModeratorRights(chatId, moderatorId);
    const hasRolePermission = await checkCustomRolePermission(chatId, moderatorId, 'mute');
    const isAppointedAdmin = await storage.isChatAdmin(chatId, moderatorId);

    if (!hasModeratorRights && !hasRolePermission && !isAppointedAdmin) {
      await bot.sendMessage(chatId, 'У вас нет прав для использования этой команды!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Parse duration to milliseconds
    const duration = parseDuration(durationText);
    if (!duration) {
      await bot.sendMessage(chatId, 'Неверный формат времени!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const muteUntil = new Date(Date.now() + duration).toISOString();

    // Create mute record
    await storage.createChatMute({
      chatId: chatId,
      userId: targetUserId,
      mutedBy: moderatorId,
      muteReason: reason,
      muteDuration: duration.toString(),
      muteUntil: muteUntil,
      isActive: true
    });

    // Immediately restrict user permissions
    try {
      await bot.restrictChatMember(chatId, parseInt(targetUserId), {
        permissions: {
          can_send_messages: false,
          can_send_media_messages: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_send_polls: false,
          can_invite_users: false,
          can_pin_messages: false,
          can_change_info: false
        }
      });
      log(`User ${targetUserId} muted - permissions restricted in chat ${chatId}`);
    } catch (error) {
      log(`Could not restrict user permissions: ${error}`);
    }

    const targetUsername = msg.reply_to_message.from?.first_name || msg.reply_to_message.from?.username || 'Пользователь';
    const moderatorUser = await storage.getBotUserByTelegramId(moderatorId);
    const moderatorName = moderatorUser?.nickname || msg.from?.first_name || 'Модератор';

    await bot.sendMessage(chatId, 
      `${targetUsername} получил мут на ${durationText}\n` +
      `Модератор: ${moderatorName}\n` +
      `Причина: ${reason}`, 
      {
        reply_to_message_id: msg.message_id
      }
    );

  } catch (error) {
    log(`Error handling mute command: ${error}`);
  }
}


async function handleAppointAdmin(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const ownerId = msg.from?.id.toString();
    const targetUserId = msg.reply_to_message?.from?.id.toString();

    if (!ownerId || !targetUserId || ownerId === targetUserId) {
      return;
    }

    // Check if user is chat owner
    const isOwner = await checkChatOwner(chatId, ownerId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может назначать администраторов!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Check if target is already admin
    const isAlreadyAdmin = await storage.isChatAdmin(chatId, targetUserId);
    if (isAlreadyAdmin) {
      await bot.sendMessage(chatId, 'Пользователь уже является администратором!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Appoint admin
    await storage.createChatAdmin({
      chatId: chatId,
      userId: targetUserId,
      appointedBy: ownerId
    });

    const targetUsername = msg.reply_to_message.from?.first_name || msg.reply_to_message.from?.username || 'Пользователь';
    const ownerUser = await storage.getBotUserByTelegramId(ownerId);
    const ownerName = ownerUser?.nickname || msg.from?.first_name || 'Владелец';

    await bot.sendMessage(chatId, 
      `${targetUsername} назначен администратором бота в этом чате\n` +
      `Теперь может использовать команды модерации (мут)\n` +
      `Назначил: ${ownerName}`, 
      {
        reply_to_message_id: msg.message_id
      }
    );

    log(`User ${targetUserId} appointed as admin in chat ${chatId} by ${ownerId}`);
  } catch (error: any) {
    log(`Error handling admin appointment: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при назначении администратора.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleHamyafkaWho(msg: any, word: string) {
  try {
    const chatId = msg.chat.id.toString();

    // Get active user IDs in this chat
    const activeIds = await storage.getChatActiveUserIds(chatId);
    if (activeIds.length === 0) {
      await bot.sendMessage(msg.chat.id,
        `Я уверена то что ${word} ... никто (в чате нет активных участников)`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    // Pick a random user from active IDs and get their info
    const randomId = activeIds[Math.floor(Math.random() * activeIds.length)];
    let displayName = '';

    // First try to get from our storage (most reliable)
    try {
      const botUser = await storage.getBotUserByTelegramId(randomId);
      if (botUser && botUser.username) {
        displayName = `@${botUser.username}`;
      } else if (botUser && botUser.nickname) {
        displayName = botUser.nickname;
      }
    } catch (_) {}

    // If no name from storage, try Telegram API
    if (!displayName) {
      try {
        const member = await bot.getChatMember(chatId, parseInt(randomId));
        if (member.user.username) {
          displayName = `@${member.user.username}`;
        } else {
          displayName = member.user.first_name || 'участник';
        }
      } catch (_) {
        displayName = 'участник чата';
      }
    }

    await bot.sendMessage(msg.chat.id,
      `Я уверена то что ${word} ${displayName}`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    log(`Error in handleHamyafkaWho: ${error}`);
  }
}

async function handleShowAdmins(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    let adminText = 'Список Администраторов\n\n';
    const formatUser = async (userId: string) => {
      try {
        const u = await storage.getBotUserByTelegramId(userId);
        if (u?.username) return `@${u.username}`;
        if (u?.nickname) return `[${u.nickname}](tg://user?id=${userId})`;
      } catch (_) {}
      try {
        const m = await bot.getChatMember(chatId, parseInt(userId));
        if (m.user.username) return `@${m.user.username}`;
        return `[${m.user.first_name || `id${userId}`}](tg://user?id=${userId})`;
      } catch (_) {}
      return `tg://user?id=${userId}`;
    };

    // Get chat settings (fake creator, hidden creator)
    let chatSettings: any = null;
    try { chatSettings = await storage.getChatSettings(chatId); } catch (_) {}

    // Get creator from Telegram (wrapped, won't fail outer try)
    let chatCreator: any = null;
    try {
      const chatAdmins = await bot.getChatAdministrators(chatId);
      chatCreator = chatAdmins.find((a: any) => a.status === 'creator' && !a.user.is_bot);
    } catch (error) {
      log(`getChatAdministrators failed: ${error}`);
    }

    // Show creator
    if (chatSettings?.fakeCreatorId) {
      let displayName = '';
      try {
        const m = await bot.getChatMember(chatId, parseInt(chatSettings.fakeCreatorId));
        displayName = m.user.username ? `@${m.user.username}` : m.user.first_name;
      } catch (_) {
        try {
          const u = await storage.getBotUserByTelegramId(chatSettings.fakeCreatorId);
          displayName = u?.nickname || u?.username ? `@${u?.username}` : 'Неизвестный';
        } catch (_2) { displayName = 'Неизвестный'; }
      }
      adminText += `Создатель ${displayName}\n\n`;
    } else if (chatCreator && !chatSettings?.creatorHidden) {
      const u = chatCreator.user;
      adminText += `Создатель ${u.username ? `@${u.username}` : u.first_name}\n\n`;
    }

    // Get bot-appointed admins
    let botAdmins: any[] = [];
    try { botAdmins = await storage.getAllChatAdmins(chatId); } catch (_) {}

    if (botAdmins.length > 0) {
      adminText += 'Админы\n';
      for (const admin of botAdmins) {
        adminText += `Админ ${await formatUser(admin.userId)}\n`;
      }
    }

    // Get users with custom roles
    let allRoleAssignments: any[] = [];
    try { allRoleAssignments = await storage.getRoleAssignmentsByChat(chatId); } catch (_) {}

    // Show users with custom roles
    if (allRoleAssignments.length > 0) {
      const roleUsers = new Map<string, string[]>();
      for (const assignment of allRoleAssignments) {
        try {
          const role = await storage.getCustomRole(assignment.roleId);
          if (role) {
            if (!roleUsers.has(assignment.userId)) roleUsers.set(assignment.userId, []);
            roleUsers.get(assignment.userId)!.push(role.displayName);
          }
        } catch (_) {}
      }

      if (roleUsers.size > 0) {
        if (botAdmins.length > 0) adminText += '\n';
        adminText += '\nРоли\n';
        for (const [userId, roles] of roleUsers.entries()) {
          adminText += `${roles.join(', ')} ${await formatUser(userId)}\n`;
        }
      }
    }

    if (botAdmins.length === 0 && allRoleAssignments.length === 0 && !chatCreator && !chatSettings?.fakeCreatorId) {
      adminText += 'Администраторов не назначено.';
    }

    await bot.sendMessage(chatId, adminText, { reply_to_message_id: msg.message_id });
    log(`Admin list shown in chat ${chatId}`);
  } catch (error: any) {
    log(`Error showing admins: ${error}`);
    // Try to still show something useful
    try {
      const botAdmins2 = await storage.getAllChatAdmins(msg.chat.id.toString());
      let fallbackText = 'Список Администраторов\n\n';
      if (botAdmins2.length > 0) {
        fallbackText += 'Админы:\n';
        for (const a of botAdmins2) {
          const u = await storage.getBotUserByTelegramId(a.userId).catch(() => null);
          fallbackText += `${u?.nickname || u?.username || a.userId}\n`;
        }
      } else {
        fallbackText += 'Администраторов не назначено.';
      }
      await bot.sendMessage(msg.chat.id, fallbackText, { reply_to_message_id: msg.message_id });
    } catch (_) {
      await bot.sendMessage(msg.chat.id, 'Не удалось получить список администраторов.', { reply_to_message_id: msg.message_id });
    }
  }
}

async function handleShowMyInfo(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const userId = msg.from?.id.toString();

    if (!userId) {
      return;
    }

    // Получаем пользователя из бота
    const user = await storage.getBotUserByTelegramId(userId);

    if (!user || !user.isRegistered) {
      await bot.sendMessage(chatId, 'Вам нужно зарегистрироваться в боте. Напишите боту в личные сообщения для регистрации.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Определяем роль пользователя в чате
    let userRole = 'участник';

    try {
      // Сначала проверяем админов бота
      const isAdmin = await storage.isChatAdmin(chatId, userId);
      if (isAdmin) {
        userRole = 'админ';
      } else {
        // Проверяем пользовательские роли
    const userRoles = await storage.getUserRoles(chatId, userId);
        if (userRoles.length > 0) {
          const names = [];
          for (const role of userRoles) {
            const fullRole = await storage.getCustomRole(role.roleId);
            if (fullRole?.displayName) names.push(fullRole.displayName);
            else if (fullRole?.name) names.push(fullRole.name);
          }
          userRole = names.length ? names.join(', ') : userRole;
        } else {
          // Только если нет роли в боте, проверяем статус в Telegram
          const chatMember = await bot.getChatMember(chatId, parseInt(userId));

          if (chatMember.status === 'creator') {
            userRole = 'создатель';
          } else if (chatMember.status === 'administrator') {
            userRole = 'администратор Telegram';
          }
          // Если обычный участник, роль остается 'участник'
        }
      }
    } catch (error) {
      log(`Error getting user chat status: ${error}`);
      // Если ошибка, проверяем только наши данные
      const isAdmin = await storage.isChatAdmin(chatId, userId);
      if (isAdmin) {
        userRole = 'админ';
      } else {
      const userRoles = await storage.getUserRoles(chatId, userId);
        if (userRoles.length > 0) {
          const names = [];
          for (const role of userRoles) {
            const fullRole = await storage.getCustomRole(role.roleId);
            if (fullRole?.displayName) names.push(fullRole.displayName);
            else if (fullRole?.name) names.push(fullRole.name);
          }
          userRole = names.length ? names.join(', ') : userRole;
        }
      }
    }

    const infoText = `Вы ${user.nickname}, а в этом чате ${userRole}`;

    await bot.sendMessage(chatId, infoText, {
      reply_to_message_id: msg.message_id
    });

    log(`User info shown for ${user.nickname} in chat ${chatId}`);
  } catch (error: any) {
    log(`Error showing user info: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при получении информации о пользователе.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleRemoveAdmin(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const ownerId = msg.from?.id.toString();
    const targetUserId = msg.reply_to_message?.from?.id.toString();

    if (!ownerId || !targetUserId || ownerId === targetUserId) {
      return;
    }

    // Check if user is chat owner
    const isOwner = await checkChatOwner(chatId, ownerId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может снимать администраторов!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Check if target is admin
    const isAdmin = await storage.isChatAdmin(chatId, targetUserId);
    if (!isAdmin) {
      await bot.sendMessage(chatId, 'Пользователь не является администратором!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Remove admin
    await storage.removeChatAdmin(chatId, targetUserId);

    const targetUsername = msg.reply_to_message.from?.first_name || msg.reply_to_message.from?.username || 'Пользователь';
    const ownerUser = await storage.getBotUserByTelegramId(ownerId);
    const ownerName = ownerUser?.nickname || msg.from?.first_name || 'Владелец';

    await bot.sendMessage(chatId, 
      `${targetUsername} снят с должности администратора бота\n` +
      `Больше не может использовать команды модерации\n` +
      `Снял: ${ownerName}`, 
      {
        reply_to_message_id: msg.message_id
      }
    );

    log(`User ${targetUserId} removed as admin in chat ${chatId} by ${ownerId}`);
  } catch (error: any) {
    log(`Error handling admin removal: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при снятии администратора.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function checkCustomRolePermission(chatId: string, userId: string, permission: string): Promise<boolean> {
  try {
    // Get user's role assignments for this chat
    const assignments = await storage.getRoleAssignmentsByUser(userId, chatId);

    for (const assignment of assignments) {
      const role = await storage.getCustomRole(assignment.roleId);
      if (role && role.chatId === chatId) {
        const permissions = JSON.parse(role.permissions || '[]');
        if (permissions.includes(permission)) {
          log(`User ${userId} has permission ${permission} via role ${role.name} in chat ${chatId}`);
          return true;
        }
      }
    }

    log(`User ${userId} does not have permission ${permission} in chat ${chatId}`);
    return false;
  } catch (error) {
    log(`Error checking custom role permission: ${error}`);
    return false;
  }
}

async function checkModeratorRights(chatId: string, userId: string): Promise<boolean> {
  try {
    // Сначала проверяем, является ли пользователь владельцем чата в Telegram
    const chatMember = await bot.getChatMember(chatId, parseInt(userId));
    if (chatMember.status === 'creator') {
      return true;
    }

    // Проверяем, назначен ли пользователь админом через нашего бота
    const isAppointedAdmin = await storage.isChatAdmin(chatId, userId);
    return isAppointedAdmin;
  } catch (error) {
    log(`Error checking moderator rights: ${error}`);
    return false;
  }
}

async function checkChatOwner(chatId: string, userId: string): Promise<boolean> {
  try {
    const chatMember = await bot.getChatMember(chatId, parseInt(userId));
    return chatMember.status === 'creator';
  } catch (error) {
    log(`Error checking chat owner: ${error}`);
    return false;
  }
}

function parseDuration(durationText: string): number | null {
  const match = durationText.match(/(\d+)\s*(минут?|час|часа|часов|день|дня|дней|недел[яи]|месяц|месяца|месяцев)/i);
  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.includes('минут')) {
    return amount * 60 * 1000;
  } else if (unit.includes('час')) {
    return amount * 60 * 60 * 1000;
  } else if (unit.includes('день') || unit.includes('дня') || unit.includes('дней')) {
    return amount * 24 * 60 * 60 * 1000;
  } else if (unit.includes('недел')) {
    return amount * 7 * 24 * 60 * 60 * 1000;
  } else if (unit.includes('месяц')) {
    return amount * 30 * 24 * 60 * 60 * 1000;
  }

  return null;
}

async function handleUnmute(chatId: string, userId: string, username: string) {
  try {
    const activeMute = await storage.getActiveMute(chatId, userId);
    if (activeMute) {
      await storage.deactivateMute(activeMute.id);

      // Restore full user permissions - try multiple approaches
      let restored = false;

      // Use restrictChatMember only (ban/unban KICKS user from group chats!)
      try {
        await bot.restrictChatMember(chatId, parseInt(userId), {
          permissions: {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_send_polls: true,
            can_invite_users: true,
            can_pin_messages: false,
            can_change_info: false
          }
        });
        log(`User ${userId} auto-unmuted via restrictChatMember in chat ${chatId}`);
        restored = true;
      } catch (error) {
        log(`Auto-unmute restrictChatMember failed: ${error}`);
      }

      if (!restored) {
        log(`Could not auto-restore user permissions for ${userId}`);
      }

      await bot.sendMessage(chatId, `${username} может снова общаться в чате`);
      log(`User ${userId} unmuted in chat ${chatId}`);
    }
  } catch (error) {
    log(`Error handling unmute: ${error}`);
  }
}

// Check expired mutes periodically
async function checkExpiredMutes() {
  try {
    const expiredMutes = await storage.getExpiredMutes();

    for (const mute of expiredMutes) {
      await storage.deactivateMute(mute.id);

      try {
        // Restore full user permissions
        await bot.restrictChatMember(mute.chatId, parseInt(mute.userId), {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_send_polls: true,
          can_invite_users: true,
          can_pin_messages: false,
          can_change_info: false
        });

        // Get user info for unmute message
        const user = await storage.getBotUserByTelegramId(mute.userId);
        const username = user?.nickname || 'Пользователь';

        await bot.sendMessage(mute.chatId, `${username} может снова общаться в чате`);
        log(`User ${mute.userId} automatically unmuted in chat ${mute.chatId}`);
      } catch (error) {
        log(`Error sending unmute message or restoring permissions: ${error}`);
      }
    }
  } catch (error) {
    log(`Error checking expired mutes: ${error}`);
  }
}

// Note: checkExpiredMutes and processWebMessages are scheduled in bot-setup.ts

// Admin menu functions
async function showAdminMenu(chatId: number) {
  const appealedProofs = await storage.getAppealedReactionProofs();

  const adminText = `🔧 Админ панель

Доступные действия:

• Апелляции: ${appealedProofs.length} ожидают рассмотрения
• Статистика пользователей
• Управление заданиями
• Обнуление балансов
• Обнуление армий хамяков
• Управление банами`;

  const keyboard = {
    inline_keyboard: [
      [{ text: `Апелляции (${appealedProofs.length})`, callback_data: 'view_appeals' }],
      [{ text: '📊 Статистика', callback_data: 'view_stats' }],
      [{ text: '💰 Обнулить баланс', callback_data: 'reset_balance_menu' }],
      [{ text: '🐹 Обнулить армию', callback_data: 'reset_army_menu' }],
      [{ text: '🚫 Бан пользователя', callback_data: 'ban_user_menu' }],
      [{ text: '🔙 Закрыть', callback_data: 'admin_menu' }]
    ]
  };

  await bot.sendMessage(chatId, adminText, { reply_markup: keyboard });
}

async function showAppeals(chatId: number) {
  try {
    const appealedProofs = await storage.getAppealedReactionProofs();

    if (appealedProofs.length === 0) {
      await bot.sendMessage(chatId, '📋 Апелляции\n\nНет активных апелляций для рассмотрения.');
      return;
    }

    let appealsText = `Апелляции (${appealedProofs.length})\n\n`;

    const buttons = [];

    for (const proof of appealedProofs.slice(0, 10)) {
      const user = await storage.getBotUser(proof.userId);
      const task = await storage.getReactionTask(proof.taskId);

      appealsText += `👤 ${user?.nickname || 'Неизвестен'}\n`;
      appealsText += `💰 Задание: ${task?.pricePerReaction || 600} хамяфков\n`;
      appealsText += `📅 ${new Date(proof.appealedAt || '').toLocaleDateString('ru-RU')}\n\n`;

      // Send photo
      if (proof.proofImageUrl) {
        await bot.sendPhoto(chatId, proof.proofImageUrl, {
          caption: `Апелляция от ${user?.nickname}\nЗадание: ${task?.pricePerReaction || 600} хамяфков`
        });
      }

      buttons.push([
        { text: `✅ Одобрить (${user?.nickname})`, callback_data: `admin_approve_appeal_${proof.id}` },
        { text: `❌ Отклонить (${user?.nickname})`, callback_data: `admin_reject_appeal_${proof.id}` }
      ]);
    }

    buttons.push([{ text: '🔙 Назад', callback_data: 'admin_menu' }]);

    const keyboard = { inline_keyboard: buttons };
    await bot.sendMessage(chatId, appealsText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error showing appeals: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при загрузке апелляций.');
  }
}

// Reaction proof review functions
async function handleHideCreator(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const userId = msg.from?.id.toString();

    if (!userId) return;

    // Check if user is chat owner
    const isOwner = await checkChatOwner(chatId, userId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может скрыть создателя!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Update chat settings to hide creator
    await storage.updateChatSettings(chatId, { creatorHidden: true, fakeCreatorId: null });

    await bot.sendMessage(chatId, 'Создатель скрыт и не будет отображаться в списке администраторов.', {
      reply_to_message_id: msg.message_id
    });

    log(`Creator hidden in chat ${chatId} by ${userId}`);
  } catch (error: any) {
    log(`Error hiding creator: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при скрытии создателя.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleShowCreator(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const userId = msg.from?.id.toString();

    if (!userId) return;

    // Check if user is chat owner
    const isOwner = await checkChatOwner(chatId, userId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может показать создателя!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Update chat settings to show creator
    await storage.updateChatSettings(chatId, { creatorHidden: false, fakeCreatorId: null });

    await bot.sendMessage(chatId, 'Создатель теперь отображается в списке администраторов.', {
      reply_to_message_id: msg.message_id
    });

    log(`Creator shown in chat ${chatId} by ${userId}`);
  } catch (error: any) {
    log(`Error showing creator: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при отображении создателя.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleFakeCreator(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const ownerId = msg.from?.id.toString();
    const targetUserId = msg.reply_to_message?.from?.id.toString();

    if (!ownerId || !targetUserId || ownerId === targetUserId) {
      return;
    }

    // Check if user is chat owner
    const isOwner = await checkChatOwner(chatId, ownerId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может назначить фейкового создателя!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Update chat settings to set fake creator
    await storage.updateChatSettings(chatId, { 
      creatorHidden: false, 
      fakeCreatorId: targetUserId 
    });

    const targetUsername = msg.reply_to_message.from?.first_name || msg.reply_to_message.from?.username || 'Пользователь';
    const ownerUser = await storage.getBotUserByTelegramId(ownerId);
    const ownerName = ownerUser?.nickname || msg.from?.first_name || 'Владелец';

    await bot.sendMessage(chatId, 
      `${targetUsername} назначен фейковым создателем чата\n` +
      `Теперь будет отображаться как создатель в команде "х кто админ"\n` +
      `Назначил: ${ownerName}`, 
      {
        reply_to_message_id: msg.message_id
      }
    );

    log(`Fake creator set: ${targetUserId} in chat ${chatId} by ${ownerId}`);
  } catch (error: any) {
    log(`Error setting fake creator: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при назначении фейкового создателя.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleBanCommand(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const moderatorId = msg.from?.id.toString();
    const targetUserId = msg.reply_to_message?.from?.id.toString();

    if (!moderatorId || !targetUserId || moderatorId === targetUserId) {
      return;
    }

    // Check if user is chat owner OR has ban permission through custom role
    const isOwner = await checkChatOwner(chatId, moderatorId);
    const hasRolePermission = await checkCustomRolePermission(chatId, moderatorId, 'ban');

    if (!isOwner && !hasRolePermission) {
      await bot.sendMessage(chatId, 'У вас нет прав для использования этой команды!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Ban user from chat
    try {
      await bot.banChatMember(chatId, parseInt(targetUserId));
      log(`User ${targetUserId} banned from chat ${chatId} by ${moderatorId}`);
    } catch (error) {
      log(`Could not ban user ${targetUserId}: ${error}`);
      await bot.sendMessage(chatId, 'Ошибка при бане пользователя. Проверьте права бота.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const targetUsername = msg.reply_to_message.from?.first_name || msg.reply_to_message.from?.username || 'Пользователь';
    const moderatorUser = await storage.getBotUserByTelegramId(moderatorId);
    const moderatorName = moderatorUser?.nickname || msg.from?.first_name || 'Модератор';

    await bot.sendMessage(chatId, 
      `${targetUsername} заблокирован в чате\n` +
      `Модератор: ${moderatorName}`, 
      {
        reply_to_message_id: msg.message_id
      }
    );

    log(`User ${targetUserId} banned in chat ${chatId} by ${moderatorId}`);
  } catch (error: any) {
    log(`Error handling ban command: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при выполнении команды бана.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleUnbanCommand(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const moderatorId = msg.from?.id.toString();
    const targetUserId = msg.reply_to_message?.from?.id.toString();

    if (!moderatorId || !targetUserId || moderatorId === targetUserId) {
      return;
    }

    // Check if user is chat owner OR has ban permission through custom role
    const isOwner = await checkChatOwner(chatId, moderatorId);
    const hasRolePermission = await checkCustomRolePermission(chatId, moderatorId, 'ban');

    if (!isOwner && !hasRolePermission) {
      await bot.sendMessage(chatId, 'У вас нет прав для использования этой команды!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Unban user from chat
    try {
      await bot.unbanChatMember(chatId, parseInt(targetUserId));
      log(`User ${targetUserId} unbanned from chat ${chatId} by ${moderatorId}`);
    } catch (error) {
      log(`Could not unban user ${targetUserId}: ${error}`);
      await bot.sendMessage(chatId, 'Ошибка при разбане пользователя. Возможно, пользователь не был забанен.', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const targetUsername = msg.reply_to_message.from?.first_name || msg.reply_to_message.from?.username || 'Пользователь';
    const moderatorUser = await storage.getBotUserByTelegramId(moderatorId);
    const moderatorName = moderatorUser?.nickname || msg.from?.first_name || 'Модератор';

    await bot.sendMessage(chatId, 
      `${targetUsername} разблокирован в чате\n` +
      `Модератор: ${moderatorName}`, 
      {
        reply_to_message_id: msg.message_id
      }
    );

    log(`User ${targetUserId} unbanned in chat ${chatId} by ${moderatorId}`);
  } catch (error: any) {
    log(`Error handling unban command: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при выполнении команды разбана.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleCreateCustomRole(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const ownerId = msg.from?.id.toString();
    const text = msg.text || '';

    if (!ownerId) {
      return;
    }

    // Check if user is chat owner (only owner can create custom roles)
    const isOwner = await checkChatOwner(chatId, ownerId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может создавать пользовательские роли!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Parse role name from command: х создать модер
    const roleMatch = text.match(/^х\s+создать\s+(.+)$/i);
    if (!roleMatch) {
      await bot.sendMessage(chatId, 'Неверный формат команды!\n\nИспользуйте: х создать [название роли]\n\nПример: х создать модер', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const roleName = roleMatch[1].trim().toLowerCase();

    // Check if role with this name already exists
    const existingRole = await storage.getCustomRoleByName(chatId, roleName);
    if (existingRole) {
      await bot.sendMessage(chatId, `Роль "${roleName}" уже существует в этом чате!`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Create the custom role with empty permissions initially
    const role = await storage.createCustomRole({
      chatId: chatId,
      name: roleName,
      displayName: roleName,
      permissions: JSON.stringify([]), // Start with no permissions
      createdBy: ownerId
    });

    // Send inline button to redirect owner to bot for configuration
    const inlineKeyboard = {
      inline_keyboard: [[
        {
          text: 'Настроить роль 🎯',
          url: `https://t.me/${botConfig.BOT_USERNAME}?start=configure_role_${role.id}`
        }
      ]]
    };

    await bot.sendMessage(chatId, 
      `✅ Роль "${roleName}" создана!\n\n` +
      `Нажмите кнопку ниже для настройки прав доступа:`, 
      {
        reply_to_message_id: msg.message_id,
        reply_markup: inlineKeyboard
      }
    );

    log(`Custom role "${roleName}" created in chat ${chatId} by ${ownerId}`);
  } catch (error: any) {
    log(`Error creating custom role: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при создании роли.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleAssignCustomRole(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const assignerId = msg.from?.id.toString();
    const targetUserId = msg.reply_to_message?.from?.id.toString();
    const text = msg.text || '';

    if (!assignerId || !targetUserId || assignerId === targetUserId) {
      return;
    }

    // Check if user is chat owner (only owner can assign custom roles)
    const isOwner = await checkChatOwner(chatId, assignerId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может назначать пользовательские роли!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Parse role name from command: х назначить модер
    const roleMatch = text.match(/^х\s+назначить\s+(.+)$/i);
    if (!roleMatch) {
      await bot.sendMessage(chatId, 'Неверный формат команды!\n\nИспользуйте: х назначить [название роли]\n\nПример: х назначить модер', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const roleName = roleMatch[1].trim().toLowerCase();

    // Check if role exists
    const role = await storage.getCustomRoleByName(chatId, roleName);
    if (!role) {
      await bot.sendMessage(chatId, `Роль "${roleName}" не найдена в этом чате!\n\nИспользуйте команду "х создать ${roleName}" для создания роли.`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Check if user already has this role
    const hasRole = await storage.hasRole(chatId, targetUserId, roleName);
    if (hasRole) {
      await bot.sendMessage(chatId, `Пользователь уже имеет роль "${roleName}"!`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Assign role to user
    await storage.assignRole({
      chatId: chatId,
      userId: targetUserId,
      roleId: role.id,
      assignedBy: assignerId
    });

    const targetUsername = msg.reply_to_message.from?.first_name || msg.reply_to_message.from?.username || 'Пользователь';
    const assignerUser = await storage.getBotUserByTelegramId(assignerId);
    const assignerName = assignerUser?.nickname || msg.from?.first_name || 'Владелец';

    await bot.sendMessage(chatId, 
      `✅ ${targetUsername} назначен на роль "${role.displayName}"\n` +
      `Теперь может использовать команды этой роли\n` +
      `Назначил: ${assignerName}`, 
      {
        reply_to_message_id: msg.message_id
      }
    );

    log(`User ${targetUserId} assigned role "${roleName}" in chat ${chatId} by ${assignerId}`);
  } catch (error: any) {
    log(`Error assigning custom role: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при назначении роли.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleRoleConfigurationCommand(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const ownerId = msg.from?.id.toString();
    const text = msg.text || '';

    if (!ownerId) {
      return;
    }

    // Check if user is chat owner (only owner can configure roles)
    const isOwner = await checkChatOwner(chatId, ownerId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может настраивать роли!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Parse role name from command: х настроить роль модер
    const roleMatch = text.match(/^х\s+настроить\s+роль\s+(.+)$/i);
    if (!roleMatch) {
      await bot.sendMessage(chatId, 'Неверный формат команды!\n\nИспользуйте: х настроить роль [название роли]\n\nПример: х настроить роль модер', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const roleName = roleMatch[1].trim().toLowerCase();

    // Check if role exists
    const role = await storage.getCustomRoleByName(chatId, roleName);
    if (!role) {
      await bot.sendMessage(chatId, `Роль "${roleName}" не найдена в этом чате!\n\nИспользуйте команду "х создать ${roleName}" для создания роли.`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Send inline button to redirect owner to bot for configuration
    const inlineKeyboard = {
      inline_keyboard: [[
        {
          text: 'Настроить роль 🎯',
          url: `https://t.me/${botConfig.BOT_USERNAME}?start=configure_role_${role.id}`
        }
      ]]
    };

    await bot.sendMessage(chatId, 
      `🎯 Настройка роли "${role.displayName}"\n\n` +
      `Нажмите кнопку ниже для настройки прав доступа:`, 
      {
        reply_to_message_id: msg.message_id,
        reply_markup: inlineKeyboard
      }
    );

    log(`Role configuration command used for role "${roleName}" in chat ${chatId} by ${ownerId}`);
  } catch (error: any) {
    log(`Error handling role configuration command: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при настройке роли.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleRoleSettingsCommand(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const ownerId = msg.from?.id.toString();
    const text = msg.text || '';

    if (!ownerId) {
      return;
    }

    // Check if user is chat owner (only owner can configure roles)
    const isOwner = await checkChatOwner(chatId, ownerId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может настраивать роли!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Parse role name from command: х настроить модер
    const roleMatch = text.match(/^х\s+настроить\s+(.+)$/i);
    if (!roleMatch) {
      await bot.sendMessage(chatId, 'Неверный формат команды!\n\nИспользуйте: х настроить [название роли]\n\nПример: х настроить модер', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const roleName = roleMatch[1].trim().toLowerCase();

    // Check if role exists
    const role = await storage.getCustomRoleByName(chatId, roleName);
    if (!role) {
      await bot.sendMessage(chatId, `Роль "${roleName}" не найдена в этом чате!\n\nИспользуйте команду "х создать ${roleName}" для создания роли.`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Send inline button to redirect owner to bot for configuration
    const inlineKeyboard = {
      inline_keyboard: [[
        {
          text: 'Изменить настройки роли 🎯',
          url: `https://t.me/${botConfig.BOT_USERNAME}?start=configure_role_${role.id}`
        }
      ]]
    };

    await bot.sendMessage(chatId, 
      `🎯 Изменение настроек роли "${role.displayName}"\n\n` +
      `Нажмите кнопку ниже для изменения прав доступа:`, 
      {
        reply_to_message_id: msg.message_id,
        reply_markup: inlineKeyboard
      }
    );

    log(`Role settings command used for role "${roleName}" in chat ${chatId} by ${ownerId}`);
  } catch (error: any) {
    log(`Error handling role settings command: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при изменении настроек роли.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleRoleDelete(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const ownerId = msg.from?.id.toString();
    const text = msg.text || '';

    if (!ownerId) {
      return;
    }

    // Check if user is chat owner (only owner can delete roles)
    const isOwner = await checkChatOwner(chatId, ownerId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может удалять роли!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Parse role name from command: х удалить роль модер
    const roleMatch = text.match(/^х\s+удалить\s+роль\s+(.+)$/i);
    if (!roleMatch) {
      await bot.sendMessage(chatId, 'Неверный формат команды!\n\nИспользуйте: х удалить роль [название роли]\n\nПример: х удалить роль модер', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const roleName = roleMatch[1].trim().toLowerCase();

    // Check if role exists
    const role = await storage.getCustomRoleByName(chatId, roleName);
    if (!role) {
      await bot.sendMessage(chatId, `Роль "${roleName}" не найдена в этом чате!`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Get role assignments count
    const assignments = await storage.getRoleAssignments(role.id);
    const assignmentsCount = assignments.length;

    // Delete the role
    const deleted = await storage.deleteCustomRole(role.id);

    if (deleted) {
      await bot.sendMessage(chatId, 
        `✅ Роль "${role.displayName}" успешно удалена!` +
        (assignmentsCount > 0 ? `\n\n📊 Было удалено ${assignmentsCount} назначений этой роли.` : ''), 
        {
          reply_to_message_id: msg.message_id
        }
      );

      log(`Custom role "${roleName}" deleted in chat ${chatId} by ${ownerId}, ${assignmentsCount} assignments removed`);
    } else {
      await bot.sendMessage(chatId, `❌ Ошибка при удалении роли "${roleName}".`, {
        reply_to_message_id: msg.message_id
      });
    }
  } catch (error: any) {
    log(`Error deleting custom role: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при удалении роли.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function toggleRolePermission(callbackQuery: any, chatId: number, userId: string, roleId: string, permission: string) {
  try {
    // Get the role from storage
    const role = await storage.getCustomRole(roleId);
    if (!role) {
      await bot.answerCallbackQuery(callbackQuery.id, {text: 'Роль не найдена'});
      return;
    }

    // Check if user is the owner
    const isOwner = await checkChatOwner(role.chatId, userId);
    if (!isOwner) {
      await bot.answerCallbackQuery(callbackQuery.id, {text: 'Только владелец чата может настраивать роли'});
      return;
    }

    // Toggle permission
    const permissions = JSON.parse(role.permissions || '[]');
    const permissionIndex = permissions.indexOf(permission);

    if (permissionIndex === -1) {
      permissions.push(permission);
    } else {
      permissions.splice(permissionIndex, 1);
    }

    // Update role in storage
    await storage.updateCustomRole(roleId, {
      permissions: JSON.stringify(permissions)
    });

    // Update the inline keyboard
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: permissions.includes('mute') ? '✅ Мут' : '❌ Мут',
            callback_data: `toggle_perm_${roleId}_mute`
          }
        ],
        [
          {
            text: permissions.includes('ban') ? '✅ Бан' : '❌ Бан',
            callback_data: `toggle_perm_${roleId}_ban`
          }
        ],
        [
          {
            text: permissions.includes('manage_ads') ? '✅ Управление рекламой' : '❌ Управление рекламой',
            callback_data: `toggle_perm_${roleId}_manage_ads`
          }
        ],
        [
          {
            text: '✅ Сохранить настройки',
            callback_data: `save_role_${roleId}`
          }
        ]
      ]
    };

    // Update the message
    await bot.editMessageReplyMarkup(keyboard, {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id
    });

    await bot.answerCallbackQuery(callbackQuery.id, {text: `Разрешение "${permission}" ${permissionIndex === -1 ? 'включено' : 'отключено'}`});

    log(`Permission ${permission} toggled for role ${roleId} by user ${userId}`);
  } catch (error: any) {
    log(`Error toggling role permission: ${error}`);
    await bot.answerCallbackQuery(callbackQuery.id, {text: 'Произошла ошибка'});
  }
}

async function saveRoleConfiguration(callbackQuery: any, chatId: number, userId: string, roleId: string) {
  try {
    //    // Get the role from storage
    const role = await storage.getCustomRole(roleId);
    if (!role) {
      await bot.answerCallbackQuery(callbackQuery.id, {text: 'Роль не найдена'});
      return;
    }

    // Check if user is the owner
    const isOwner = await checkChatOwner(role.chatId, userId);
    if (!isOwner) {
      await bot.answerCallbackQuery(callbackQuery.id, {text: 'Только владелец чата может настраивать роли'});
      return;
    }

    const permissions = JSON.parse(role.permissions || '[]');
    const permissionText = permissions.length > 0 
      ? permissions.map(p => {
          switch(p) {
            case 'mute': return 'Мут';
            case 'ban': return 'Бан';
            case 'manage_ads': return 'Управление рекламой';
            default: return p;
          }
        }).join(', ')
      : 'Нет разрешений';

    await bot.sendMessage(chatId, 
      `✅ Настройки роли "${role.displayName}" сохранены!\n\n` +
      `Разрешения: ${permissionText}\n\n` +
      `Теперь вы можете назначать эту роль пользователям командой:\n` +
      `х назначить ${role.name} @пользователь`
    );

    await bot.answerCallbackQuery(callbackQuery.id, {text: 'Настройки сохранены!'});

    log(`Role configuration saved for role ${roleId} by user ${userId}`);
  } catch (error: any) {
    log(`Error saving role configuration: ${error}`);
    await bot.answerCallbackQuery(callbackQuery.id, {text: 'Произошла ошибка при сохранении'});
  }
}

async function handleUnmuteCommand(msg: any) {
  try {
    const chatId = msg.chat.id.toString();
    const moderatorId = msg.from?.id.toString();
    const targetUserId = msg.reply_to_message?.from?.id.toString();

    if (!moderatorId || !targetUserId || moderatorId === targetUserId) {
      return;
    }

    // Check if user is chat owner OR has mute permission through custom role
    const hasModeratorRights = await checkModeratorRights(chatId, moderatorId);
    const hasRolePermission = await checkCustomRolePermission(chatId, moderatorId, 'mute');

    if (!hasModeratorRights && !hasRolePermission) {
      await bot.sendMessage(chatId, 'У вас нет прав для использования этой команды!', {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    // Deactivate mute if exists
    const activeMute = await storage.getActiveMute(chatId, targetUserId);
    if (activeMute) {
      await storage.deactivateMute(activeMute.id);
    }

    // Restore full user permissions using restrictChatMember only (ban/unban would KICK user from group)
    let restored = false;
    try {
      await bot.restrictChatMember(chatId, parseInt(targetUserId), {
        permissions: {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_send_polls: true,
          can_invite_users: true,
          can_pin_messages: false,
          can_change_info: false
        }
      });
      log(`User ${targetUserId} unmuted via restrictChatMember - permissions restored in chat ${chatId}`);
      restored = true;
    } catch (error) {
      log(`restrictChatMember unmute failed: ${error}`);
    }

    if (!restored) {
      log(`Could not restore user permissions for ${targetUserId}`);
      await bot.sendMessage(chatId, `Не удалось снять ограничения. Возможно, у бота недостаточно прав.`, {
        reply_to_message_id: msg.message_id
      });
      return;
    }

    const targetUsername = msg.reply_to_message.from?.first_name || msg.reply_to_message.from?.username || 'Пользователь';
    const moderatorUser = await storage.getBotUserByTelegramId(moderatorId);
    const moderatorName = moderatorUser?.nickname || msg.from?.first_name || 'Модератор';

    await bot.sendMessage(chatId, 
      `${targetUsername} размучен - все ограничения сняты\n` +
      `Модератор: ${moderatorName}`, 
      {
        reply_to_message_id: msg.message_id
      }
    );

    log(`User ${targetUserId} manually unmuted in chat ${chatId} by ${moderatorId}`);
  } catch (error: any) {
    log(`Error handling unmute command: ${error}`);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при выполнении команды снятия мута.', {
      reply_to_message_id: msg.message_id
    });
  }
}

// Anti-spam moderation functions
async function handleAntiSpamToggle(msg: any, enabled: boolean) {
  const chatId = msg.chat.id.toString();
  const userId = msg.from.id.toString();

  try {
    // Check if user is bot admin (can manage any chat)
    const isBotAdmin = userId === '7799297944'; // Admin telegram ID

    log(`Anti-spam toggle: User ${userId}, isBotAdmin: ${isBotAdmin}`);

    if (!isBotAdmin) {
      // If not bot admin, check if user is chat owner OR has manage_ads permission
      const hasRolePermission = await checkCustomRolePermission(chatId, userId, 'manage_ads');
      const isOwner = await checkChatOwner(chatId, userId);

      if (!hasRolePermission && !isOwner) {
        await bot.sendMessage(chatId, 'У вас нет прав для управления настройками рекламы.', {
          reply_to_message_id: msg.message_id
        });
        return;
      }
    }

    // Get or create chat record
    let chat = await storage.getChat(chatId);
    if (!chat) {
      chat = await storage.createChat({
        telegramChatId: chatId,
        chatTitle: msg.chat.title || null,
        chatType: msg.chat.type,
        antiSpamEnabled: enabled
      });
    } else {
      await storage.updateChat(chatId, { antiSpamEnabled: enabled });
    }

    const statusText = enabled ? 'включена - ссылки удаляются' : 'отключена - ссылки разрешены всем';
    const userRole = userId === '7799297944' ? '(админ бота)' : '(владелец чата)';
    await bot.sendMessage(chatId, `✅ Модерация рекламы ${statusText} ${userRole}.`, {
      reply_to_message_id: msg.message_id
    });

    log(`Anti-spam toggled in chat ${chatId}: ${enabled} by user ${userId}`);
  } catch (error) {
    log(`Error toggling anti-spam: ${error}`);
    await bot.sendMessage(chatId, 'Ошибка при изменении настроек модерации.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function handleAntiSpamModeration(msg: any) {
  const chatId = msg.chat.id.toString();
  const userId = msg.from.id.toString();
  const text = msg.text || '';

  try {
    // Get chat settings
    const chat = await storage.getChat(chatId);

    // If no chat record or anti-spam is disabled, skip moderation
    if (!chat || !chat.antiSpamEnabled) {
      return;
    }

    // Check if user is admin or owner (they are exempt from moderation)
    const chatMember = await bot.getChatMember(chatId, parseInt(userId));
    if (chatMember.status === 'creator' || chatMember.status === 'administrator') {
      return;
    }

    // Check for visible links and spam patterns in text
    const linkPatterns = [
      /https?:\/\/[^\s]+/gi,
      /t\.me\/[^\s]+/gi,
      /@[a-zA-Z0-9_]+/gi,
      /телеграм\s*канал/gi,
      /подписывайтесь/gi,
      /переходите\s*по\s*ссылке/gi,
      /реклама/gi,
      /продаю/gi,
      /покупаю/gi,
      /заработок/gi
    ];

    let containsSpam = linkPatterns.some(pattern => pattern.test(text.toLowerCase()));

    // Check for hidden inline links in message entities
    if (msg.entities && msg.entities.length > 0) {
      for (const entity of msg.entities) {
        // Check for text_link entities (hidden inline links)
        if (entity.type === 'text_link' && entity.url) {
          containsSpam = true;
          log(`Hidden inline link detected: ${entity.url}`);
          break;
        }

        // Check for URL entities
        if (entity.type === 'url') {
          containsSpam = true;
          break;
        }

        // Check for mention entities
        if (entity.type === 'mention') {
          containsSpam = true;
          break;
        }
      }
    }

    if (containsSpam) {
      // Delete the message
      await bot.deleteMessage(chatId, msg.message_id);

      // Send warning message (will auto-delete after 10 seconds)
      try {
        const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
        const warningMsg = await bot.sendMessage(chatId, 
          `${username} в этом чате нельзя скидывать ссылки`
        );

        // Delete warning message after 10 seconds
        setTimeout(async () => {
          try {
            await bot.deleteMessage(chatId, warningMsg.message_id);
          } catch (error) {
            // Ignore if message is already deleted
          }
        }, 10000);
      } catch (error) {
        // Don't try to reply to deleted message
        log(`Warning message not sent (original message already deleted): ${error}`);
      }

      log(`Spam message deleted in chat ${chatId} from user ${userId}: ${text.substring(0, 50)}... (entities: ${msg.entities?.length || 0})`);
    }
  } catch (error) {
    log(`Error in anti-spam moderation: ${error}`);
  }
}

// Commands list function
async function handleRoleConfiguration(chatId: number, userId: string, roleId: string) {
  try {
    // Get the role from storage
    const role = await storage.getCustomRole(roleId);
    if (!role) {
      await bot.sendMessage(chatId, 'Роль не найдена.');
      return;
    }

    // Check if the user is the owner of the chat where the role was created
    const isOwner = await checkChatOwner(role.chatId, userId);
    if (!isOwner) {
      await bot.sendMessage(chatId, 'Только владелец чата может настраивать роли.');
      return;
    }

    // Show role configuration menu with inline keyboard
    const permissions = JSON.parse(role.permissions || '[]');
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: permissions.includes('mute') ? '✅ Мут' : '❌ Мут',
            callback_data: `toggle_perm_${roleId}_mute`
          }
        ],
        [
          {
            text: permissions.includes('ban') ? '✅ Бан' : '❌ Бан',
            callback_data: `toggle_perm_${roleId}_ban`
          }
        ],
        [
          {
            text: permissions.includes('manage_ads') ? '✅ Управление рекламой' : '❌ Управление рекламой',
            callback_data: `toggle_perm_${roleId}_manage_ads`
          }
        ],
        [
          {
            text: '✅ Сохранить настройки',
            callback_data: `save_role_${roleId}`
          }
        ]
      ]
    };

    await bot.sendMessage(chatId, 
      `🎯 Настройка роли "${role.displayName}"\n\n` +
      `Выберите разрешения для этой роли:\n\n` +
      `• Мут - команды "х мут" и "х размут"\n` +
      `• Бан - команды "х бан" и "х разбан"\n` +
      `• Управление рекламой - команды "х отключить рекламу" и "х включить рекламу"\n\n` +
      `Нажмите на кнопки для включения/отключения разрешений:`,
      {
        reply_markup: keyboard
      }
    );

    log(`Role configuration shown in chat for role ${roleId} to user ${userId}`);
  } catch (error: any) {
    log(`Error showing role configuration in chat: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке настроек роли.');
  }
}

async function showRoleConfigurationInChat(chatId: number, userId: string, roleId: string) {
  return await handleRoleConfiguration(chatId, userId, roleId);
}

export {
  handleMuteCommand, handleUnmuteCommand, handleAppointAdmin, handleRemoveAdmin,
  handleShowAdmins, handleShowMyInfo, handleHamyafkaWho,
  checkCustomRolePermission, checkModeratorRights, checkChatOwner, parseDuration,
  handleUnmute, checkExpiredMutes,
  showAdminMenu, showAppeals,
  handleHideCreator, handleShowCreator, handleFakeCreator,
  handleBanCommand, handleUnbanCommand,
  handleCreateCustomRole, handleAssignCustomRole,
  handleRoleConfigurationCommand, handleRoleSettingsCommand, handleRoleDelete,
  toggleRolePermission, saveRoleConfiguration,
  handleAntiSpamToggle, handleAntiSpamModeration,
  handleRoleConfiguration, showRoleConfigurationInChat
};
