import { pgTable, text, boolean, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const botUsers = pgTable("bot_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  telegramId: text("telegram_id").notNull().unique(),
  nickname: text("nickname"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  username: text("username"),
  phoneNumber: text("phone_number"),
  password: text("password"),
  isRegistered: boolean("is_registered").default(false),
  hamsters: text("hamsters").default("0"),
  armyHamsters: text("army_hamsters").default("0"),
  registrationStep: text("registration_step").default(""),
  referredBy: text("referred_by"),
  referralCode: text("referral_code"),
  lastDaily: text("last_daily"),
  lastBonusClaim: text("last_bonus_claim"),
  lastClanBonusClaim: text("last_clan_bonus_claim"),
  claimedPromo: boolean("claimed_promo").default(false),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const adTasks = pgTable("ad_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: text("creator_id").notNull(),
  type: text("type").notNull(), // 'channel', 'chat', 'post_view', 'reaction'
  title: text("title").notNull(),
  description: text("description"),
  link: text("link").notNull(),
  totalAmount: text("total_amount").notNull(),
  remainingAmount: text("remaining_amount").notNull(),
  subscribersNeeded: text("subscribers_needed").notNull(),
  subscribersGot: text("subscribers_got").default("0"),
  rewardPerSubscriber: text("reward_per_subscriber").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const adSubscriptions = pgTable("ad_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  taskId: text("task_id").notNull(),
  isCompleted: boolean("is_completed").default(false),
  reward: text("reward").default("0"),
  rewardClaimed: boolean("reward_claimed").default(false),
  createdAt: text("created_at").notNull().default(sql`now()`),
  completedAt: text("completed_at"),
});

export const penaltyChecks = pgTable("penalty_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  taskId: text("task_id").notNull(),
  rewardAmount: text("reward_amount").notNull(),
  penaltyAmount: text("penalty_amount").notNull(),
  checkDate: text("check_date").notNull(),
  checked: boolean("checked").default(false),
  penaltyApplied: boolean("penalty_applied").default(false),
  secondChanceOffered: boolean("second_chance_offered").default(false),
  secondChanceUsed: boolean("second_chance_used").default(false),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  telegramChatId: text("telegram_chat_id").notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  userName: text("user_name").notNull(),
  messageText: text("message_text").notNull(),
  messageType: text("message_type").notNull(),
  isFromBot: boolean("is_from_bot").default(false),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const chats = pgTable("chats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  telegramChatId: text("telegram_chat_id").notNull().unique(),
  chatTitle: text("chat_title"),
  chatType: text("chat_type").notNull(),
  lastActivity: text("last_activity"),
  isActive: boolean("is_active").default(true),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const webMessages = pgTable("web_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientChatId: text("recipient_chat_id").notNull(),
  messageText: text("message_text").notNull(),
  isSent: boolean("is_sent").default(false),
  createdAt: text("created_at").notNull().default(sql`now()`),
  sentAt: text("sent_at"),
});

export const reactionSubmissions = pgTable("reaction_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  taskId: text("task_id").notNull(),
  photoFileId: text("photo_file_id").notNull(),
  status: text("status").default("pending"), // 'pending', 'approved', 'rejected', 'appealed'
  reviewedBy: text("reviewed_by"),
  reviewComment: text("review_comment"),
  awardedHamsters: text("awarded_hamsters").default("0"),
  createdAt: text("created_at").notNull().default(sql`now()`),
  reviewedAt: text("reviewed_at"),
});

export const clans = pgTable("clans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(),
  deputyId: text("deputy_id"),
  treasury: text("treasury").default("0"),
  maxMembers: text("max_members").default("10"),
  armyHamsters: text("army_hamsters").default("0"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const clanMemberships = pgTable("clan_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clanId: text("clan_id").notNull(),
  userId: text("user_id").notNull(),
  joinedAt: text("joined_at").notNull().default(sql`now()`),
});

export const clanBonuses = pgTable("clan_bonuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clanId: text("clan_id").notNull(),
  amount: text("amount").notNull(),
  reason: text("reason").notNull(),
  grantedBy: text("granted_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const clanJoinRequests = pgTable("clan_join_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clanId: text("clan_id").notNull(),
  userId: text("user_id").notNull(),
  status: text("status").default("pending"), // 'pending', 'approved', 'rejected'
  createdAt: text("created_at").notNull().default(sql`now()`),
  respondedAt: text("responded_at"),
});

export const chatMutes = pgTable("chat_mutes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull(), // Telegram chat ID
  userId: text("user_id").notNull(), // Muted user's Telegram ID
  mutedBy: text("muted_by").notNull(), // Who muted them (Telegram ID)
  muteReason: text("mute_reason"), // Optional reason
  muteDuration: text("mute_duration").notNull(), // Duration in milliseconds
  muteUntil: text("mute_until").notNull(), // When mute expires (ISO string)
  isActive: boolean("is_active").default(true), // Whether mute is still active
  createdAt: text("created_at").notNull().default(sql`now()`), // When mute was applied
});

export const chatAdmins = pgTable("chat_admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull(), // Telegram chat ID
  userId: text("user_id").notNull(), // Admin user's Telegram ID
  appointedBy: text("appointed_by").notNull(), // Who appointed them (Telegram ID)
  appointedAt: text("appointed_at").notNull().default(sql`now()`), // When appointed
});

// Custom role system - roles created by chat owners
export const customRoles = pgTable("custom_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull(),
  name: text("name").notNull(), // e.g. "модер", "помощник" 
  displayName: text("display_name").notNull(), // Customizable display name
  permissions: text("permissions").notNull().default("[]"), // JSON array of allowed commands
  createdBy: text("created_by").notNull(), // User ID who created this role
  createdAt: text("created_at").notNull().default(sql`now()`),
});

// Assignment of custom roles to users
export const roleAssignments = pgTable("role_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull(),
  userId: text("user_id").notNull(),
  roleId: text("role_id").notNull(),
  assignedBy: text("assigned_by").notNull(), // User ID who assigned this role
  createdAt: text("created_at").notNull().default(sql`now()`),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

export const insertBotUserSchema = createInsertSchema(botUsers).omit({
  id: true,
});

export const insertAdTaskSchema = createInsertSchema(adTasks).omit({
  id: true,
});

export const insertAdSubscriptionSchema = createInsertSchema(adSubscriptions).omit({
  id: true,
});

export const insertPenaltyCheckSchema = createInsertSchema(penaltyChecks).omit({
  id: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
});

export const insertChatSchema = createInsertSchema(chats).omit({
  id: true,
});

export const insertWebMessageSchema = createInsertSchema(webMessages).omit({
  id: true,
});

export const insertReactionSubmissionSchema = createInsertSchema(reactionSubmissions).omit({
  id: true,
});

export const insertClanSchema = createInsertSchema(clans).omit({
  id: true,
});

export const insertClanMembershipSchema = createInsertSchema(clanMemberships).omit({
  id: true,
});

export const insertClanBonusSchema = createInsertSchema(clanBonuses).omit({
  id: true,
});

export const insertClanJoinRequestSchema = createInsertSchema(clanJoinRequests).omit({
  id: true,
});

export const insertChatMuteSchema = createInsertSchema(chatMutes).omit({
  id: true,
});

export const insertChatAdminSchema = createInsertSchema(chatAdmins).omit({
  id: true,
});

export const insertCustomRoleSchema = createInsertSchema(customRoles).omit({
  id: true,
});

export const insertRoleAssignmentSchema = createInsertSchema(roleAssignments).omit({
  id: true,
});

// Type exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type BotUser = typeof botUsers.$inferSelect;
export type InsertBotUser = z.infer<typeof insertBotUserSchema>;
export type AdTask = typeof adTasks.$inferSelect;
export type InsertAdTask = z.infer<typeof insertAdTaskSchema>;
export type AdSubscription = typeof adSubscriptions.$inferSelect;
export type InsertAdSubscription = z.infer<typeof insertAdSubscriptionSchema>;
export type PenaltyCheck = typeof penaltyChecks.$inferSelect;
export type InsertPenaltyCheck = z.infer<typeof insertPenaltyCheckSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Chat = typeof chats.$inferSelect;
export type InsertChat = z.infer<typeof insertChatSchema>;
export type WebMessage = typeof webMessages.$inferSelect;
export type InsertWebMessage = z.infer<typeof insertWebMessageSchema>;
export type ReactionSubmission = typeof reactionSubmissions.$inferSelect;
export type InsertReactionSubmission = z.infer<typeof insertReactionSubmissionSchema>;
export type Clan = typeof clans.$inferSelect;
export type InsertClan = z.infer<typeof insertClanSchema>;
export type ClanMembership = typeof clanMemberships.$inferSelect;
export type InsertClanMembership = z.infer<typeof insertClanMembershipSchema>;
export type ClanBonus = typeof clanBonuses.$inferSelect;
export type InsertClanBonus = z.infer<typeof insertClanBonusSchema>;
export type ClanJoinRequest = typeof clanJoinRequests.$inferSelect;
export type InsertClanJoinRequest = z.infer<typeof insertClanJoinRequestSchema>;
export type ChatMute = typeof chatMutes.$inferSelect;
export type InsertChatMute = z.infer<typeof insertChatMuteSchema>;
export type ChatAdmin = typeof chatAdmins.$inferSelect;
export type InsertChatAdmin = z.infer<typeof insertChatAdminSchema>;
export type CustomRole = typeof customRoles.$inferSelect;
export type InsertCustomRole = z.infer<typeof insertCustomRoleSchema>;
export type RoleAssignment = typeof roleAssignments.$inferSelect;
export type InsertRoleAssignment = z.infer<typeof insertRoleAssignmentSchema>;