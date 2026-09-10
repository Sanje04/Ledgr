## Role

You are an expert UI developer building a simple chatbot interface which reads user prompts and connects to a backend API.

## Frameworks & Stack

- **Frontend**: React 18+ (latest stable) with **TypeScript**
- **Build Tool**: Vite
- **Node.js**: Any recent stable version (20+)
- **Language**: TypeScript (strict mode recommended)
- **Styling**: Plain HTML and CSS (no external UI library)
- **Storage**: LocalStorage (for chat history persistence)

---

## Project Overview

Build a **frontend-only** React chatbot application with:
- A chat interface (WhatsApp/Slack style layout)
- User input field for text prompts
- Display of chat messages (user and bot)
- Persistent chat history using browser LocalStorage
- Error handling with simple error messages
- No authentication required for MVP

---

## Project Structure

```
ag-ai-ui/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── ChatWindow.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageItem.tsx
│   │   └── InputField.tsx
│   ├── services/
│   │   └── api.ts (handle API calls to backend)
│   ├── utils/
│   │   └── storage.ts (LocalStorage utilities for chat history)
│   ├── types/
│   │   └── index.ts (TypeScript interfaces and types)
│   ├── styles/
│   │   ├── index.css (global styles)
│   │   ├── ChatWindow.css
│   │   ├── MessageList.css
│   │   ├── MessageItem.css
│   │   └── InputField.css
│   ├── App.tsx
│   ├── main.tsx
│   └── App.css
├── tsconfig.json
├── vite.config.ts
├── package.json
└── README.md
```

---

## Detailed Requirements

### 1. **Main Layout (ChatWindow Component)**
- Full-screen container with flexbox layout
- Header section (title: "AI Chatbot")
- Message list area (scrollable, auto-scroll to bottom on new messages)
- Input field area at the bottom
- Responsive design (works on desktop, tablet, mobile)

### 2. **Message Display (MessageList & MessageItem Components)**
- Display all messages in chronological order
- **User messages**: Aligned to right, light gray background
- **Bot messages**: Aligned to left, darker background
- Show timestamps (optional but nice to have)
- Auto-scroll to latest message when new message arrives
- Show "Loading..." indicator while waiting for bot response

### 3. **Input Field Component**
- Text input with placeholder: "Type your message..."
- Send button (can be icon or text "Send")
- Button disabled while waiting for API response
- Clear input field after sending message
- Support Enter key to send (Shift+Enter for new line if needed)

### 4. **Chat History (LocalStorage)**
- Save all conversations to browser LocalStorage under key: `chatHistory`
- Load chat history on app startup
- Persist each new message immediately
- Button or feature to clear chat history (optional, can skip for MVP)
- TypeScript interface for message data:
  ```typescript
  interface Message {
    id: string;
    sender: "user" | "bot";
    message: string;
    timestamp: string;
  }
  
  type ChatHistory = Message[];
  ```
- LocalStorage data format:
  ```json
  [
    { "id": "uuid-or-timestamp", "sender": "user", "message": "Hello", "timestamp": "2026-09-03T10:30:00Z" },
    { "id": "uuid-or-timestamp", "sender": "bot", "message": "Hi there!", "timestamp": "2026-09-03T10:30:02Z" }
  ]
  ```

### 5. **API Integration (api.ts Service)**
- Create async function `sendMessageToAPI(message: string): Promise<string>` that:
  - Takes user message as input (TypeScript string type)
  - Makes POST request to backend (endpoint to be provided later)
  - Returns bot response (Promise<string>)
  - Handles errors gracefully
- **TypeScript Interfaces**:
  ```typescript
  interface ApiRequest {
    message: string;
  }
  
  interface ApiResponse {
    response: string;
  }
  
  interface ApiError {
    error: string;
  }
  ```
- **Error Handling**:
  - Catch network errors (with proper TypeScript error typing)
  - Catch API response errors
  - Display error message in chat: "Error: Unable to get response. Please try again."
  - Allow user to retry sending the message
- **Request Format** (flexible, will adapt when API spec is available):
  ```typescript
  POST /api/chat
  Content-Type: application/json
  
  { "message": "user's text" }
  ```
- **Expected Response**:
  ```typescript
  { "response": "bot's reply text" }
  ```

### 6. **State Management**
- Use React hooks (useState, useEffect) with TypeScript
- TypeScript type definitions for state:
  ```typescript
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  ```
- State variables:
  - `messages` - array of Message objects
  - `inputValue` - current text in input field (string)
  - `isLoading` - boolean for API call in progress
  - `error` - error message if any (string or null)

### 7. **User Flow**
1. User opens the app → loads saved chat history from LocalStorage
2. User types message → input field updates
3. User clicks Send or presses Enter → message added to chat, sent to API, input cleared
4. While waiting for response → show "Loading..." indicator, disable Send button
5. API responds → bot message added to chat, both messages saved to LocalStorage
6. If API errors → show error message, allow retry
7. On page refresh → all previous messages restored from LocalStorage

---

## 8. **TypeScript Configuration**

- **tsconfig.json settings** (recommended):
  - `strict: true` (enable all strict type checks)
  - `jsx: "react-jsx"` (for React 18+)
  - `target: "ES2020"` (modern browser support)
  - `module: "ESNext"` (modern module syntax)
  - `moduleResolution: "bundler"` (for Vite)
  - `resolveJsonModule: true` (for JSON imports if needed)
  
- **Code standards**:
  - Use explicit type annotations for function parameters and return types
  - Create reusable types in `src/types/index.ts`
  - Avoid using `any` type - use proper TypeScript typing
  - Use interfaces for component props (e.g., `interface ChatWindowProps { ... }`)
  - Export types from components for external usage

---

## Features to Implement

### Must Have (MVP)
- ✅ Chat interface layout
- ✅ Send and receive messages
- ✅ Display messages in order
- ✅ Basic API integration (POST endpoint)
- ✅ LocalStorage persistence
- ✅ Simple error messages
- ✅ Loading indicator during API call
- ✅ TypeScript strict type checking

### Nice to Have (Future)
- Clear chat history button
- Message copy to clipboard
- Dark/Light mode
- Timestamps on messages
- Typing indicators

---

## Development Steps

1. **Initialize project** with Vite + React
2. **Create folder structure** as specified above
3. **Build ChatWindow component** (main container)
4. **Build MessageList component** (display chat messages)
5. **Build MessageItem component** (individual message styling)
6. **Build InputField component** (input + send button)
7. **Create storage.js utility** (LocalStorage helpers)
8. **Create api.js service** (API call function)
9. **Integrate all components** in App.jsx
10. **Add CSS styling** (make it look clean and professional)
11. **Test chat flow** locally with mock API
12. **Connect to real backend** when API endpoint is ready

---

## Important Notes

- **TypeScript required** - Use strict mode, proper typing throughout the project
- **No authentication needed** for this MVP
- **Backend API endpoint** to be provided later (I'll integrate it when ready)
- **LocalStorage** will handle chat history for now (no backend persistence)
- **Plain CSS only** - no frameworks like Tailwind or Material-UI
- **Responsive design** - should work on mobile and desktop
- **Error handling** - just display simple error messages, no complex retry logic
- **Type safety** - Avoid `any` types, use explicit interfaces and types

---

## TODO
- ✅ Clarify requirements (DONE)
- ⏳ **Write clear instructions** (THIS DOCUMENT)
- ⏳ Get approval to proceed with development
- ⏳ Build the frontend app
- ⏳ Connect to backend API (when endpoint is ready)