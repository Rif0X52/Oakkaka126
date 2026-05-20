import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Users, Clock, Search, Eye } from "lucide-react";
import type { Chat, Message } from "@shared/schema";

export function ChatMonitor() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatFilter, setChatFilter] = useState<string>("all");

  const { data: chats = [], isLoading: isLoadingChats } = useQuery<Chat[]>({
    queryKey: ['/api/chats'],
  });

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedChat?.telegramChatId],
    enabled: !!selectedChat,
  });

  const filteredChats = chats.filter(chat => {
    const matchesSearch = 
      chat.chatTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.telegramChatId.includes(searchQuery);
    
    const matchesFilter = 
      chatFilter === "all" || 
      (chatFilter === "active" && chat.isActive) ||
      (chatFilter === "inactive" && !chat.isActive) ||
      chat.chatType === chatFilter;

    return matchesSearch && matchesFilter;
  });

  const getChatTypeBadge = (chatType: string) => {
    const variants = {
      "private": "default",
      "group": "secondary", 
      "supergroup": "outline",
      "channel": "destructive"
    } as const;

    const labels = {
      "private": "Личный",
      "group": "Группа",
      "supergroup": "Супергруппа", 
      "channel": "Канал"
    };

    return (
      <Badge variant={variants[chatType as keyof typeof variants] || "default"}>
        {labels[chatType as keyof typeof labels] || chatType}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Только что";
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days < 7) return `${days} дн назад`;
    
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (isLoadingChats) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка чатов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Поиск по названию чата или ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-chats"
          />
        </div>
        <Select value={chatFilter} onValueChange={setChatFilter}>
          <SelectTrigger className="w-48" data-testid="select-chat-filter">
            <SelectValue placeholder="Фильтр по типу" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все чаты</SelectItem>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="inactive">Неактивные</SelectItem>
            <SelectItem value="private">Личные</SelectItem>
            <SelectItem value="group">Группы</SelectItem>
            <SelectItem value="supergroup">Супергруппы</SelectItem>
            <SelectItem value="channel">Каналы</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" data-testid="badge-total-chats">
          Всего: {chats.length}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Список чатов</CardTitle>
              <CardDescription>
                {filteredChats.length} из {chats.length} чатов
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Чат</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Активность</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredChats.map((chat) => (
                    <TableRow 
                      key={chat.id}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => setSelectedChat(chat)}
                      data-testid={`row-chat-${chat.id}`}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium" data-testid={`text-chat-title-${chat.id}`}>
                            {chat.chatTitle || "Без названия"}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400" data-testid={`text-chat-id-${chat.id}`}>
                            ID: {chat.telegramChatId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getChatTypeBadge(chat.chatType)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={chat.isActive ? "default" : "secondary"} data-testid={`status-chat-${chat.id}`}>
                          {chat.isActive ? "Активен" : "Неактивен"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-400">
                          <Clock className="h-4 w-4" />
                          <span data-testid={`text-last-activity-${chat.id}`}>
                            {formatDate(chat.lastActivity)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChat(chat);
                          }}
                          data-testid={`button-view-chat-${chat.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredChats.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {searchQuery ? "Чаты не найдены" : "Нет чатов"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          {selectedChat ? (
            <Card>
              <CardHeader>
                <CardTitle>Детали чата</CardTitle>
                <CardDescription>
                  Информация о выбранном чате
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2" data-testid="text-selected-chat-title">
                    {selectedChat.chatTitle || "Без названия"}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">ID чата:</span>
                      <span className="font-mono" data-testid="text-selected-chat-id">
                        {selectedChat.telegramChatId}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Тип:</span>
                      <span data-testid="text-selected-chat-type">
                        {getChatTypeBadge(selectedChat.chatType)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Статус:</span>
                      <Badge variant={selectedChat.isActive ? "default" : "secondary"} data-testid="text-selected-chat-status">
                        {selectedChat.isActive ? "Активен" : "Неактивен"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Последняя активность:</span>
                      <span data-testid="text-selected-chat-activity">
                        {formatDate(selectedChat.lastActivity)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Создан:</span>
                      <span data-testid="text-selected-chat-created">
                        {formatDate(selectedChat.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

                {isLoadingMessages ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Загрузка сообщений...</p>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-medium mb-2">Последние сообщения</h4>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {messages.slice(-10).map((message) => (
                        <div 
                          key={message.id} 
                          className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm"
                          data-testid={`message-${message.id}`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-xs text-gray-600 dark:text-gray-400">
                              {message.userName || "Неизвестно"}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDate(message.createdAt)}
                            </span>
                          </div>
                          <p className="text-gray-800 dark:text-gray-200">
                            {message.messageText || `[${message.messageType}]`}
                          </p>
                        </div>
                      ))}
                      
                      {messages.length === 0 && (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                          Нет сообщений
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <Button 
                  className="w-full" 
                  onClick={() => {
                    // TODO: Open message dialog for this chat
                    console.log("Open message dialog for chat:", selectedChat.telegramChatId);
                  }}
                  data-testid="button-message-chat"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Отправить сообщение в чат
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center p-8">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Выберите чат для просмотра деталей
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}