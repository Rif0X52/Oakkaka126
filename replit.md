# Telegram Bot Project

## Overview
Telegram bot for creating a dynamic social ecosystem with clan system, user activity monetization, and interactive reward mechanics.

## Technologies
- TypeScript
- Telegram Bot API
- JSON file storage
- Extended clan interaction system
- Flexible reward and penalty mechanism
- Administrative notification system

## Recent Changes (May 15, 2026)

### Top Commands
- **Group Chat Top**: `\u0442\u043e\u043f` \u2014 top-100 by hamster balance in current chat; `\u0442\u043e\u043f \u0430\u0440\u043c\u0438\u0438` \u2014 top-100 by army in current chat
- **Private Chat Global Top**: `\u0442\u043e\u043f` \u2014 global top-100 by hamsters; `\u0442\u043e\u043f \u0430\u0440\u043c\u0438\u0438` \u2014 global top-100 by army

### Reaction Advertising System (Full Implementation)
- **Advertiser flow**: \ud83d\udce2 \u0420\u0435\u043a\u043b\u0430\u043c\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u2192 \u2728 \u0420\u0435\u0430\u043a\u0446\u0438\u0438 \u2192 choose type (\ud83d\udc4d Positive / \ud83d\uddbc Custom photo) \u2192 set price (500-2000) \u2192 set count \u2192 funds reserved immediately
- **Performer flow**: \ud83d\udcb0 \u0417\u0430\u0440\u0430\u0431\u0430\u0442\u043e\u043a \u2192 \u2728 \u0420\u0435\u0430\u043a\u0446\u0438\u0438 \u2192 choose type \u2192 sorted by price (highest first), 8 per page with pagination \u2192 submit screenshot proof
- **Review flow**: Advertiser gets photo with \u2705/\u274c buttons; auto-approve after 24h if no response
- **Appeal system**: Performer can appeal rejection \u2192 admin decides \u2192 advertiser charged even if balance is low (can go negative)
- **Anti-fraud**: Same user cannot complete the same task twice
- **Funds reserved**: Full amount deducted from advertiser balance on task creation; charged per approved submission

### Promo Code System
- **Promo code #hamyafka**:
  - 5000 hamsters reward for using promo code
  - Subscription check required: user must be subscribed to @hamyafka_HOBOCTN channel
  - One-time claim per user (tracked via `claimedPromo` field in MongoDB)
  - Works in both private chats and group chats

### Extended Hamster Transfer System
- **Transfer by Nickname**: `х Nickname 100` 
- **Transfer by Telegram ID**: `х 7708189417 100`
- Existing reply-to-message transfer still works
- All transfers check sender balance, minimum 10 hamsters, and notify both parties

### MongoDB Migration (May 2026)
- All user data migrated from JSON file storage to MongoDB cloud database
- 112 users preserved with balances intact
- Improved data persistence and reliability

## Recent Changes (August 21, 2025)

### Custom Role System Implementation
- **Complete Role Management System**:
  - Custom roles with configurable permissions (mute, ban, manage_ads)
  - Inline button interface for role configuration via @BPMclanWR_bot
  - Simplified permission system focusing on essential moderation commands
  - Role assignment system with "х назначить [роль] @пользователь" command
  
- **Permission Integration**:
  - All moderation commands now check both traditional moderator rights AND custom role permissions
  - Mute commands work with both built-in moderators and users with "mute" permission
  - Ban commands work with chat owners and users with "ban" permission 
  - Ad management commands work with owners and users with "manage_ads" permission
  
- **Interactive Role Configuration**:
  - Fixed callback query handling for smooth button interactions
  - Real-time feedback when toggling permissions (✅/❌ status display)
  - Proper integration with Telegram Bot API for permission management

### Moderation System Updates
- **Mute Function Enhanced**: 
  - Now automatically deletes messages from muted users
  - Continues restricting user permissions during mute period
  - Automatically unmutes users when time expires
  
- **Ban System Restricted**:
  - Only chat owners can now use ban/unban commands
  - Changed from moderator rights to owner-only access
  
- **New Unmute Commands Added**:
  - `х снять мут` - Remove mute from user
  - `х размут` - Remove mute from user  
  - Both commands work identically and can be used by moderators/admins
  
- **Enhanced Unmute Function**:
  - Improved permission restoration with multiple fallback methods
  - Method 1: Promote user to restore full member rights
  - Method 2: Ban/unban reset to clear restriction status
  - Method 3: Restrict with all permissions enabled as fallback
  - Ensures mute restrictions are fully removed

- **Unban Command Variants**:
  - Added support for both `х розбан` and `х разбан` commands
  - Both variants work identically for user convenience
  
- **Updated Help System**:
  - Added new unmute commands to help text
  - Clarified that ban/unban are owner-only
  - Updated descriptions to reflect mute behavior changes
  - Added both unban command variants

### API Compatibility
- Fixed `restrictChatMember` calls to use new Telegram Bot API format
- All permission restrictions now use the `permissions` object structure
- Enhanced permission restoration for better reliability

## User Preferences
- Language: Russian
- Simple, everyday language preferred (non-technical)
- Focus on functionality and user experience

## Project Architecture
- Main bot logic in `server/bot.ts`
- Storage interface in `server/storage.ts`
- Command handling through text pattern matching
- Mute system with automatic cleanup and permission management
- Admin/owner permission hierarchy for moderation commands

## Key Features
- Clan system with bonuses and management
- Roulette gambling system  
- Task/advertising system
- Moderation tools (mute, ban, admin management)
- Anti-spam protection
- User balance and transfer system