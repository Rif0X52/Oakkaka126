import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBotUserSchema, insertMessageSchema, insertChatSchema, insertWebMessageSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Bot users API endpoints
  app.get("/api/bot-users", async (req, res) => {
    try {
      // This is mainly for debugging - get all bot users
      // In production, you might want to add authentication
      const users = await storage.getBotUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bot users" });
    }
  });

  app.get("/api/bot-users/:telegramId", async (req, res) => {
    try {
      const { telegramId } = req.params;
      const user = await storage.getBotUserByTelegramId(telegramId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/bot-users", async (req, res) => {
    try {
      const validatedData = insertBotUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getBotUserByTelegramId(validatedData.telegramId);
      if (existingUser) {
        return res.status(409).json({ message: "User already exists" });
      }
      
      // Check nickname uniqueness if provided
      if (validatedData.nickname) {
        const existingNickname = await storage.getBotUserByNickname(validatedData.nickname);
        if (existingNickname) {
          return res.status(409).json({ message: "Nickname already taken" });
        }
      }
      
      const user = await storage.createBotUser(validatedData);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/bot-users/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Validate nickname uniqueness if being updated
      if (updates.nickname) {
        const existingNickname = await storage.getBotUserByNickname(updates.nickname);
        if (existingNickname && existingNickname.id !== id) {
          return res.status(409).json({ message: "Nickname already taken" });
        }
      }
      
      const updatedUser = await storage.updateBotUser(id, updates);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Messages API endpoints
  app.get("/api/messages", async (req, res) => {
    try {
      const { chatId } = req.query;
      if (chatId) {
        const messages = await storage.getMessagesByChat(chatId as string);
        res.json(messages);
      } else {
        // Get all messages if no chatId specified
        const messages = await storage.getAllMessages();
        res.json(messages);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.get("/api/messages/:chatId", async (req, res) => {
    try {
      const { chatId } = req.params;
      const messages = await storage.getMessagesByChat(chatId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.get("/api/messages/:chatId/recent", async (req, res) => {
    try {
      const { chatId } = req.params;
      const { limit } = req.query;
      const messages = await storage.getRecentMessages(chatId, limit ? parseInt(limit as string) : 50);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent messages" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const validatedData = insertMessageSchema.parse(req.body);
      const message = await storage.createMessage(validatedData);
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  // Chats API endpoints
  app.get("/api/chats", async (req, res) => {
    try {
      const chats = await storage.getChats();
      res.json(chats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  app.get("/api/chats/:telegramChatId", async (req, res) => {
    try {
      const { telegramChatId } = req.params;
      const chat = await storage.getChat(telegramChatId);
      
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }
      
      res.json(chat);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chat" });
    }
  });

  app.post("/api/chats", async (req, res) => {
    try {
      const validatedData = insertChatSchema.parse(req.body);
      
      // Check if chat already exists
      const existingChat = await storage.getChat(validatedData.telegramChatId);
      if (existingChat) {
        return res.status(409).json({ message: "Chat already exists" });
      }
      
      const chat = await storage.createChat(validatedData);
      res.status(201).json(chat);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create chat" });
    }
  });

  // Web messages API endpoints  
  app.get("/api/web-messages", async (req, res) => {
    try {
      const webMessages = await storage.getPendingWebMessages();
      res.json(webMessages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch web messages" });
    }
  });

  app.post("/api/web-messages", async (req, res) => {
    try {
      const validatedData = insertWebMessageSchema.parse(req.body);
      const webMessage = await storage.createWebMessage(validatedData);
      res.status(201).json(webMessage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create web message" });
    }
  });

  app.patch("/api/web-messages/:id/sent", async (req, res) => {
    try {
      const { id } = req.params;
      const webMessage = await storage.markWebMessageSent(id);
      
      if (!webMessage) {
        return res.status(404).json({ message: "Web message not found" });
      }
      
      res.json(webMessage);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark message as sent" });
    }
  });

  // Ad tasks API endpoints
  app.get("/api/ad-tasks", async (req, res) => {
    try {
      const tasks = await storage.getAdTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ad tasks" });
    }
  });

  app.get("/api/ad-tasks/active", async (req, res) => {
    try {
      const tasks = await storage.getActiveAdTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active ad tasks" });
    }
  });

  app.get("/api/ad-tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const task = await storage.getAdTask(id);
      
      if (!task) {
        return res.status(404).json({ message: "Ad task not found" });
      }
      
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ad task" });
    }
  });

  // Custom roles API endpoints
  app.get("/api/custom-roles", async (req, res) => {
    try {
      const { chatId } = req.query;
      
      if (chatId) {
        const roles = await storage.getChatCustomRoles(chatId.toString());
        res.json(roles);
      } else {
        // Return all roles (for admin view)
        const roles = await storage.customRoles || [];
        res.json(roles);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch custom roles" });
    }
  });

  app.post("/api/custom-roles", async (req, res) => {
    try {
      const roleData = req.body;
      const role = await storage.createCustomRole(roleData);
      res.status(201).json(role);
    } catch (error) {
      res.status(500).json({ message: "Failed to create custom role" });
    }
  });

  app.get("/api/custom-roles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const role = await storage.getCustomRole(id);
      
      if (!role) {
        return res.status(404).json({ message: "Custom role not found" });
      }
      
      res.json(role);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch custom role" });
    }
  });

  app.patch("/api/custom-roles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const role = await storage.updateCustomRole(id, updates);
      
      if (!role) {
        return res.status(404).json({ message: "Custom role not found" });
      }
      
      res.json(role);
    } catch (error) {
      res.status(500).json({ message: "Failed to update custom role" });
    }
  });

  app.delete("/api/custom-roles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteCustomRole(id);
      
      if (!success) {
        return res.status(404).json({ message: "Custom role not found" });
      }
      
      res.json({ message: "Custom role deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete custom role" });
    }
  });

  // Role assignments API endpoints
  app.get("/api/role-assignments", async (req, res) => {
    try {
      const { roleId, chatId, userId } = req.query;
      
      if (roleId) {
        const assignments = await storage.getRoleAssignments(roleId.toString());
        res.json(assignments);
      } else if (chatId && userId) {
        const roles = await storage.getUserRoles(chatId.toString(), userId.toString());
        res.json(roles);
      } else {
        // Return all assignments (for admin view)
        const assignments = await storage.roleAssignments || [];
        res.json(assignments);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch role assignments" });
    }
  });

  app.post("/api/role-assignments", async (req, res) => {
    try {
      const assignmentData = req.body;
      const assignment = await storage.assignRole(assignmentData);
      res.status(201).json(assignment);
    } catch (error) {
      res.status(500).json({ message: "Failed to assign role" });
    }
  });

  app.delete("/api/role-assignments", async (req, res) => {
    try {
      const { chatId, userId, roleId } = req.query;
      
      if (!chatId || !userId || !roleId) {
        return res.status(400).json({ message: "chatId, userId, and roleId are required" });
      }
      
      const assignment = await storage.removeRoleAssignment(
        chatId.toString(), 
        userId.toString(), 
        roleId.toString()
      );
      
      if (!assignment) {
        return res.status(404).json({ message: "Role assignment not found" });
      }
      
      res.json({ message: "Role assignment removed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove role assignment" });
    }
  });

  // Chats API endpoint
  app.get("/api/chats", async (req, res) => {
    try {
      const chats = await storage.getChats();
      res.json(chats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const httpServer = createServer(app);
  return httpServer;
}
