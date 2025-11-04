import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { MessageCircle, Clock, User, Send, Play, X } from "lucide-react";
import type { Conversation, Message } from "@shared/schema";
import { useWebSocket } from "@/hooks/use-websocket";

export default function SupportQueue() {
  const { toast } = useToast();
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const [messageContent, setMessageContent] = useState("");

  // Connect to WebSocket for real-time updates
  const { isConnected, lastMessage } = useWebSocket();

  // Fetch paused conversations (support queue)
  const { data: queue = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/support/queue"],
  });

  // Listen for WebSocket events and invalidate queries for real-time updates
  useEffect(() => {
    if (!lastMessage) return;

    const event = lastMessage;

    // Refresh support queue on new messages or when conversations are paused/resumed
    if (event.type === "MESSAGE_RECEIVED") {
      queryClient.invalidateQueries({ queryKey: ["/api/support/queue"] });
      
      // If the message is for the currently selected conversation, refresh messages
      if (event.data?.conversationId === selectedConversation) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/conversations", selectedConversation, "messages"] 
        });
      }
    }
  }, [lastMessage, selectedConversation]);

  // Fetch messages for selected conversation
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversation, "messages"],
    enabled: !!selectedConversation,
  });

  // Resume conversation mutation
  const resumeMutation = useMutation({
    mutationFn: async (conversationId: number) => {
      return apiRequest("POST", `/api/support/${conversationId}/resume`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setSelectedConversation(null);
      toast({
        title: "Conversation Resumed",
        description: "The AI assistant will now handle this conversation.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: number; content: string }) => {
      return apiRequest("POST", `/api/support/${conversationId}/send-message`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation, "messages"] });
      setMessageContent("");
      toast({
        title: "Message Sent",
        description: "Your response has been sent to the customer.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!selectedConversation || !messageContent.trim()) return;
    sendMessageMutation.mutate({
      conversationId: selectedConversation,
      content: messageContent,
    });
  };

  const selectedConv = queue.find((c) => c.id === selectedConversation);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading support queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Support Queue</h1>
        <p className="text-muted-foreground mt-2">
          Handle customer conversations that require human assistance
        </p>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
        {/* Queue List */}
        <Card className="col-span-4 flex flex-col">
          <CardHeader className="space-y-0 pb-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Waiting Customers</CardTitle>
              <Badge variant="secondary" data-testid="text-queue-count">
                {queue.length}
              </Badge>
            </div>
            <CardDescription>
              Conversations paused for human support
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                  <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No customers waiting for support
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {queue.map((conversation) => (
                    <button
                      key={conversation.id}
                      onClick={() => setSelectedConversation(conversation.id)}
                      className={`w-full text-left p-4 hover-elevate transition-colors ${
                        selectedConversation === conversation.id
                          ? "bg-accent"
                          : ""
                      }`}
                      data-testid={`button-select-conversation-${conversation.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {conversation.customerName || conversation.customerId}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {conversation.platform}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          {new Date(conversation.lastMessageAt).toLocaleString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Conversation View */}
        <Card className="col-span-8 flex flex-col">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Select a conversation to view and respond</p>
              </div>
            </div>
          ) : (
            <>
              <CardHeader className="space-y-0 pb-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {selectedConv.customerName || selectedConv.customerId}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Platform: {selectedConv.platform} • Last message:{" "}
                      {new Date(selectedConv.lastMessageAt).toLocaleString()}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => resumeMutation.mutate(selectedConv.id)}
                      disabled={resumeMutation.isPending}
                      variant="outline"
                      size="sm"
                      data-testid="button-resume-conversation"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Resume AI
                    </Button>
                    <Button
                      onClick={() => setSelectedConversation(null)}
                      variant="ghost"
                      size="sm"
                      data-testid="button-close-conversation"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="flex-1 flex flex-col gap-4 p-4 overflow-hidden">
                {/* Messages */}
                <ScrollArea className="flex-1">
                  <div className="space-y-4 pr-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.role === "user" ? "justify-start" : "justify-end"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            message.role === "user"
                              ? "bg-muted"
                              : "bg-primary text-primary-foreground"
                          }`}
                          data-testid={`message-${message.id}`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(message.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="flex gap-2">
                  <Textarea
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder="Type your message to the customer..."
                    className="min-h-[80px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    data-testid="input-message"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!messageContent.trim() || sendMessageMutation.isPending}
                    className="self-end"
                    data-testid="button-send-message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
