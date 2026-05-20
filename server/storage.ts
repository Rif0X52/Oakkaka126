import { type User, type InsertUser, type BotUser, type InsertBotUser, type AdTask, type InsertAdTask, type AdSubscription, type InsertAdSubscription, type PenaltyCheck, type InsertPenaltyCheck, type Message, type InsertMessage, type Chat, type InsertChat, type WebMessage, type InsertWebMessage, type ReactionSubmission, type InsertReactionSubmission } from "@shared/schema";
import { randomUUID } from "crypto";
import { MongoClient, Db, Collection, ObjectId } from "mongodb";
import { notifyAdminTaskCreated, notifyAdminClanCreated, notifyAdminClanDeleted } from "./notifications";

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function safeParseInt(value: string | null | undefined, defaultValue: number = 0): number {
  if (!value) return defaultValue;
  const floatValue = parseFloat(value);
  if (isNaN(floatValue) || !isFinite(floatValue)) return defaultValue;
  return Math.floor(floatValue);
}

const MONGO_URL = (process.env.MONGO_URL || '').startsWith('mongodb') ? process.env.MONGO_URL : 'mongodb+srv://RifOX:m252525m@cluster0.c6bni8r.mongodb.net/?appName=Cluster0';

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getBotUsers(): Promise<BotUser[]>;
  getBotUser(id: string): Promise<BotUser | undefined>;
  getBotUserByTelegramId(telegramId: string): Promise<BotUser | undefined>;
  getBotUsersByTelegramId(telegramId: string): Promise<BotUser[]>;
  getBotUserByNickname(nickname: string): Promise<BotUser | undefined>;
  createBotUser(user: InsertBotUser): Promise<BotUser>;
  updateBotUser(id: string, updates: Partial<BotUser>): Promise<BotUser | undefined>;
  deleteBotUser(id: string): Promise<boolean>;
  addHamsters(userId: string, amount: number): Promise<BotUser | null>;
  getUserArmyHamsters(userId: string): Promise<string | null>;
  addUserArmyHamsters(userId: string, amount: number): Promise<void>;
  getBotUserByReferralCode(code: string): Promise<BotUser | null>;
  getTopHamsters(limit: number): Promise<BotUser[]>;
  getTopArmyHamsters(limit: number): Promise<BotUser[]>;
  generateReferralCode(userId: string): Promise<string | null>;

  createAdTask(task: InsertAdTask): Promise<AdTask>;
  getAdTasks(): Promise<AdTask[]>;
  getActiveAdTasks(): Promise<AdTask[]>;
  getAdTask(id: string): Promise<AdTask | null>;
  updateAdTask(id: string, updates: Partial<AdTask>): Promise<AdTask | null>;
  deleteAdTask(id: string): Promise<boolean>;

  createAdSubscription(subscription: InsertAdSubscription): Promise<AdSubscription>;
  getAdSubscription(userId: string, taskId: string): Promise<AdSubscription | null>;
  updateAdSubscription(id: string, updates: Partial<AdSubscription>): Promise<AdSubscription | null>;
  getUserAdSubscriptions(userId: string): Promise<AdSubscription[]>;

  createPenaltyCheck(penaltyCheck: InsertPenaltyCheck): Promise<PenaltyCheck>;
  getPendingPenaltyChecks(): Promise<PenaltyCheck[]>;
  updatePenaltyCheck(id: string, updates: Partial<PenaltyCheck>): Promise<PenaltyCheck | null>;
  getPenaltyCheckByUserAndTask(userId: string, taskId: string): Promise<PenaltyCheck | null>;

  getMessages(): Promise<Message[]>;
  getAllMessages(): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
  getMessagesByChat(telegramChatId: string): Promise<Message[]>;
  getRecentMessages(telegramChatId: string, limit?: number): Promise<Message[]>;
  getChatActiveUserIds(telegramChatId: string): Promise<string[]>;
  createMessage(message: InsertMessage): Promise<Message>;

  createChat(chat: InsertChat): Promise<Chat>;
  getChats(): Promise<Chat[]>;
  getChat(telegramChatId: string): Promise<Chat | null>;
  updateChat(telegramChatId: string, updates: Partial<Chat>): Promise<Chat | null>;

  getChatSettings(chatId: string): Promise<any | null>;
  updateChatSettings(chatId: string, settings: any): Promise<any | null>;

  createWebMessage(webMessage: InsertWebMessage): Promise<WebMessage>;
  getPendingWebMessages(): Promise<WebMessage[]>;
  getUnprocessedWebMessages(): Promise<WebMessage[]>;
  markWebMessageAsProcessed(id: string, success?: boolean): Promise<WebMessage | null>;
  markWebMessageSent(id: string): Promise<WebMessage | null>;
  getUserAdTasks(userId: string): Promise<AdTask[]>;

  createReactionSubmission(submission: InsertReactionSubmission): Promise<ReactionSubmission>;
  getReactionSubmission(id: string): Promise<ReactionSubmission | null>;
  getReactionSubmissionsByTask(taskId: string): Promise<ReactionSubmission[]>;
  getReactionSubmissionsByUser(userId: string): Promise<ReactionSubmission[]>;
  getPendingReactionSubmissions(): Promise<ReactionSubmission[]>;
  getAppealedReactionSubmissions(): Promise<ReactionSubmission[]>;
  updateReactionSubmission(id: string, updates: Partial<ReactionSubmission>): Promise<ReactionSubmission | null>;

  createReactionTask(task: any): Promise<any>;
  getReactionTask(id: string): Promise<any | null>;
  updateReactionTask(id: string, updates: any): Promise<any | null>;
  getPendingReactionTasks(excludeUserId?: string): Promise<any[]>;

  createReactionProof(proof: any): Promise<any>;
  getReactionProof(id: string): Promise<any | null>;
  updateReactionProof(id: string, updates: any): Promise<any | null>;
  hasReactionProofForUser(userId: string, taskId: string): Promise<boolean>;

  createAutoCompensation(compensation: any): Promise<any>;
  getPendingAutoCompensations(): Promise<any[]>;
  updateAutoCompensation(id: string, updates: any): Promise<any | null>;
  getReactionProofByUserAndTask(userId: string, taskId: string): Promise<any>;
  getAppealedReactionProofs(): Promise<ReactionSubmission[]>;

  createClan(clanData: any): Promise<any>;
  getClan(clanId: string): Promise<any | null>;
  getClanByName(name: string): Promise<any | null>;
  updateClan(clanId: string, updates: any): Promise<any | null>;
  deleteClan(clanId: string, deletedById?: string): Promise<boolean>;
  getUserClan(userId: string): Promise<any | null>;
  createClanMembership(membershipData: any): Promise<any>;
  getClanMembers(clanId: string): Promise<any[]>;
  getClanMembersCount(clanId: string): Promise<number>;
  removeClanMember(userId: string): Promise<boolean>;
  createClanBonus(bonusData: any): Promise<any>;
  addToTreasury(clanId: string, amount: number): Promise<any | null>;
  getAllClans(): Promise<any[]>;
  getClansByArmyHamsters(): Promise<any[]>;

  createClanJoinRequest(requestData: any): Promise<any>;
  getClanJoinRequests(clanId: string): Promise<any[]>;
  getUserClanJoinRequest(userId: string, clanId: string): Promise<any | null>;
  updateClanJoinRequest(requestId: string, updates: any): Promise<any | null>;
  isUserClanAdmin(userId: string, clanId: string): Promise<boolean>;
  setClanDeputy(clanId: string, deputyId: string | null): Promise<any | null>;

  createChatMute(muteData: any): Promise<any>;
  getActiveMute(chatId: string, userId: string): Promise<any | null>;
  deactivateMute(muteId: string): Promise<any | null>;
  getExpiredMutes(): Promise<any[]>;

  createChatAdmin(adminData: any): Promise<any>;
  getChatAdmin(chatId: string, userId: string): Promise<any | null>;
  removeChatAdmin(chatId: string, userId: string): Promise<any | null>;
  isChatAdmin(chatId: string, userId: string): Promise<boolean>;
  getAllChatAdmins(chatId: string): Promise<any[]>;

  createCustomRole(roleData: any): Promise<any>;
  getCustomRole(roleId: string): Promise<any | null>;
  getCustomRoleByName(chatId: string, name: string): Promise<any | null>;
  updateCustomRole(roleId: string, updates: any): Promise<any | null>;
  deleteCustomRole(roleId: string): Promise<boolean>;
  getChatCustomRoles(chatId: string): Promise<any[]>;

  assignRole(assignmentData: any): Promise<any>;
  removeRoleAssignment(chatId: string, userId: string, roleId: string): Promise<any | null>;
  getUserRoles(chatId: string, userId: string): Promise<any[]>;
  getRoleAssignments(roleId: string): Promise<any[]>;
  hasRole(chatId: string, userId: string, roleName: string): Promise<boolean>;
  getUserPermissions(chatId: string, userId: string): Promise<string[]>;
}

export class MongoStorage implements IStorage {
  private client: MongoClient;
  private db: Db;
  private connected: boolean = false;

  private usersCol: Collection<any>;
  private botUsersCol: Collection<any>;
  private adTasksCol: Collection<any>;
  private adSubsCol: Collection<any>;
  private penaltyChecksCol: Collection<any>;
  private messagesCol: Collection<any>;
  private chatsCol: Collection<any>;
  private webMessagesCol: Collection<any>;
  private reactionSubmissionsCol: Collection<any>;
  private clansCol: Collection<any>;
  private clanMembershipsCol: Collection<any>;
  private clanBonusesCol: Collection<any>;
  private clanJoinRequestsCol: Collection<any>;
  private chatSettingsCol: Collection<any>;
  private chatMutesCol: Collection<any>;
  private chatAdminsCol: Collection<any>;
  private customRolesCol: Collection<any>;
  private roleAssignmentsCol: Collection<any>;

  constructor() {
    this.client = new MongoClient(MONGO_URL);
    this.db = this.client.db('hamyafka_bot');
    this.usersCol = this.db.collection('users');
    this.botUsersCol = this.db.collection('bot_users');
    this.adTasksCol = this.db.collection('ad_tasks');
    this.adSubsCol = this.db.collection('ad_subscriptions');
    this.penaltyChecksCol = this.db.collection('penalty_checks');
    this.messagesCol = this.db.collection('messages');
    this.chatsCol = this.db.collection('chats');
    this.webMessagesCol = this.db.collection('web_messages');
    this.reactionSubmissionsCol = this.db.collection('reaction_submissions');
    this.clansCol = this.db.collection('clans');
    this.clanMembershipsCol = this.db.collection('clan_memberships');
    this.clanBonusesCol = this.db.collection('clan_bonuses');
    this.clanJoinRequestsCol = this.db.collection('clan_join_requests');
    this.chatSettingsCol = this.db.collection('chat_settings');
    this.chatMutesCol = this.db.collection('chat_mutes');
    this.chatAdminsCol = this.db.collection('chat_admins');
    this.customRolesCol = this.db.collection('custom_roles');
    this.roleAssignmentsCol = this.db.collection('role_assignments');
  }

  async connect() {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
      log('MongoDB connected successfully');
    }
  }

  // Initialize data from JSON files if collections are empty
  async initializeFromJson(dataDir: string) {
    const fs = await import('fs');
    const path = await import('path');
    const readJson = async (file: string, def: any[] = []) => {
      try {
        const data = await fs.promises.readFile(path.join(dataDir, file), 'utf-8');
        return JSON.parse(data);
      } catch { return def; }
    };

    // Check if bot_users collection has data
    const botUsersCount = await this.botUsersCol.countDocuments();
    if (botUsersCount === 0) {
      log('Migrating data from JSON files to MongoDB...');

      const users = await readJson('users.json');
      const botUsers = await readJson('bot_users.json');
      const adTasks = await readJson('ad_tasks.json');
      const adSubs = await readJson('ad_subscriptions.json');
      const penalties = await readJson('penalty_checks.json');
      const messages = await readJson('messages.json');
      const chats = await readJson('chats.json');
      const webMessages = await readJson('web_messages.json');
      const reactionSubs = await readJson('reaction_submissions.json');
      const clans = await readJson('clans.json');
      const clanMemberships = await readJson('clan_memberships.json');
      const clanBonuses = await readJson('clan_bonuses.json');
      const clanJoinRequests = await readJson('clan_join_requests.json');
      const chatSettings = await readJson('chat_settings.json');
      const customRoles = await readJson('custom_roles.json');
      const roleAssignments = await readJson('role_assignments.json');
      const chatMutes = await readJson('chat_mutes.json');
      const chatAdmins = await readJson('chat_admins.json');

      if (users.length > 0) await this.usersCol.insertMany(users);
      if (botUsers.length > 0) await this.botUsersCol.insertMany(botUsers);
      if (adTasks.length > 0) await this.adTasksCol.insertMany(adTasks);
      if (adSubs.length > 0) await this.adSubsCol.insertMany(adSubs);
      if (penalties.length > 0) await this.penaltyChecksCol.insertMany(penalties);
      if (messages.length > 0) await this.messagesCol.insertMany(messages);
      if (chats.length > 0) await this.chatsCol.insertMany(chats);
      if (webMessages.length > 0) await this.webMessagesCol.insertMany(webMessages);
      if (reactionSubs.length > 0) await this.reactionSubmissionsCol.insertMany(reactionSubs);
      if (clans.length > 0) await this.clansCol.insertMany(clans);
      if (clanMemberships.length > 0) await this.clanMembershipsCol.insertMany(clanMemberships);
      if (clanBonuses.length > 0) await this.clanBonusesCol.insertMany(clanBonuses);
      if (clanJoinRequests.length > 0) await this.clanJoinRequestsCol.insertMany(clanJoinRequests);
      if (chatSettings.length > 0) await this.chatSettingsCol.insertMany(chatSettings);
      if (customRoles.length > 0) await this.customRolesCol.insertMany(customRoles);
      if (roleAssignments.length > 0) await this.roleAssignmentsCol.insertMany(roleAssignments);
      if (chatMutes.length > 0) await this.chatMutesCol.insertMany(chatMutes);
      if (chatAdmins.length > 0) await this.chatAdminsCol.insertMany(chatAdmins);

      log('Data migration complete!');
    } else {
      log('MongoDB already has data, skipping migration');
    }
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return (await this.usersCol.findOne({ id })) || undefined;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return (await this.usersCol.findOne({ username })) || undefined;
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const user = { ...insertUser, id: randomUUID() };
    await this.usersCol.insertOne(user);
    return user;
  }

  // Bot user methods
  async getBotUsers(): Promise<BotUser[]> {
    return this.botUsersCol.find().toArray();
  }
  async getBotUser(id: string): Promise<BotUser | undefined> {
    return (await this.botUsersCol.findOne({ id })) || undefined;
  }
  async getBotUserByTelegramId(telegramId: string): Promise<BotUser | undefined> {
    return (await this.botUsersCol.findOne({ telegramId })) || undefined;
  }
  async getBotUsersByTelegramId(telegramId: string): Promise<BotUser[]> {
    return this.botUsersCol.find({ telegramId }).toArray();
  }
  async getBotUserByNickname(nickname: string): Promise<BotUser | undefined> {
    return (await this.botUsersCol.findOne({ nickname })) || undefined;
  }
  async createBotUser(insertBotUser: InsertBotUser): Promise<BotUser> {
    const botUser: BotUser = {
      ...insertBotUser,
      id: randomUUID(),
      firstName: insertBotUser.firstName ?? null,
      lastName: insertBotUser.lastName ?? null,
      username: insertBotUser.username ?? null,
      password: insertBotUser.password ?? null,
      phoneNumber: insertBotUser.phoneNumber ?? null,
      isRegistered: insertBotUser.isRegistered ?? false,
      registrationStep: insertBotUser.registrationStep ?? "none",
      hamsters: insertBotUser.hamsters ?? "0",
      referralCode: null,
      referredBy: insertBotUser.referredBy ?? null,
      lastBonusClaim: insertBotUser.lastBonusClaim ?? null,
      armyHamsters: insertBotUser.armyHamsters ?? "0",
      claimedPromo: insertBotUser.claimedPromo ?? false
    };
    await this.botUsersCol.insertOne(botUser);
    return botUser;
  }
  async updateBotUser(id: string, updates: Partial<BotUser>): Promise<BotUser | undefined> {
    const result = await this.botUsersCol.findOneAndUpdate(
      { id },
      { $set: updates },
      { returnDocument: 'after' }
    );
    return result || undefined;
  }
  async deleteBotUser(id: string): Promise<boolean> {
    const result = await this.botUsersCol.deleteOne({ id });
    return result.deletedCount === 1;
  }
  async addHamsters(userId: string, amount: number): Promise<BotUser | null> {
    const user = await this.getBotUser(userId);
    if (!user) return null;
    const newAmount = safeParseInt(user.hamsters) + amount;
    return await this.updateBotUser(userId, { hamsters: newAmount.toString() }) || null;
  }
  async getUserArmyHamsters(userId: string): Promise<string | null> {
    const user = await this.getBotUser(userId);
    return user?.armyHamsters || '0';
  }
  async addUserArmyHamsters(userId: string, amount: number): Promise<void> {
    const user = await this.getBotUser(userId);
    if (user) {
      const newAmount = Math.max(0, safeParseInt(user.armyHamsters) + amount);
      await this.updateBotUser(userId, { armyHamsters: newAmount.toString() });
    }
  }
  async getBotUserByReferralCode(code: string): Promise<BotUser | null> {
    return await this.botUsersCol.findOne({ referralCode: code }) || null;
  }
  async getTopHamsters(limit: number): Promise<BotUser[]> {
    return this.botUsersCol
      .find({ isRegistered: true })
      .sort({ hamsters: -1 })
      .limit(limit)
      .toArray();
  }
  async getTopArmyHamsters(limit: number): Promise<BotUser[]> {
    return this.botUsersCol
      .find({ isRegistered: true })
      .sort({ armyHamsters: -1 })
      .limit(limit)
      .toArray();
  }
  async generateReferralCode(userId: string): Promise<string | null> {
    const user = await this.getBotUser(userId);
    if (!user) return null;
    if (user.referralCode) return user.referralCode;
    const code = `ref_${user.telegramId}_${randomUUID().slice(0, 8)}`;
    const updated = await this.updateBotUser(userId, { referralCode: code });
    return updated?.referralCode || null;
  }

  // Ad task methods
  async createAdTask(insertAdTask: InsertAdTask): Promise<AdTask> {
    const adTask: AdTask = {
      ...insertAdTask,
      id: randomUUID(),
      subscribersGot: insertAdTask.subscribersGot || "0",
      rewardPerSubscriber: insertAdTask.rewardPerSubscriber || "600",
      isActive: insertAdTask.isActive ?? true,
      postMessage: insertAdTask.postMessage ?? null,
      channelId: insertAdTask.channelId ?? null,
      messageId: insertAdTask.messageId ?? null,
      reactionType: insertAdTask.reactionType ?? null,
      reactionPhoto: insertAdTask.reactionPhoto ?? null
    };
    await this.adTasksCol.insertOne(adTask);
    try {
      const creator = await this.getBotUser(insertAdTask.creatorId);
      if (creator) {
        await notifyAdminTaskCreated(creator.nickname, insertAdTask.creatorId, insertAdTask.type, insertAdTask.title, insertAdTask.totalAmount);
      }
    } catch (e) { console.error('Error notifying admin:', e); }
    return adTask;
  }
  async getAdTasks(): Promise<AdTask[]> {
    return this.adTasksCol.find().toArray();
  }
  async getActiveAdTasks(): Promise<AdTask[]> {
    return this.adTasksCol.find({ isActive: true, $expr: { $gt: [{ $toInt: "$remainingAmount" }, 0] } }).toArray();
  }
  async getAdTask(id: string): Promise<AdTask | null> {
    return await this.adTasksCol.findOne({ id }) || null;
  }
  async updateAdTask(id: string, updates: Partial<AdTask>): Promise<AdTask | null> {
    const result = await this.adTasksCol.findOneAndUpdate(
      { id }, { $set: updates }, { returnDocument: 'after' }
    );
    return result || null;
  }
  async deleteAdTask(id: string): Promise<boolean> {
    const result = await this.adTasksCol.deleteOne({ id });
    return result.deletedCount === 1;
  }
  async getUserAdTasks(userId: string): Promise<AdTask[]> {
    return this.adTasksCol.find({ creatorId: userId }).toArray();
  }

  // Ad subscription methods
  async createAdSubscription(insertAdSubscription: InsertAdSubscription): Promise<AdSubscription> {
    const sub: AdSubscription = {
      ...insertAdSubscription,
      id: randomUUID(),
      subscribed: insertAdSubscription.subscribed ?? false,
      rewardClaimed: insertAdSubscription.rewardClaimed ?? false,
      subscribedAt: insertAdSubscription.subscribedAt || null
    };
    await this.adSubsCol.insertOne(sub);
    return sub;
  }
  async getAdSubscription(userId: string, taskId: string): Promise<AdSubscription | null> {
    return await this.adSubsCol.findOne({ userId, taskId }) || null;
  }
  async updateAdSubscription(id: string, updates: Partial<AdSubscription>): Promise<AdSubscription | null> {
    const result = await this.adSubsCol.findOneAndUpdate(
      { id }, { $set: updates }, { returnDocument: 'after' }
    );
    return result || null;
  }
  async getUserAdSubscriptions(userId: string): Promise<AdSubscription[]> {
    return this.adSubsCol.find({ userId }).toArray();
  }

  // Penalty check methods
  async createPenaltyCheck(insertPenaltyCheck: InsertPenaltyCheck): Promise<PenaltyCheck> {
    const check: PenaltyCheck = {
      ...insertPenaltyCheck,
      id: randomUUID(),
      checked: insertPenaltyCheck.checked ?? false,
      penaltyApplied: insertPenaltyCheck.penaltyApplied ?? false,
      secondChanceOffered: insertPenaltyCheck.secondChanceOffered ?? false,
      secondChanceUsed: insertPenaltyCheck.secondChanceUsed ?? false,
      createdAt: new Date().toISOString()
    };
    await this.penaltyChecksCol.insertOne(check);
    return check;
  }
  async getPendingPenaltyChecks(): Promise<PenaltyCheck[]> {
    return this.penaltyChecksCol.find({ checked: false }).toArray();
  }
  async updatePenaltyCheck(id: string, updates: Partial<PenaltyCheck>): Promise<PenaltyCheck | null> {
    const result = await this.penaltyChecksCol.findOneAndUpdate(
      { id }, { $set: updates }, { returnDocument: 'after' }
    );
    return result || null;
  }
  async getPenaltyCheckByUserAndTask(userId: string, taskId: string): Promise<PenaltyCheck | null> {
    return await this.penaltyChecksCol.findOne({ userId, taskId }) || null;
  }

  // Message methods
  async getMessages(): Promise<Message[]> {
    return this.messagesCol.find().toArray();
  }
  async getAllMessages(): Promise<Message[]> {
    return this.messagesCol.find().toArray();
  }
  async getMessage(id: string): Promise<Message | undefined> {
    return (await this.messagesCol.findOne({ id })) || undefined;
  }
  async getMessagesByChat(telegramChatId: string): Promise<Message[]> {
    return this.messagesCol.find({ telegramChatId }).toArray();
  }
  async getRecentMessages(telegramChatId: string, limit: number = 50): Promise<Message[]> {
    return this.messagesCol.find({ telegramChatId }).sort({ createdAt: -1 }).limit(limit).toArray().then(arr => arr.reverse());
  }
  async getChatActiveUserIds(telegramChatId: string): Promise<string[]> {
    const result = await this.messagesCol.aggregate([
      { $match: { telegramChatId } },
      { $group: { _id: '$telegramUserId' } }
    ]).toArray();
    return result.map(r => r._id).filter(Boolean);
  }
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const msg: Message = {
      ...insertMessage,
      id: randomUUID(),
      messageText: insertMessage.messageText ?? null,
      userName: insertMessage.userName ?? null,
      messageType: insertMessage.messageType ?? "text",
      isFromBot: insertMessage.isFromBot ?? false,
      createdAt: new Date().toISOString()
    };
    await this.messagesCol.insertOne(msg);
    return msg;
  }

  // Chat methods
  async createChat(insertChat: InsertChat): Promise<Chat> {
    const chat: Chat = {
      ...insertChat,
      id: randomUUID(),
      chatTitle: insertChat.chatTitle ?? null,
      isActive: insertChat.isActive ?? true,
      antiSpamEnabled: insertChat.antiSpamEnabled ?? true,
      lastActivity: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    await this.chatsCol.insertOne(chat);
    return chat;
  }
  async getChats(): Promise<Chat[]> {
    return this.chatsCol.find().toArray();
  }
  async getChat(telegramChatId: string): Promise<Chat | null> {
    return await this.chatsCol.findOne({ telegramChatId }) || null;
  }
  async updateChat(telegramChatId: string, updates: Partial<Chat>): Promise<Chat | null> {
    const result = await this.chatsCol.findOneAndUpdate(
      { telegramChatId }, { $set: updates }, { returnDocument: 'after' }
    );
    return result || null;
  }

  // Chat settings
  async getChatSettings(chatId: string): Promise<any | null> {
    return await this.chatSettingsCol.findOne({ chatId }) || null;
  }
  async updateChatSettings(chatId: string, updates: any): Promise<any | null> {
    const result = await this.chatSettingsCol.findOneAndUpdate(
      { chatId },
      { $set: { ...updates, updatedAt: new Date().toISOString() }, $setOnInsert: { id: randomUUID(), creatorHidden: false, fakeCreatorId: null } },
      { upsert: true, returnDocument: 'after' }
    );
    return result;
  }

  // Web message methods
  async createWebMessage(insertWebMessage: InsertWebMessage): Promise<WebMessage> {
    const msg: WebMessage = {
      ...insertWebMessage,
      id: randomUUID(),
      targetUserId: insertWebMessage.targetUserId ?? null,
      sent: insertWebMessage.sent ?? false,
      sentAt: insertWebMessage.sentAt || null,
      createdAt: new Date().toISOString()
    };
    await this.webMessagesCol.insertOne(msg);
    return msg;
  }
  async getPendingWebMessages(): Promise<WebMessage[]> {
    return this.webMessagesCol.find({ sent: false }).toArray();
  }
  async getUnprocessedWebMessages(): Promise<WebMessage[]> {
    return this.webMessagesCol.find({ sent: false }).toArray();
  }
  async markWebMessageAsProcessed(id: string, success: boolean = true): Promise<WebMessage | null> {
    const result = await this.webMessagesCol.findOneAndUpdate(
      { id },
      { $set: { sent: success, sentAt: success ? new Date().toISOString() : null } },
      { returnDocument: 'after' }
    );
    return result || null;
  }
  async markWebMessageSent(id: string): Promise<WebMessage | null> {
    return this.markWebMessageAsProcessed(id, true);
  }

  // Reaction submission methods
  async createReactionSubmission(insertReactionSubmission: InsertReactionSubmission): Promise<ReactionSubmission> {
    const sub: ReactionSubmission = {
      ...insertReactionSubmission,
      id: randomUUID(),
      status: insertReactionSubmission.status || "pending",
      submittedAt: new Date().toISOString(),
      reviewedAt: insertReactionSubmission.reviewedAt || null,
      appealedAt: insertReactionSubmission.appealedAt || null,
      reviewNote: insertReactionSubmission.reviewNote || null
    };
    await this.reactionSubmissionsCol.insertOne(sub);
    return sub;
  }
  async getReactionSubmission(id: string): Promise<ReactionSubmission | null> {
    return await this.reactionSubmissionsCol.findOne({ id }) || null;
  }
  async getReactionSubmissionsByTask(taskId: string): Promise<ReactionSubmission[]> {
    return this.reactionSubmissionsCol.find({ taskId }).toArray();
  }
  async getReactionSubmissionsByUser(userId: string): Promise<ReactionSubmission[]> {
    return this.reactionSubmissionsCol.find({ userId }).toArray();
  }
  async getPendingReactionSubmissions(): Promise<ReactionSubmission[]> {
    return this.reactionSubmissionsCol.find({ status: "pending" }).toArray();
  }
  async getAppealedReactionSubmissions(): Promise<ReactionSubmission[]> {
    return this.reactionSubmissionsCol.find({ status: "appealed" }).toArray();
  }
  async updateReactionSubmission(id: string, updates: Partial<ReactionSubmission>): Promise<ReactionSubmission | null> {
    const result = await this.reactionSubmissionsCol.findOneAndUpdate(
      { id }, { $set: updates }, { returnDocument: 'after' }
    );
    return result || null;
  }

  // Reaction task methods
  async createReactionTask(task: any): Promise<any> {
    const id = randomUUID();
    const adTask: AdTask = {
      id,
      creatorId: task.creatorId,
      type: 'reaction',
      title: `Реакция на ${task.messageLink ? 'сообщение' : 'фото'}`,
      link: task.messageLink || '',
      totalAmount: task.totalCost || '0',
      subscribersNeeded: task.reactionsNeeded || '0',
      subscribersGot: task.reactionsGot || '0',
      rewardPerSubscriber: task.pricePerReaction || '600',
      remainingAmount: task.totalCost || '0',
      isActive: task.status === 'active',
      createdAt: new Date().toISOString(),
      channelId: task.photoFileId || task.channelName || null,
      messageId: task.messageId || null,
      postMessage: task.messageLink || null,
      reactionType: task.reactionType ?? 1,
      reactionPhoto: task.photoFileId || null
    };
    await this.adTasksCol.insertOne(adTask);
    try {
      const creator = await this.getBotUser(task.creatorId);
      if (creator) await notifyAdminTaskCreated(creator.nickname, task.creatorId, 'reaction', adTask.title, adTask.totalAmount);
    } catch (e) { console.error('Error:', e); }
    return { id, ...task, createdAt: adTask.createdAt };
  }
  async getReactionTask(id: string): Promise<any | null> {
    const task = await this.adTasksCol.findOne({ id, type: 'reaction' });
    if (!task) return null;
    const taskType = task.reactionType ?? (task.channelId && !task.link ? 2 : 1);
    return {
      id: task.id, creatorId: task.creatorId,
      reactionType: taskType,
      photoFileId: task.reactionPhoto || task.channelId,
      messageLink: task.postMessage || task.link,
      pricePerReaction: task.rewardPerSubscriber,
      reactionsNeeded: task.subscribersNeeded,
      reactionsGot: task.subscribersGot,
      totalCost: task.remainingAmount,
      status: task.isActive ? 'active' : 'inactive',
      title: task.title,
      createdAt: task.createdAt
    };
  }
  async updateReactionTask(id: string, updates: any): Promise<any | null> {
    const result = await this.adTasksCol.findOneAndUpdate(
      { id, type: 'reaction' },
      { $set: { subscribersGot: updates.reactionsGot || '0', isActive: updates.status !== 'completed' } },
      { returnDocument: 'after' }
    );
    return result ? this.getReactionTask(id) : null;
  }
  async getPendingReactionTasks(excludeUserId?: string): Promise<any[]> {
    const filter: any = { type: 'reaction', isActive: true };
    if (excludeUserId) filter.creatorId = { $ne: excludeUserId };
    const tasks = await this.adTasksCol.find(filter).toArray();
    return tasks.filter(t => safeParseInt(t.subscribersNeeded) - safeParseInt(t.subscribersGot) > 0 && safeParseInt(t.remainingAmount) > 0).map(task => ({
      id: task.id, creatorId: task.creatorId,
      reactionType: task.reactionType ?? (task.channelId && !task.link ? 2 : 1),
      messageLink: task.postMessage || task.link,
      photoFileId: task.reactionPhoto || (task.channelId && !task.link ? task.channelId : null),
      channelName: task.channelId,
      messageId: task.messageId,
      pricePerReaction: task.rewardPerSubscriber,
      reactionsNeeded: task.subscribersNeeded,
      reactionsGot: task.subscribersGot,
      totalCost: task.remainingAmount,
      status: 'active', title: task.title, createdAt: task.createdAt
    }));
  }

  // Reaction proof methods
  async createReactionProof(proof: any): Promise<any> {
    const id = randomUUID();
    const submission: ReactionSubmission = {
      id, taskId: proof.taskId, userId: proof.userId,
      proofPhoto: proof.proofPhotoId,
      status: proof.status || 'pending',
      submittedAt: new Date().toISOString(),
      reviewedAt: null, appealedAt: null, reviewNote: null
    };
    await this.reactionSubmissionsCol.insertOne(submission);
    return { ...proof, id, createdAt: submission.submittedAt };
  }
  async getReactionProof(id: string): Promise<any | null> {
    const sub = await this.reactionSubmissionsCol.findOne({ id });
    if (!sub) return null;
    return { id: sub.id, taskId: sub.taskId, userId: sub.userId, proofPhotoId: sub.proofPhoto, status: sub.status, createdAt: sub.submittedAt };
  }
  async updateReactionProof(id: string, updates: any): Promise<any | null> {
    const result = await this.reactionSubmissionsCol.findOneAndUpdate(
      { id },
      { $set: { status: updates.status || 'pending', reviewedAt: updates.status ? new Date().toISOString() : null } },
      { returnDocument: 'after' }
    );
    return result ? this.getReactionProof(id) : null;
  }
  async hasReactionProofForUser(userId: string, taskId: string): Promise<boolean> {
    return !!(await this.reactionSubmissionsCol.findOne({ userId, taskId }));
  }
  async getReactionProofByUserAndTask(userId: string, taskId: string): Promise<any> {
    const sub = await this.reactionSubmissionsCol.findOne({ userId, taskId });
    if (!sub) return null;
    return { id: sub.id, taskId: sub.taskId, userId: sub.userId, proofPhotoId: sub.photoFileId, status: sub.status, createdAt: sub.createdAt };
  }
  async getAppealedReactionProofs(): Promise<ReactionSubmission[]> {
    return this.reactionSubmissionsCol.find({ status: "appealed" }).toArray();
  }

  // Auto-compensation methods
  async createAutoCompensation(compensation: any): Promise<any> {
    const item = { ...compensation, id: randomUUID(), processed: false, createdAt: new Date().toISOString() };
    await this.webMessagesCol.insertOne(item);
    return item;
  }
  async getPendingAutoCompensations(): Promise<any[]> {
    return this.webMessagesCol.find({ proofId: { $exists: true }, processed: false, scheduledFor: { $exists: true } }).toArray();
  }
  async updateAutoCompensation(id: string, updates: any): Promise<any | null> {
    const result = await this.webMessagesCol.findOneAndUpdate(
      { id }, { $set: updates }, { returnDocument: 'after' }
    );
    return result || null;
  }

  // Clan methods
  async createClan(clanData: any): Promise<any> {
    const clan = { id: randomUUID(), ...clanData, treasury: clanData.treasury || '0', maxMembers: clanData.maxMembers || '10', createdAt: new Date().toISOString(), armyHamsters: '0' };
    await this.clansCol.insertOne(clan);
    try {
      const creator = await this.getBotUser(clanData.ownerId);
      await notifyAdminClanCreated(creator?.nickname || 'Unknown', creator?.telegramId || clanData.ownerId, clan.name);
    } catch (e) { console.log('Notify error:', e); }
    return clan;
  }
  async getClan(clanId: string): Promise<any | null> {
    return await this.clansCol.findOne({ id: clanId }) || null;
  }
  async getClanByName(name: string): Promise<any | null> {
    return await this.clansCol.findOne({ name }) || null;
  }
  async updateClan(clanId: string, updates: any): Promise<any | null> {
    const result = await this.clansCol.findOneAndUpdate(
      { id: clanId }, { $set: updates }, { returnDocument: 'after' }
    );
    return result || null;
  }
  async deleteClan(clanId: string, deletedById?: string): Promise<boolean> {
    const clan = await this.getClan(clanId);
    if (!clan) return false;
    try {
      const deleter = deletedById ? await this.getBotUser(deletedById) : null;
      await notifyAdminClanDeleted(clan.name, clan.id, deleter?.nickname || 'System', deleter?.telegramId || 'system');
    } catch (e) { console.log('Notify error:', e); }
    await this.clansCol.deleteOne({ id: clanId });
    await this.clanMembershipsCol.deleteMany({ clanId });
    return true;
  }
  async getUserClan(userId: string): Promise<any | null> {
    const membership = await this.clanMembershipsCol.findOne({ userId });
    if (membership) return this.getClan(membership.clanId);
    return null;
  }
  async createClanMembership(membershipData: any): Promise<any> {
    const membership = { id: randomUUID(), ...membershipData, joinedAt: new Date().toISOString() };
    await this.clanMembershipsCol.insertOne(membership);
    return membership;
  }
  async getClanMembers(clanId: string): Promise<any[]> {
    return this.clanMembershipsCol.find({ clanId }).toArray();
  }
  async getClanMembersCount(clanId: string): Promise<number> {
    return this.clanMembershipsCol.countDocuments({ clanId });
  }
  async removeClanMember(userId: string): Promise<boolean> {
    const result = await this.clanMembershipsCol.deleteOne({ userId });
    return result.deletedCount === 1;
  }
  async createClanBonus(bonusData: any): Promise<any> {
    const bonus = { id: randomUUID(), ...bonusData, amount: bonusData.amount || '1000', claimedAt: new Date().toISOString() };
    await this.clanBonusesCol.insertOne(bonus);
    return bonus;
  }
  async addToTreasury(clanId: string, amount: number): Promise<any | null> {
    const clan = await this.getClan(clanId);
    if (!clan) return null;
    const newTreasury = safeParseInt(clan.treasury) + amount;
    return this.updateClan(clanId, { treasury: newTreasury.toString() });
  }
  async getAllClans(): Promise<any[]> {
    return this.clansCol.find().toArray();
  }
  async getClansByArmyHamsters(): Promise<any[]> {
    return this.clansCol.find().sort({ armyHamsters: -1 }).toArray();
  }

  // Clan join request methods
  async createClanJoinRequest(requestData: any): Promise<any> {
    const req = { id: randomUUID(), ...requestData, status: 'pending', requestedAt: new Date().toISOString() };
    await this.clanJoinRequestsCol.insertOne(req);
    return req;
  }
  async getClanJoinRequests(clanId: string): Promise<any[]> {
    return this.clanJoinRequestsCol.find({ clanId, status: 'pending' }).toArray();
  }
  async getUserClanJoinRequest(userId: string, clanId: string): Promise<any | null> {
    return await this.clanJoinRequestsCol.findOne({ userId, clanId, status: 'pending' }) || null;
  }
  async updateClanJoinRequest(requestId: string, updates: any): Promise<any | null> {
    const result = await this.clanJoinRequestsCol.findOneAndUpdate(
      { id: requestId }, { $set: updates }, { returnDocument: 'after' }
    );
    return result || null;
  }
  async isUserClanAdmin(userId: string, clanId: string): Promise<boolean> {
    const clan = await this.getClan(clanId);
    return clan ? (clan.ownerId === userId || clan.deputyId === userId) : false;
  }
  async setClanDeputy(clanId: string, deputyId: string | null): Promise<any | null> {
    return this.updateClan(clanId, { deputyId });
  }

  // Chat mute methods
  async createChatMute(muteData: any): Promise<any> {
    const mute = { id: randomUUID(), ...muteData, createdAt: new Date().toISOString() };
    await this.chatMutesCol.insertOne(mute);
    return mute;
  }
  async getActiveMute(chatId: string, userId: string): Promise<any | null> {
    const now = new Date().toISOString();
    return await this.chatMutesCol.findOne({
      chatId, userId, isActive: true,
      muteUntil: { $gt: now }
    }) || null;
  }
  async deactivateMute(muteId: string): Promise<any | null> {
    const result = await this.chatMutesCol.findOneAndUpdate(
      { id: muteId }, { $set: { isActive: false } }, { returnDocument: 'after' }
    );
    return result || null;
  }
  async getExpiredMutes(): Promise<any[]> {
    const now = new Date().toISOString();
    return this.chatMutesCol.find({ isActive: true, muteUntil: { $lte: now } }).toArray();
  }

  // Chat admin methods
  async createChatAdmin(adminData: any): Promise<any> {
    const admin = { id: randomUUID(), ...adminData, appointedAt: new Date().toISOString() };
    await this.chatAdminsCol.insertOne(admin);
    return admin;
  }
  async getAllChatAdmins(chatId: string): Promise<any[]> {
    return this.chatAdminsCol.find({ chatId }).toArray();
  }
  async isChatAdmin(chatId: string, userId: string): Promise<boolean> {
    const count = await this.chatAdminsCol.countDocuments({ chatId, userId });
    return count > 0;
  }
  async getChatAdmin(chatId: string, userId: string): Promise<any | null> {
    return await this.chatAdminsCol.findOne({ chatId, userId }) || null;
  }
  async removeChatAdmin(chatId: string, userId: string): Promise<any | null> {
    const result = await this.chatAdminsCol.findOneAndDelete({ chatId, userId });
    return result || null;
  }

  // Custom role methods
  async createCustomRole(roleData: any): Promise<any> {
    const role = { id: randomUUID(), ...roleData, createdAt: new Date().toISOString() };
    await this.customRolesCol.insertOne(role);
    return role;
  }
  async getCustomRole(roleId: string): Promise<any | null> {
    return await this.customRolesCol.findOne({ id: roleId }) || null;
  }
  async getCustomRoleByName(chatId: string, roleName: string): Promise<any | null> {
    return await this.customRolesCol.findOne({ chatId, name: { $regex: new RegExp(`^${roleName}$`, 'i') } }) || null;
  }
  async updateCustomRole(roleId: string, updates: any): Promise<any | null> {
    const result = await this.customRolesCol.findOneAndUpdate(
      { id: roleId }, { $set: { ...updates, updatedAt: new Date().toISOString() } }, { returnDocument: 'after' }
    );
    return result || null;
  }
  async deleteCustomRole(roleId: string): Promise<boolean> {
    await this.customRolesCol.deleteOne({ id: roleId });
    await this.roleAssignmentsCol.deleteMany({ roleId });
    return true;
  }
  async getChatCustomRoles(chatId: string): Promise<any[]> {
    return this.customRolesCol.find({ chatId }).toArray();
  }

  // Role assignment methods
  async assignRole(assignmentData: any): Promise<any> {
    const assignment = { id: randomUUID(), ...assignmentData, assignedAt: new Date().toISOString() };
    await this.roleAssignmentsCol.insertOne(assignment);
    return assignment;
  }
  async removeRoleAssignment(chatId: string, userId: string, roleId: string): Promise<any | null> {
    const result = await this.roleAssignmentsCol.findOneAndDelete({ chatId, userId, roleId });
    return result || null;
  }
  async getUserRoles(chatId: string, userId: string): Promise<any[]> {
    return this.roleAssignmentsCol.find({ chatId, userId }).toArray();
  }
  async getRoleAssignments(roleId: string): Promise<any[]> {
    return this.roleAssignmentsCol.find({ roleId }).toArray();
  }
  async hasRole(chatId: string, userId: string, roleName: string): Promise<boolean> {
    const role = await this.getCustomRoleByName(chatId, roleName);
    if (!role) return false;
    const count = await this.roleAssignmentsCol.countDocuments({ chatId, userId, roleId: role.id });
    return count > 0;
  }
  async getUserPermissions(chatId: string, userId: string): Promise<string[]> {
    const assignments = await this.roleAssignmentsCol.find({ chatId, userId }).toArray();
    const perms = new Set<string>();
    for (const a of assignments) {
      const role = await this.getCustomRole(a.roleId);
      if (role?.permissions) {
        role.permissions.forEach((p: string) => perms.add(p));
      }
    }
    return Array.from(perms);
  }
}

export const storage = new MongoStorage();
