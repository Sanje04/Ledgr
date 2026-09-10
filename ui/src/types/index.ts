export type Sender = "user" | "bot";

export interface Message {
  id: string;
  sender: Sender;
  message: string;
  timestamp: string;
}

export type ChatHistory = Message[];

export interface ApiRequest {
  message: string;
}

export interface ApiResponse {
  response: string;
}

export interface ApiError {
  error: string;
}
