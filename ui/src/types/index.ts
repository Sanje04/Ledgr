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

export type AccountType = "checking" | "savings" | "credit_card";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  current_balance: number;
}

export interface Transaction {
  id: string;
  account_id: string;
  account_name: string;
  account_type: AccountType;
  date: string;
  amount: number;
  merchant: string;
  description: string;
  category: string;
  running_balance: number;
}

export interface TransactionsResponse {
  accounts: Account[];
  transactions: Transaction[];
}

export interface ImportResult {
  imported_count: number;
  accounts: Account[];
}
