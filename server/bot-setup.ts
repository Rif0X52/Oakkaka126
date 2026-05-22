import { bot, botConfig, ADMIN_IDS, safeParseInt, notifyAllAdmins } from './bot-shared';
import { storage } from './storage';
import { log } from './vite';
import type { BotUser } from '@shared/schema';
import { notifyAdminError as notifyError } from './notifications';
import { handleMinesStart, handleMinesCallback } from './bot-mines';

import {
  getBonusStatus, showRegistrationChoice, startNewRegistration, handleNicknameInput,
  handlePasswordInput, handlePasswordConfirmation, showMainMenu, showProfile,
  showAdditionalMenu, startNicknameChange, handleNicknameChange,
  startPasswordChange, handlePasswordChange, requestContact,
  confirmDeleteAccount, deleteAccount, startLogin, handleLoginNickname,
  handleLoginPassword, showAccountSwitcher, switchToAccount,
  handleDonateStars, showDonateMenu, showReferralLink
} from './bot-handlers-profile';

import {
  handleBalanceCheck, handleHamstersTransfer, handleRouletteBet, handleRouletteSpin,
  showMyTasks, deleteUserTask, confirmDeleteTask, processWebMessages,
  handleHamstersTransferByIdentifier, handleTop, handleTopPrivate
} from './bot-handlers-economy';

import {
  showEarnMenu, showEarnChannels, showEarnChats, showEarnPostViews,
  subscribeToTask, checkSubscription, viewPost, showEarnReactions, showEarnReactionsByType,
  showAdvertiseMenu, startPostViewAd, startChannelAd, startChatAd, startReactionAd,
  handleReactionType, confirmReactionAd, uploadReactionProof,
  handleReactionPhotoInput, handleReactionPriceInput, handleReactionCountInput,
  reviewReactionProof, viewReactionPhoto, handleReactionAdInput,
  confirmPassword, rejectPassword, checkAdminRights,
  confirmAdCreation, confirmPostViewAd,
  handleForwardedMessage, handleChannelAdInput, handleChatAdInput,
  handlePostViewInput, handlePostPriceInput, handleAdSubscribersInput,
  handlePostViewsInput, checkHamyafkaSubscription, handleResubscribe, handlePromoCode
} from './bot-handlers-ads';

import {
  showManageTasksMenu, showManageTasksByType, deleteManagedTask,
  approveReactionProof, rejectReactionProof, submitAppeal,
  adminApproveAppeal, adminRejectAppeal, startReactionTask,
  checkActiveTasksHealth, checkAutoCompensations
} from './bot-handlers-tasks';

import {
  handleMuteCommand, handleUnmuteCommand, handleAppointAdmin, handleRemoveAdmin,
  handleShowAdmins, handleShowMyInfo, handleHamyafkaWho,
  handleBanCommand, handleUnbanCommand,
  handleHideCreator, handleShowCreator, handleFakeCreator,
  handleAntiSpamToggle, handleAntiSpamModeration,
  handleCreateCustomRole, handleAssignCustomRole,
  handleRoleConfigurationCommand, handleRoleDelete,
  toggleRolePermission, saveRoleConfiguration,
  showAdminMenu, showAppeals, checkExpiredMutes,
  handleRoleConfiguration
} from './bot-handlers-moderation';

import {
  showCommands, showSupportContact,
  showClanMenu, startClanCreation, handleClanNameInput,
  showJoinClanMenu, showMyClan, confirmDeleteClan, deleteClan,
  handleClanBonusClaim, startClanSearch, handleClanSearchInput,
  showClanStatsMenu, showClanStatsByTreasury, showClanStatsByArmy,
  showClanShop, startBuyArmyHamsters, handleAddToTreasury,
  confirmLeaveClan, leaveClan
} from './bot-handlers-clan';

import {
  showPersonalArmyShop, handlePersonalArmyInput, handleArmyHamstersInput,
  handleDirectArmyPurchase,
  showClanRequests, requestJoinClan, acceptClanJoinRequest, rejectClanJoinRequest,
  startSetDeputy, removeClanDeputy, handleDeputyNicknameInput,
  startRemoveMember, handleRemoveMemberNicknameInput, confirmRemoveMember
} from './bot-handlers-clan-members';

import { checkPendingPenalties } from './bot-handlers-ads';

export function setupBot() {
  log('Setting up Telegram bot...');

  // Get bot username dynamically
  bot.getMe().then(info => {
    botConfig.BOT_USERNAME = info.username || 'hamyafkabot';
    log(`Bot username resolved: @${botConfig.BOT_USERNAME}`);
  }).catch(e => log(`Could not get bot info: ${e}`));

  // /give command — admins only: /give 100000 Rif0X
  bot.onText(/^\/give\s+(-?\d+)\s+(.+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const adminId = msg.from?.id.toString() || '';
    if (!ADMIN_IDS.includes(adminId)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для этой команды.');
      return;
    }
    const amountStr = match?.[1] || '';
    const nickname = (match?.[2] || '').trim();
    const amount = parseInt(amountStr);
    if (!amount || !nickname) {
      await bot.sendMessage(chatId, 'Формат: /give [сумма] [никнейм]\nПример: /give 100000 Rif0X');
      return;
    }
    try {
      const target = await storage.getBotUserByNickname(nickname);
      if (!target) {
        await bot.sendMessage(chatId, `❌ Пользователь "${nickname}" не найден.`);
        return;
      }
      await storage.addHamsters(target.id, amount);
      const updated = await storage.getBotUserByTelegramId(target.telegramId);
      const actionText = amount >= 0 ? 'Выдано' : 'Списано';
      await bot.sendMessage(chatId,
        `✅ ${actionText} ${Math.abs(amount)} хамяфков игроку ${nickname}.\n💰 Новый баланс: ${updated?.hamsters || '?'} хамяфков.`
      );
      try {
        await bot.sendMessage(target.telegramId,
          amount >= 0
            ? `🎁 Вам выдано ${amount} хамяфков от администратора!\n💰 Ваш новый баланс: ${updated?.hamsters || '?'} хамяфков.`
            : `⚠️ У вас списано ${Math.abs(amount)} хамяфков администратором.\n💰 Ваш новый баланс: ${updated?.hamsters || '?'} хамяфков.`
        );
      } catch (_) {}
      log(`Admin ${adminId} changed balance by ${amount} for ${nickname}`);
    } catch (error) {
      log(`Error in /give: ${error}`);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при выдаче хамяфков.');
    }
  });

  // Handle admin commands
  bot.onText(/\/admin_give_hamsters (\d+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const adminId = msg.from?.id.toString() || '';

    // Check if user is admin
    if (!ADMIN_IDS.includes(adminId)) {
      await bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
      return;
    }

    const amountStr = match?.[1];
    const nickname = match?.[2];

    if (!amountStr || !nickname) {
      await bot.sendMessage(chatId, 'Неверный формат команды. Используйте: /admin_give_hamsters <сумма> <никнейм>');
      return;
    }

    // Handle large numbers properly
    const amount = BigInt(amountStr);

    if (amount <= 0) {
      await bot.sendMessage(chatId, 'Неверная сумма. Используйте: /admin_give_hamsters <сумма> <никнейм>');
      return;
    }

    try {
      const user = await storage.getBotUserByNickname(nickname);
      if (!user) {
        await bot.sendMessage(chatId, `Пользователь с никнеймом "${nickname}" не найден.`);
        return;
      }

      // Set exact balance instead of adding to avoid scientific notation
      const updatedUser = await storage.updateBotUser(user.id, { hamsters: amountStr });
      if (updatedUser) {
        await bot.sendMessage(chatId,
          `Выдано ${amountStr} хамяфков пользователю ${nickname}.\n` +
          `Новый баланс: ${updatedUser.hamsters} хамяфков.`
        );

        // Notify user about the bonus
        try {
          await bot.sendMessage(user.telegramId,
            `🎉 Вы получили ${amountStr} хамяфков от администратора!\n` +
            `Ваш новый баланс: ${updatedUser.hamsters} хамяфков.`
          );
        } catch (error) {
          // Ignore if can't send private message
        }

        log(`Admin gave ${amountStr} hamsters to ${nickname}`);
      } else {
        await bot.sendMessage(chatId, 'Произошла ошибка при выдаче хамяфков.');
      }
    } catch (error) {
      log(`Error in admin give hamsters: ${error}`);
      await bot.sendMessage(chatId, 'Произошла ошибка при выполнении команды.');
    }
  });

  // Handle admin balance check
  bot.onText(/\/admin_balance (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const adminId = msg.from?.id.toString() || '';

    // Check if user is admin
    if (!ADMIN_IDS.includes(adminId)) {
      await bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
      return;
    }

    const nickname = match && match[1] ? match[1] : '';

    try {
      const user = await storage.getBotUserByNickname(nickname);
      if (!user) {
        await bot.sendMessage(chatId, `Пользователь с никнеймом "${nickname}" не найден.`);
        return;
      }

      await bot.sendMessage(chatId,
        `Баланс пользователя ${nickname}:\n` +
        `${user.hamsters} хамяфков\n` +
        `ID: ${user.telegramId}\n` +
        `Зарегистрирован: ${user.isRegistered ? 'Да' : 'Нет'}`
      );

      log(`Admin checked balance for ${nickname}: ${user.hamsters} hamsters`);
    } catch (error) {
      log(`Error in admin balance check: ${error}`);
      await bot.sendMessage(chatId, 'Произошла ошибка при выполнении команды.');
    }
  });

  // Handle /menu command
  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id.toString() || '';

    try {
      const user = await storage.getBotUserByTelegramId(telegramId);

      if (!user || !user.isRegistered) {
        await bot.sendMessage(chatId, 'Вы не зарегистрированы в боте. Используйте /start для регистрации.');
        return;
      }

      await showMainMenu(chatId, user.nickname || '');
    } catch (error: any) {
      log(`Error handling /menu command: ${error}`);
      await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
  });

  // Handle /admin command for admins
  bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id.toString() || '';

    if (!ADMIN_IDS.includes(telegramId)) {
      await bot.sendMessage(chatId, 'У вас нет прав для доступа к админ панели.');
      return;
    }

    try {
      await showAdminMenu(chatId);
    } catch (error: any) {
      log(`Error handling /admin command: ${error}`);
      await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
  });

  // Handle /admin_menu command for admins (for backward compatibility)
  bot.onText(/\/admin_menu/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id.toString() || '';

    if (!ADMIN_IDS.includes(telegramId)) {
      await bot.sendMessage(chatId, 'У вас нет прав для доступа к админ панели.');
      return;
    }

    try {
      await showAdminMenu(chatId);
    } catch (error: any) {
      log(`Error handling /admin_menu command: ${error}`);
      await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
  });

  // Handle /start command
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id.toString() || '';
    const firstName = msg.from?.first_name || '';
    const lastName = msg.from?.last_name || '';
    const username = msg.from?.username || '';
    const referralCode = match && match[1] ? match[1].trim() : null;

    try {
      // Check if user already exists
      let user = await storage.getBotUserByTelegramId(telegramId);

      if (!user) {
        // Handle referral if provided
        let referredBy = null;
        if (referralCode) {
          const referrer = await storage.getBotUserByReferralCode(referralCode);
          if (referrer && referrer.telegramId !== telegramId) {
            referredBy = referrer.id;
          }
        }

        // Create new user
        user = await storage.createBotUser({
          telegramId,
          nickname: '',
          firstName,
          lastName,
          username,
          isRegistered: false,
          registrationStep: 'none',
          hamsters: '0',
          referredBy
        });

        // If user was referred, notify about bonus (will be given after registration)
        if (referredBy) {
          await bot.sendMessage(chatId, 'Добро пожаловать! Вы были приглашены другом. После регистрации вы и ваш друг получите бонусы!');
        }
      }

      // Handle role configuration parameter
      if (referralCode && referralCode.startsWith('configure_role_')) {
        const roleId = referralCode.replace('configure_role_', '');
        await handleRoleConfiguration(chatId, telegramId, roleId);
        return;
      }

      if (user.isRegistered) {
        // Show main menu for registered users
        await showMainMenu(chatId, user.nickname || '');
      } else {
        // Show registration choice
        await showRegistrationChoice(chatId);
      }
    } catch (error: any) {
      log(`Error handling /start command: ${error}`);
      await notifyError('Ошибка в команде /start', error.toString(), telegramId);
      await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
  });

  // Handle all messages for logging and web interface integration
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const telegramId = msg.from?.id.toString() || '';
    const userName = msg.from?.first_name || msg.from?.username || 'Неизвестно';
    const messageText = msg.text || msg.caption || '';
    const messageType = msg.photo ? 'photo' : msg.document ? 'document' : msg.video ? 'video' : 'text';

    // Save message to database
    try {
      await storage.createMessage({
        telegramChatId: chatId,
        telegramUserId: telegramId,
        userName,
        messageText,
        messageType,
        isFromBot: false
      });

      // Create or update chat information
      let chat = await storage.getChat(chatId);
      if (!chat) {
        await storage.createChat({
          telegramChatId: chatId,
          chatTitle: msg.chat.title || (msg.chat.type === 'private' ? userName : 'Приватный чат'),
          chatType: msg.chat.type,
          isActive: true
        });
      } else {
        await storage.updateChat(chatId, {
          lastActivity: new Date().toISOString(),
          isActive: true
        });
      }
    } catch (error) {
      log(`Error saving message: ${error}`);
    }

    // Handle commands
    if (msg.text?.startsWith('/')) return;

    const text = msg.text || '';

    try {
      const user = await storage.getBotUserByTelegramId(telegramId);

      if (!user) return;

      // Handle forwarded messages for post view ads (only in private chats)
      if (msg.chat.type === 'private' && msg.forward_from_chat && user.registrationStep === 'awaiting_post_message') {
        await handleForwardedMessage(Number(chatId), user, msg);
        return;
      }

      // In group chats, handle commands and moderation
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        // Check if user is muted - restrict permissions and delete messages
        const activeMute = await storage.getActiveMute(chatId, telegramId);
        if (activeMute) {
          // Delete the message from muted user
          try {
            await bot.deleteMessage(chatId, msg.message_id);
            log(`Message deleted from muted user ${telegramId} in chat ${chatId}`);
          } catch (error) {
            log(`Could not delete message from muted user ${telegramId}: ${error}`);
          }

          // Also restrict user permissions
          try {
            await bot.restrictChatMember(chatId, parseInt(telegramId), {
              permissions: {
                can_send_messages: false,
                can_send_photos: false,
                can_send_videos: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false,
                can_send_polls: false,
                can_invite_users: false,
                can_pin_messages: false,
                can_change_info: false
              }
            } as any);
            log(`User ${telegramId} is muted - permissions restricted in chat ${chatId}`);
          } catch (error) {
            log(`Could not restrict user permissions for ${telegramId}: ${error}`);
          }
          return;
        }
        // Check for anti-spam toggle commands (owner only)
        if (text.toLowerCase() === 'х отключить рекламу') {
          await handleAntiSpamToggle(msg, true); // Enable moderation (delete links)
          return;
        }

        if (text.toLowerCase() === 'х включить рекламу') {
          await handleAntiSpamToggle(msg, false); // Disable moderation (allow links)
          return;
        }

        // Check for balance request (just "х")
        if (text.toLowerCase() === 'х') {
          await handleBalanceCheck(msg);
          return;
        }

        // Check for top command
        if (text.toLowerCase() === 'топ') {
          await handleTop(msg, 'hamsters');
          return;
        }
        if (text.toLowerCase() === 'топ армии') {
          await handleTop(msg, 'army');
          return;
        }

        // Check for roulette bet on red (х к 100)
        if (text.toLowerCase().match(/^х\s*к\s*(\d+)$/)) {
          await handleRouletteBet(msg);
          return;
        }

        // Check for roulette bet on black (х ч 100)
        if (text.toLowerCase().match(/^х\s*ч\s*(\d+)$/)) {
          await handleRouletteBet(msg);
          return;
        }

        // Check for roulette spin (х го)
        if (text.toLowerCase() === 'х го') {
          await handleRouletteSpin(msg);
          return;
        }

        // Check for mute command (х мут время причина)
        if (msg.reply_to_message && text.toLowerCase().match(/^х\s+мут\s+/)) {
          await handleMuteCommand(msg);
          return;
        }

        // Check for admin appointment (х назначить админа / х админ)
        if (msg.reply_to_message && text.toLowerCase().match(/^х\s+(назначить\s+админа?|админ)$/)) {
          await handleAppointAdmin(msg);
          return;
        }

        // Check for admin list command (х кто админ)
        if (text.toLowerCase() === 'х кто админ') {
          const chatId = msg.chat.id;
          const telegramId = msg.from?.id.toString() || '';
          const adminList = await storage.getAllChatAdmins(String(chatId));
          const roleList = await storage.getChatCustomRoles(String(chatId));
          const lines = ['👥 Список ролей и админов:'];
          if (ADMIN_IDS.includes(telegramId)) lines.push('• Вы — основной администратор');
          if (adminList.length === 0 && roleList.length === 0) lines.push('• Ролей пока нет');
          for (const admin of adminList) {
            const user = await storage.getBotUser(admin.userId);
            lines.push(`• ${user?.nickname || admin.userId} — админ`);
          }
          for (const role of roleList) {
            const assignees = await storage.getRoleAssignments(role.id);
            const users = [];
            for (const a of assignees) {
              const u = await storage.getBotUser(a.userId);
              users.push(u?.nickname || a.userId);
            }
            lines.push(`• ${role.name}: ${users.length ? users.join(', ') : 'никого'}`);
          }
          await bot.sendMessage(chatId, lines.join('\n'));
          return;
        }

        // Check for user info command (х кто я)
        if (text.toLowerCase() === 'х кто я') {
          const chatId = msg.chat.id;
          const telegramId = msg.from?.id.toString() || '';
          const user = await storage.getBotUserByTelegramId(telegramId);
          if (!user) {
            await bot.sendMessage(chatId, 'Пользователь не найден.');
            return;
          }
          const roles = await storage.getUserRoles(String(chatId), user.id);
          const roleNames = [];
          for (const r of roles) {
            const role = await storage.getCustomRole(r.roleId);
            if (role?.name) roleNames.push(role.name);
          }
          await bot.sendMessage(chatId, `Вы: ${user.nickname}\nРоли: ${roleNames.length ? roleNames.join(', ') : 'нет'}`);
          return;
        }

        // Check for remove admin command (х снять админа)
        if (msg.reply_to_message && text.toLowerCase() === 'х снять админа') {
          await handleRemoveAdmin(msg);
          return;
        }

        // Check for ban command (х бан)
        if (msg.reply_to_message && text.toLowerCase() === 'х бан') {
          await handleBanCommand(msg);
          return;
        }

        // Check for unban command (х розбан / х разбан)
        if (msg.reply_to_message && (text.toLowerCase() === 'х розбан' || text.toLowerCase() === 'х разбан')) {
          await handleUnbanCommand(msg);
          return;
        }

        // Check for unmute commands (х снять мут, х размут)
        if (msg.reply_to_message && (text.toLowerCase() === 'х снять мут' || text.toLowerCase() === 'х размут')) {
          await handleUnmuteCommand(msg);
          return;
        }


        // Check for hide creator command (х скрыть создателя)
        if (text.toLowerCase() === 'х скрыть создателя') {
          await handleHideCreator(msg);
          return;
        }

        // Check for show creator command (х показать создателя)
        if (text.toLowerCase() === 'х показать создателя') {
          await handleShowCreator(msg);
          return;
        }

        // Check for fake creator command (х фейк создатель)
        if (msg.reply_to_message && text.toLowerCase().match(/^х\s+фейк\s+создатель$/)) {
          await handleFakeCreator(msg);
          return;
        }

        // Check for create custom role command (х создать [название])
        if (text.toLowerCase().match(/^х\s+создать\s+.+$/)) {
          await handleCreateCustomRole(msg);
          return;
        }

        // Check for assign custom role command (х назначить [роль])
        if (msg.reply_to_message && text.toLowerCase().match(/^х\s+назначить\s+.+$/)) {
          await handleAssignCustomRole(msg);
          return;
        }

        // Check for role configuration command (х настроить роль [название])
        if (text.toLowerCase().match(/^х\s+настроить\s+роль\s+/)) {
          await handleRoleConfigurationCommand(msg);
          return;
        }

        // Check for role deletion command (х удалить роль [название])
        if (text.toLowerCase().match(/^х\s+удалить\s+роль\s+/)) {
          await handleRoleDelete(msg);
          return;
        }

        // Check for role configuration command (х настроить роль [название])
        if (text.toLowerCase().match(/^х\s+настроить\s+роль\s+/)) {
          await handleRoleConfigurationCommand(msg);
          return;
        }

        // Check for "Хамяфка кто [слово]" command
        const hamyafkaWhoMatch = text.match(/^хамяфка\s+кто\s+(.{1,20})$/i);
        if (hamyafkaWhoMatch) {
          await handleHamyafkaWho(msg, hamyafkaWhoMatch[1].trim());
          return;
        }

        // Check for Mines game command (Мины [ставка])
        const minesMatchGroup = text.match(/^мины\s+(\d+)$/i);
        if (minesMatchGroup) {
          await handleMinesStart(msg, bot, parseInt(minesMatchGroup[1]));
          return;
        }

        // Check for hamsters transfer (х + amount + reply)
        if (msg.reply_to_message && text.toLowerCase().startsWith('х ')) {
          await handleHamstersTransfer(msg);
          return;
        }

        // Check for hamsters transfer by nickname or ID (х Никнейм 100 or х 123456789 100)
        if (text.toLowerCase().startsWith('х ') && !msg.reply_to_message) {
          const parts = text.split(/\s+/);
          if (parts.length === 3) {
            const recipient = parts[1];
            const amount = parseInt(parts[2]);
            if (!isNaN(amount) && amount > 0) {
              await handleHamstersTransferByIdentifier(msg, recipient, amount);
              return;
            }
          }
        }

        // Check for promo code #hamyafka
        if (text.toLowerCase().includes('#hamyafka')) {
          await handlePromoCode(msg, user);
          return;
        }

        // Check for spam links and moderate them
        await handleAntiSpamModeration(msg);

        // Ignore all other messages in group chats
        return;
      }

      // Only handle bot interactions in private chats
      if (msg.chat.type === 'private') {
        // Check for top command
        if (text.toLowerCase() === 'топ') {
          await handleTopPrivate(user, 'hamsters');
          return;
        }
        if (text.toLowerCase() === 'топ армии') {
          await handleTopPrivate(user, 'army');
          return;
        }

        // Check for Mines game command in private chat (Мины [ставка])
        const minesMatchPrivate = text.match(/^мины\s+(\d+)$/i);
        if (minesMatchPrivate) {
          await handleMinesStart(msg, bot, parseInt(minesMatchPrivate[1]));
          return;
        }

        // Check for promo code #hamyafka
        if (text.toLowerCase().includes('#hamyafka')) {
          await handlePromoCode(msg, user);
          return;
        }

        // Handle menu button clicks (only in private chats)
        if (text === 'Профиль' && user.isRegistered) {
          await showProfile(Number(chatId), user);
          return;
        }

        if (text === 'Зарабатывать' && user.isRegistered) {
          await showEarnMenu(Number(chatId), user);
          return;
        }

        if (text === 'Рекламировать' && user.isRegistered) {
          await showAdvertiseMenu(Number(chatId), user);
          return;
        }

        if (text === 'Клан' && user.isRegistered) {
          await showClanMenu(Number(chatId), user);
          return;
        }

        // Handle registration/editing states (only in private chats)
        if (user.registrationStep === 'awaiting_nickname') {
          await handleNicknameInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'awaiting_password') {
          await handlePasswordInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'awaiting_password_confirm') {
          await handlePasswordConfirmation(Number(chatId), user, text);
        } else if (user.registrationStep === 'changing_nickname') {
          await handleNicknameChange(Number(chatId), user, text);
        } else if (user.registrationStep === 'changing_password') {
          await handlePasswordChange(Number(chatId), user, text);
        } else if (user.registrationStep === 'login_nickname') {
          await handleLoginNickname(Number(chatId), user, text);
        } else if (user.registrationStep === 'login_password') {
          await handleLoginPassword(Number(chatId), user, text);
        } else if (user.registrationStep === 'creating_ad_channel') {
          await handleChannelAdInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'creating_ad_chat') {
          await handleChatAdInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'creating_post_view') {
          await handlePostViewInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'awaiting_post_message') {
          // Handle forwarded messages for post view
          return;
        } else if (user.registrationStep === 'awaiting_post_price') {
          await handlePostPriceInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'awaiting_post_views') {
          await handlePostViewsInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'awaiting_ad_price') {
          // Check ad type to call correct price handler
          const adInfo = JSON.parse(user.password || '{}');
          if (adInfo.type === 'reaction') {
            await handleReactionPriceInput(Number(chatId), user, text);
          } else {
            await handlePostPriceInput(Number(chatId), user, text);
          }
        } else if (user.registrationStep === 'awaiting_reaction_price') {
          await handleReactionPriceInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'awaiting_reaction_count') {
          await handleReactionCountInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'awaiting_ad_subscribers') {
          await handleAdSubscribersInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'creating_reaction_ad' || user.registrationStep === 'awaiting_reaction_link') {
          await handleReactionAdInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'awaiting_reaction_photo') {
          await handleReactionPhotoInput(Number(chatId), user, msg);
        } else if (user.registrationStep === 'awaiting_reaction_proof') {
          await handleReactionPhotoInput(Number(chatId), user, msg);
        } else if (user.registrationStep && user.registrationStep.startsWith('awaiting_reaction_proof_')) {
          await handleReactionPhotoInput(Number(chatId), user, msg);
        } else if (user.registrationStep === 'awaiting_post_view_confirmation') {
          // Handle confirmation - this should be handled by callback buttons
          return;
        } else if (user.registrationStep === 'awaiting_ad_confirmation') {
          // Handle confirmation - this should be handled by callback buttons
          return;
        } else if (user.registrationStep === 'creating_clan_name') {
          await handleClanNameInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'adding_to_treasury') {
          await handleClanSearchInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'searching_clans') {
          await handleClanSearchInput(Number(chatId), user, text);
        } else if (user.registrationStep && user.registrationStep.startsWith('setting_deputy_')) {
          await handleDeputyNicknameInput(Number(chatId), user, text);
        } else if (user.registrationStep && user.registrationStep.startsWith('removing_member_')) {
          await handleRemoveMemberNicknameInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'buying_army_hamsters') {
          await handleArmyHamstersInput(Number(chatId), user, text);
        } else if (user.registrationStep === 'buying_personal_army') {
          await handlePersonalArmyInput(Number(chatId), user, text);
        } else if (text.match(/^\d+$/) && parseInt(text) > 0) {
          // Handle direct number input for army purchase if user is in clan shop context
          const userClan = await storage.getUserClan(user.id);
          if (userClan && (userClan.ownerId === user.id || userClan.deputyId === user.id)) {
            await handleDirectArmyPurchase(Number(chatId), user, text);
            return;
          }
        }
      }

      // Apply anti-spam moderation in group chats after all command processing
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        await handleAntiSpamModeration(msg);
      }
    } catch (error: any) {
      log(`Error handling message: ${error}`);
      await notifyError('Ошибка при обработке сообщения', error.toString(), telegramId);
      // Only send error messages in private chats
      if (msg.chat.type === 'private') {
        await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
      }
    }
  });

  // Handle callback queries (button presses)
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message?.chat.id;
    const telegramId = callbackQuery.from.id.toString();
    const data = callbackQuery.data;

    if (!chatId || !data) return;

    try {
      const user = await storage.getBotUserByTelegramId(telegramId);
      if (!user) return;

      await bot.answerCallbackQuery(callbackQuery.id);

      switch (data) {
        case 'confirm_password':
          await confirmPassword(Number(chatId), user);
          break;
        case 'reject_password':
          await rejectPassword(Number(chatId), user);
          break;
        case 'change_nickname':
          await startNicknameChange(chatId, user);
          break;
        case 'change_password':
          await startPasswordChange(chatId, user);
          break;
        case 'delete_account':
          await confirmDeleteAccount(chatId, user);
          break;
        case 'confirm_delete':
          await deleteAccount(chatId, user);
          break;
        case 'cancel_delete':
          await showAdditionalMenu(chatId);
          break;
        case 'back_to_profile':
          await storage.updateBotUser(user.id, { registrationStep: 'none' });
          await showProfile(chatId, user);
          break;
        case 'referral_link':
          await showReferralLink(chatId, user);
          break;
        case 'personal_army_shop':
          await showPersonalArmyShop(chatId, user);
          break;
        case 'create_account':
          // Check account limit before allowing new registration
          const userAccounts = await storage.getBotUsersByTelegramId(telegramId);
          const registeredCount = userAccounts.filter(acc => acc.isRegistered).length;
          if (registeredCount >= 3) {
            await bot.sendMessage(chatId, 'Вы уже создали максимальное количество аккаунтов (3). Удалите один из существующих аккаунтов, чтобы создать новый.');
            await showAdditionalMenu(chatId);
            return;
          }

          // Create new unregistered user for this telegram account
          const newUser = await storage.createBotUser({
            telegramId,
            nickname: '',
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            isRegistered: false,
            registrationStep: 'awaiting_nickname',
            hamsters: '0'
          });

          await startNewRegistration(chatId);
          break;
        case 'advertise_channel':
          await startChannelAd(chatId, user);
          break;
        case 'advertise_chat':
          await startChatAd(chatId, user);
          break;
        case 'advertise_post_view':
          await startPostViewAd(chatId, user);
          break;
        case 'advertise_reaction':
          await startReactionAd(chatId, user);
          break;
        case 'reaction_type_1':
          await handleReactionType(chatId, user, 1);
          break;
        case 'reaction_type_2':
          await handleReactionType(chatId, user, 2);
          break;
        case 'check_admin_rights':
          await checkAdminRights(Number(chatId), user);
          break;
        case 'confirm_ad':
          await confirmAdCreation(chatId, user);
          break;
        case 'confirm_ad_creation':
          await confirmAdCreation(chatId, user);
          break;
        case 'confirm_post_view_ad':
          await confirmPostViewAd(chatId, user);
          break;
        case 'confirm_reaction_ad':
          await confirmReactionAd(chatId, user);
          break;
        case 'cancel_ad':
          await showAdvertiseMenu(chatId, user);
          break;
        case 'back_to_earn':
          await showEarnMenu(chatId, user);
          break;
        case 'earn_channels':
          await showEarnChannels(chatId, user);
          break;
        case 'earn_chats':
          await showEarnChats(chatId, user);
          break;
        case 'earn_post_views':
          await showEarnPostViews(chatId, user);
          break;
        case 'earn_reactions':
          await showEarnReactions(chatId, user);
          break;
        case 'earn_reactions_type_1':
          await showEarnReactionsByType(chatId, user, 1, 0);
          break;
        case 'earn_reactions_type_2':
          await showEarnReactionsByType(chatId, user, 2, 0);
          break;
        case 'back_to_main':
          await showMainMenu(chatId, user.nickname || '');
          break;
        case 'back_to_advertise':
          await showAdvertiseMenu(chatId, user);
          break;
        case 'cancel_ad_creation':
          await storage.updateBotUser(user.id, { registrationStep: 'none' });
          await showMainMenu(chatId, user.nickname || '');
          break;
        case 'view_appeals':
          await showAppeals(chatId);
          break;
        case 'login_account':
          await startLogin(chatId);
          break;
        case 'register_new':
          // Check account limit before allowing new registration
          const existingAccounts = await storage.getBotUsersByTelegramId(telegramId);
          if (existingAccounts.length >= 3) {
            await bot.sendMessage(chatId, 'Вы уже создали максимальное количество аккаунтов (3). Удалите один из существующих аккаунтов, чтобы создать новый.');
            await showRegistrationChoice(chatId);
            return;
          }
          await startNewRegistration(chatId);
          await storage.updateBotUser(user.id, { registrationStep: 'awaiting_nickname' });
          break;
        case 'switch_accounts':
          await showAccountSwitcher(chatId, telegramId);
          break;
        case 'claim_bonus':
          await handleBonusClaim(telegramId, chatId);
          break;
        case 'donate_menu':
          await showDonateMenu(chatId);
          break;
        case 'additional_menu':
          await showAdditionalMenu(chatId);
          break;
        case 'manage_my_tasks':
          await showManageTasksMenu(chatId, user);
          break;
        case 'show_commands':
          await showCommands(chatId, user);
          break;
        case 'support_contact':
          await showSupportContact(chatId);
          break;
        case 'clan_menu':
          await showClanMenu(chatId, user);
          break;
        case 'create_clan':
          await startClanCreation(chatId, user);
          break;
        case 'join_clan':
          await showJoinClanMenu(chatId, user);
          break;
        case 'my_clan':
          await showMyClan(chatId, user);
          break;
        case 'delete_clan':
          await confirmDeleteClan(chatId, user);
          break;
        case 'confirm_delete_clan':
          await deleteClan(chatId, user);
          break;
        case 'cancel_delete_clan':
          await showMyClan(chatId, user);
          break;
        case 'leave_clan':
          await confirmLeaveClan(chatId, user);
          break;
        case 'confirm_leave_clan':
          await leaveClan(chatId, user);
          break;
        case 'cancel_leave_clan':
          await showMyClan(chatId, user);
          break;
        case 'claim_clan_bonus':
          await handleClanBonusClaim(user.telegramId, chatId);
          break;
        case 'back_to_clan':
          await showClanMenu(chatId, user);
          break;
        case 'add_to_treasury':
          await handleAddToTreasury(chatId, user);
          break;
        case 'search_clans':
          await startClanSearch(chatId, user);
          break;
        case 'clan_stats':
          await showClanStatsMenu(chatId, user);
          break;

        case 'clan_shop':
          await showClanShop(chatId, user);
          break;
        case 'clan_stats_treasury':
          await showClanStatsByTreasury(chatId, user);
          break;
        case 'clan_stats_army':
          await showClanStatsByArmy(chatId, user);
          break;
        case 'clan_shop':
          await showClanShop(chatId, user);
          break;
        case 'buy_army_hamsters':
          await startBuyArmyHamsters(chatId, user);
          break;
        case 'cancel_clan_creation':
          await storage.updateBotUser(user.id, { registrationStep: 'none' });
          await showClanMenu(chatId, user);
          break;
        default:
          // Handle mines game callbacks
          if (data.startsWith('mg_')) {
            await handleMinesCallback(callbackQuery, bot);
            break;
          }
          // Handle account switching
          if (data.startsWith('switch_to_')) {
            const accountId = data.replace('switch_to_', '');
            await switchToAccount(chatId, telegramId, accountId);
          }
          // Handle task subscription
          else if (data.startsWith('subscribe_')) {
            const taskId = data.replace('subscribe_', '');
            await subscribeToTask(chatId, user, taskId);
          }
          // Handle role permission toggle
          else if (data.startsWith('toggle_perm_')) {
            const [, , roleId, permission] = data.split('_');
            await toggleRolePermission(callbackQuery, Number(chatId), telegramId, roleId, permission);
          }
          // Handle role save
          else if (data.startsWith('save_role_')) {
            const roleId = data.replace('save_role_', '');
            await saveRoleConfiguration(callbackQuery, Number(chatId), telegramId, roleId);
          }
          // Handle subscription check
          else if (data.startsWith('check_')) {
            const taskId = data.replace('check_', '');
            await checkSubscription(chatId, user, taskId);
          }
          // Handle post view viewing
          else if (data.startsWith('view_post_')) {
            const taskId = data.replace('view_post_', '');
            await viewPost(chatId, user, taskId);
          }
          // Handle next post
          else if (data.startsWith('next_post_')) {
            const taskId = data.replace('next_post_', '');
            await showEarnPostViews(chatId, user); // Redirect to showEarnPostViews to get the next task
          }
          // Handle task deletion
          else if (data.startsWith('delete_task_')) {
            const taskId = data.replace('delete_task_', '');
            await deleteUserTask(chatId, user, taskId);
          }
          // Handle task deletion confirmation
          else if (data.startsWith('confirm_delete_task_')) {
            const taskId = data.replace('confirm_delete_task_', '');
            await confirmDeleteTask(chatId, user, taskId);
          }
          // Handle task deletion cancellation
          else if (data.startsWith('cancel_delete_task_')) {
            await showMyTasks(chatId, user);
          }
          // Handle managed task type selection
          else if (data.startsWith('manage_tasks_')) {
            const type = data.replace('manage_tasks_', '');
            await showManageTasksByType(chatId, user, type);
          }
          // Handle managed task deletion
          else if (data.startsWith('delete_managed_')) {
            const taskId = data.replace('delete_managed_', '');
            await deleteManagedTask(chatId, user, taskId);
          }
          // Handle resubscribe after penalty warning
          else if (data.startsWith('resubscribe_')) {
            const taskId = data.replace('resubscribe_', '');
            await handleResubscribe(chatId, user, taskId);
          }
          // Handle donate star options
          else if (data.startsWith('donate_')) {
            await handleDonateStars(chatId, data);
          }

          // Handle reaction task selection
          else if (data.startsWith('do_reaction_task_')) {
            const taskId = data.replace('do_reaction_task_', '');
            await startReactionTask(chatId, user, taskId);
          }
          // Handle reaction pagination
          else if (data.startsWith('reactions_page_')) {
            const parts = data.replace('reactions_page_', '').split('_');
            const reactionType = parseInt(parts[0]);
            const page = parseInt(parts[1]);
            await showEarnReactionsByType(chatId, user, reactionType, page);
          }
          // Handle reaction proof upload
          else if (data.startsWith('upload_reaction_proof_')) {
            const taskId = data.replace('upload_reaction_proof_', '');
            await uploadReactionProof(chatId, user, taskId);
          }
          // Handle reaction proof review by task owner
          else if (data.startsWith('approve_proof_')) {
            const proofId = data.replace('approve_proof_', '');
            await reviewReactionProof(chatId, user, proofId, 'approved');
          }
          else if (data.startsWith('reject_proof_')) {
            const proofId = data.replace('reject_proof_', '');
            await reviewReactionProof(chatId, user, proofId, 'rejected');
          }
          // Handle appeals
          else if (data.startsWith('appeal_proof_')) {
            const proofId = data.replace('appeal_proof_', '');
            await submitAppeal(chatId, user, proofId);
          }
          // Handle admin appeal review
          else if (data.startsWith('admin_approve_appeal_')) {
            const proofId = data.replace('admin_approve_appeal_', '');
            await adminApproveAppeal(chatId, proofId);
          }
          else if (data.startsWith('admin_reject_appeal_')) {
            const proofId = data.replace('admin_reject_appeal_', '');
            await adminRejectAppeal(chatId, proofId);
          }
          // Handle viewing reaction photo
          else if (data.startsWith('view_reaction_photo_')) {
            const taskId = data.replace('view_reaction_photo_', '');
            await viewReactionPhoto(chatId, user, taskId);
          }
          // Handle clan join requests
          else if (data.startsWith('request_join_')) {
            const clanId = data.replace('request_join_', '');
            await requestJoinClan(chatId, user, clanId);
          }
          // Handle clan join request responses
          else if (data.startsWith('accept_join_req_')) {
            const requestId = data.replace('accept_join_req_', '');
            await acceptClanJoinRequest(chatId, user, requestId);
          }
          else if (data.startsWith('reject_join_req_')) {
            const requestId = data.replace('reject_join_req_', '');
            await rejectClanJoinRequest(chatId, user, requestId);
          }
          // Handle clan management
          else if (data.startsWith('clan_requests_')) {
            const clanId = data.replace('clan_requests_', '');
            await showClanRequests(chatId, user, clanId);
          }
          else if (data.startsWith('set_deputy_')) {
            const clanId = data.replace('set_deputy_', '');
            await startSetDeputy(chatId, user, clanId);
          }
          else if (data.startsWith('remove_deputy_')) {
            const clanId = data.replace('remove_deputy_', '');
            await removeClanDeputy(chatId, user, clanId);
          }
          else if (data.startsWith('confirm_deputy_')) {
            const params = data.split('_');
            if (params.length === 3) {
              const deputyIdSuffix = params[2];
              // Need to find the full user ID from the suffix if it's stored that way
              // For now, assuming direct ID or requires lookup
              await bot.sendMessage(chatId, 'Функция подтверждения назначения заместителя в разработке.');
            }
          }
          else if (data.startsWith('remove_member_')) {
            const clanId = data.replace('remove_member_', '');
            await startRemoveMember(chatId, user, clanId);
          }
          else if (data.startsWith('crm_')) { // Callback data for confirmRemoveMember
            const parts = data.split('_');
            if (parts.length === 3) {
              const memberIdSuffix = parts[1];
              const clanIdSuffix = parts[2];

              // Найти полные ID по суффиксам
              const allUsers = await storage.getBotUsers();
              const memberUser = allUsers.find((u: any) => u.id.endsWith(memberIdSuffix));

              const allClans = await storage.getAllClans();
              const clan = allClans.find(c => c.id.endsWith(clanIdSuffix));

              if (memberUser && clan) {
                await confirmRemoveMember(chatId, user, memberUser.id, clan.id);
              } else {
                await bot.sendMessage(chatId, 'Ошибка: участник или клан не найдены.');
              }
            }
          }


          break;
      }
    } catch (error: any) {
      log(`Error handling callback query: ${error}`);
      await notifyError('Ошибка при обработке callback query', error.toString(), telegramId);
      await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
  });

  log('Telegram bot setup complete');
  // Background periodic tasks
  setInterval(checkExpiredMutes, 60 * 1000);
  setInterval(processWebMessages, 3 * 1000);
  setInterval(checkAutoCompensations, 60 * 60 * 1000);
  setInterval(checkPendingPenalties, 3 * 1000);
  setInterval(checkActiveTasksHealth, 15 * 60 * 1000);

}


