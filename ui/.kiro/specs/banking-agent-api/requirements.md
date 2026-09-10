# Requirements Document

## Introduction

This feature covers the backend API and agent layer that powers the existing banking chat frontend. The frontend already sends `POST` requests with a `message` string and expects a `response` string back (see `src/services/api.ts` and `src/types/index.ts`). This document defines requirements for three cooperating layers:

1. **Chat_API** — the HTTP layer the frontend talks to.
2. **Agent_Orchestrator** — the layer that interprets user intent and decides whether to answer directly or invoke a Banking_Tool.
3. **Local_LLM integration** — the layer that sends prompts to a locally hosted LLM (e.g. an Ollama-compatible inference server) and returns generated text.

Frontend UI components (ChatWindow, MessageList, MessageItem, InputField) and client-side LocalStorage persistence are out of scope; they already exist and are not modified by this feature.

Because this system performs real banking operations (balance lookups, transaction history, fund transfers), requirements in this document assume an Authentication_Service exists and gate sensitive Banking_Tool operations behind it, even though the current frontend MVP does not yet implement a login flow. This is called out explicitly in Requirement 10.

## Glossary

- **Chat_API**: The HTTP service layer that exposes endpoints for the frontend chat UI to send user messages and receive Agent_Orchestrator responses.
- **Agent_Orchestrator**: The component that classifies the Intent of an incoming message, selects a Banking_Tool when appropriate, invokes the Local_LLM, and assembles the final response text.
- **Local_LLM**: A locally hosted large language model inference server, reachable over an HTTP API (e.g. an Ollama-compatible endpoint), used by the Agent_Orchestrator to generate natural language text.
- **Banking_Tool**: An invocable function with a defined input schema and output schema that performs one banking operation. This document defines three: Balance_Inquiry_Tool, Transaction_History_Tool, and Transfer_Tool.
- **Intent**: The category the Agent_Orchestrator assigns to a user message, one of: `balance_inquiry`, `transaction_history`, `transfer`, or `general_question`.
- **Session**: A server-tracked identifier that links a sequence of messages exchanged between one frontend client and the Agent_Orchestrator over time.
- **Conversation_History**: The ordered set of prior messages within a Session, supplied to the Local_LLM as context for generating a response.
- **Account**: A banking account record identified by an Account_Id and owned by an Authenticated_User.
- **Account_Id**: A unique identifier for an Account.
- **Transfer_Request**: A user-initiated request naming a source Account, a destination Account, and an amount to move between them.
- **Authenticated_User**: A user whose identity has been verified by the Authentication_Service before any Banking_Tool operation is executed on their behalf.
- **Authentication_Service**: The component responsible for verifying user identity and confirming that an Authenticated_User owns or is authorized to act on a given Account.
- **Tool_Call**: A structured request, produced by the Agent_Orchestrator or the Local_LLM, naming a Banking_Tool and its input parameters.
- **Tool_Result**: The structured output returned by a Banking_Tool after execution, consumed by the Agent_Orchestrator to compose the final response.

## Requirements

### Requirement 1: Chat Message Endpoint

**User Story:** As a frontend client, I want to send a user message to a backend endpoint and receive a bot reply, so that the existing chat UI continues to function without modification.

#### Acceptance Criteria

1. WHEN Chat_API receives a POST request to `/api/chat` with a JSON body containing a `message` string field, THE Chat_API SHALL return an HTTP 200 response with a JSON body containing a `response` string field.
2. IF Chat_API receives a POST request to `/api/chat` with a JSON body missing the `message` field or containing a non-string `message` value, THEN THE Chat_API SHALL return an HTTP 400 response with a JSON body containing an `error` string field.
3. IF Chat_API receives a request to `/api/chat` with a `message` field that is empty (0 characters) or longer than 4000 characters, THEN THE Chat_API SHALL return an HTTP 400 response with a JSON body containing an `error` string field.
4. IF Chat_API receives a POST request to `/api/chat` with a body that is not valid JSON, THEN THE Chat_API SHALL return an HTTP 400 response with a JSON body containing an `error` string field.
5. IF the Agent_Orchestrator raises an unhandled failure while processing a valid request, THEN THE Chat_API SHALL return an HTTP 500 response with a JSON body containing an `error` string field.
6. WHILE the Local_LLM is available and responsive, WHEN Chat_API receives a valid POST request to `/api/chat`, THE Chat_API SHALL transmit its HTTP response within 30 seconds of request receipt.

### Requirement 2: Session and Conversation Context

**User Story:** As a returning chat user, I want the backend to remember the recent context of my conversation, so that the agent can answer follow-up questions correctly.

#### Acceptance Criteria

1. WHEN Chat_API receives a first request from a client without a Session identifier, THE Chat_API SHALL create a new Session and return the Session identifier to the client.
2. WHEN Chat_API receives a request that includes a valid, existing Session identifier, THE Agent_Orchestrator SHALL include the Conversation_History for that Session, consisting of all prior user and agent messages in chronological order (empty if no prior messages exist), when constructing the prompt sent to the Local_LLM.
3. IF Chat_API receives a request with a Session identifier that does not correspond to a known Session, THEN THE Chat_API SHALL create a new Session and return the new Session identifier to the client.
4. THE Agent_Orchestrator SHALL limit the Conversation_History supplied to the Local_LLM to the most recent 20 messages per Session, excluding the in-flight message currently being processed; if fewer than 20 prior messages exist, THE Agent_Orchestrator SHALL supply all of them.

### Requirement 3: Intent Classification and Routing

**User Story:** As a banking chat user, I want my message to be understood and routed to the right capability, so that I get accurate answers instead of generic replies.

#### Acceptance Criteria

1. WHEN the Agent_Orchestrator processes an incoming user message, THE Agent_Orchestrator SHALL classify the message into exactly one Intent: `balance_inquiry`, `transaction_history`, `transfer`, or `general_question`; IF the message contains signals matching more than one Intent, THEN THE Agent_Orchestrator SHALL select the Intent with the highest confidence score, and IF two or more Intents have equal highest confidence scores, THEN THE Agent_Orchestrator SHALL apply the following precedence order to break the tie: `transfer`, `transaction_history`, `balance_inquiry`, `general_question`.
2. WHEN the Agent_Orchestrator classifies a message as `balance_inquiry`, THE Agent_Orchestrator SHALL invoke the Balance_Inquiry_Tool before composing a response.
3. WHEN the Agent_Orchestrator classifies a message as `transaction_history`, THE Agent_Orchestrator SHALL invoke the Transaction_History_Tool before composing a response.
4. WHEN the Agent_Orchestrator classifies a message as `transfer`, THE Agent_Orchestrator SHALL invoke the Transfer_Tool before composing a response.
5. WHEN the Agent_Orchestrator classifies a message as `general_question`, THE Agent_Orchestrator SHALL generate a response using the Local_LLM without invoking a Banking_Tool.
6. THE Agent_Orchestrator SHALL assign each Intent classification a confidence score in the range 0.0 to 1.0; IF the confidence score for the highest-scoring Intent is below 0.7, THEN THE Agent_Orchestrator SHALL classify the message as `general_question`.
7. IF an invocation of a Banking_Tool (Balance_Inquiry_Tool, Transaction_History_Tool, or Transfer_Tool) fails or the tool is unavailable, THEN THE Agent_Orchestrator SHALL preserve the conversation state and any user-provided input collected up to that point, SHALL NOT apply any partial or incomplete transaction, and SHALL return a response to the user indicating that the requested action could not be completed and inviting the user to retry.
8. WHEN the Agent_Orchestrator receives an incoming user message, THE Agent_Orchestrator SHALL complete Intent classification and routing to the applicable Banking_Tool or Local_LLM within 3 seconds of message receipt.

### Requirement 4: Balance Inquiry Tool

**User Story:** As a banking chat user, I want to ask for my account balance, so that I can check my funds without leaving the chat.

#### Acceptance Criteria

1. WHEN the Balance_Inquiry_Tool is invoked for an Authenticated_User who owns exactly one Account, or who has specified an Account_Id owned by that Authenticated_User, THE Balance_Inquiry_Tool SHALL return a Tool_Result containing the Account_Id and the current balance for that Account.
2. IF the Balance_Inquiry_Tool is invoked for an Authenticated_User who owns more than one Account and no Account_Id was specified, THEN THE Balance_Inquiry_Tool SHALL return a Tool_Result listing all Account_Id values owned by the Authenticated_User and prompting for a selection, without returning balance data.
3. IF the Balance_Inquiry_Tool is invoked for an Authenticated_User who owns no Account, THEN THE Balance_Inquiry_Tool SHALL return a Tool_Result containing an error indicating no Account is available, without returning balance data.
4. IF the Balance_Inquiry_Tool is invoked with an Account_Id not owned by the Authenticated_User, THEN THE Balance_Inquiry_Tool SHALL return a Tool_Result containing an error indicating the Account is not accessible, without returning balance data.
5. IF the Balance_Inquiry_Tool cannot retrieve the balance for a resolved Account because the underlying account data source is unavailable or the retrieval request fails, THEN THE Balance_Inquiry_Tool SHALL return a Tool_Result containing an error indicating the balance could not be retrieved, without returning balance data.
6. WHEN the Agent_Orchestrator receives a Tool_Result from the Balance_Inquiry_Tool, THE Agent_Orchestrator SHALL compose the final response using only balance data present in that Tool_Result.

### Requirement 5: Transaction History Tool

**User Story:** As a banking chat user, I want to ask about my recent transactions, so that I can review my spending in the chat.

#### Acceptance Criteria

1. WHEN the Transaction_History_Tool is invoked for an Authenticated_User with a resolvable Account and no explicit count is given, THE Transaction_History_Tool SHALL return a Tool_Result containing the 10 most recent transactions for that Account ordered by transaction date and time in descending order.
2. WHEN the user message specifies a requested transaction count between 1 and 50 inclusive, THE Transaction_History_Tool SHALL return a Tool_Result containing that requested number of transactions, ordered by transaction date and time in descending order, or fewer if fewer exist for that Account.
3. IF the Transaction_History_Tool is invoked with an Account_Id not owned by the Authenticated_User, THEN THE Transaction_History_Tool SHALL return a Tool_Result containing an error indicating the Account is not accessible.
4. IF the Transaction_History_Tool is invoked with an Account_Id that cannot be resolved to an existing Account, THEN THE Transaction_History_Tool SHALL return a Tool_Result containing an error indicating the Account could not be found.
5. IF the user message specifies a requested transaction count outside the range of 1 to 50, THEN THE Transaction_History_Tool SHALL return a Tool_Result containing an error indicating the requested count is invalid.
6. WHEN the Transaction_History_Tool is invoked for an Account with zero recorded transactions, THE Transaction_History_Tool SHALL return a Tool_Result containing an empty transaction list rather than an error.

### Requirement 6: Transfer Tool

**User Story:** As a banking chat user, I want to move money between my accounts through chat, so that I can complete transfers conversationally.

#### Acceptance Criteria

1. WHEN the Transfer_Tool is invoked with a Transfer_Request naming a source Account owned by the Authenticated_User, a valid destination Account, and a positive transfer amount, THE Transfer_Tool SHALL execute the transfer and return a Tool_Result containing the resulting status and a confirmation identifier.
2. IF the Transfer_Request source Account balance is less than the requested transfer amount, THEN THE Transfer_Tool SHALL decline the transfer, leave the source and destination Account balances unchanged, and return a Tool_Result containing an error indicating insufficient funds.
3. IF the Transfer_Request names a source Account not owned by the Authenticated_User, THEN THE Transfer_Tool SHALL decline the transfer, leave the source and destination Account balances unchanged, and return a Tool_Result containing an error indicating the Account is not accessible.
4. IF the Transfer_Request specifies a transfer amount less than or equal to zero, THEN THE Transfer_Tool SHALL decline the transfer, leave the source and destination Account balances unchanged, and return a Tool_Result containing a validation error.
5. IF the Transfer_Request names a destination Account that does not exist or cannot be resolved, THEN THE Transfer_Tool SHALL decline the transfer, leave the source Account balance unchanged, and return a Tool_Result containing an error indicating the destination Account is not valid.
6. IF the Transfer_Request names a destination Account identical to the source Account, THEN THE Transfer_Tool SHALL decline the transfer, leave the Account balance unchanged, and return a Tool_Result containing a validation error.
7. WHEN the Agent_Orchestrator classifies a message as `transfer` and any of the source Account, destination Account, or a positive numeric transfer amount cannot be determined from the message or Conversation_History, THE Agent_Orchestrator SHALL request the missing or invalid information from the user before invoking the Transfer_Tool.
8. WHEN the Transfer_Tool successfully executes a transfer, THE Agent_Orchestrator SHALL include the confirmation identifier from the Tool_Result in the response sent to the user.

### Requirement 7: General Question Handling

**User Story:** As a banking chat user, I want to ask general questions not tied to my accounts, so that I can get helpful answers from the chat.

#### Acceptance Criteria

1. WHEN the Agent_Orchestrator classifies a message as `general_question`, THE Agent_Orchestrator SHALL send the message together with the most recent 10 messages of Conversation_History from the current session to the Local_LLM and return the generated text as the response to the user.
2. IF the Local_LLM does not return a response within 10 seconds, or returns an empty or invalid response, THEN THE Agent_Orchestrator SHALL display an error message to the user indicating the assistant is temporarily unavailable and SHALL preserve the original user message in Conversation_History to allow retry.
3. IF a `general_question` message references an action defined as requiring Account access (including viewing balance, viewing transaction history, transferring funds, or modifying account settings), THEN THE Agent_Orchestrator SHALL reclassify the message and route it through the corresponding Banking_Tool instead of answering directly.
4. IF a message is reclassified as requiring Account access but no corresponding Banking_Tool exists for the requested action, THEN THE Agent_Orchestrator SHALL respond to the user with a message indicating the action is not supported, without invoking the Local_LLM.

### Requirement 8: Local LLM Integration

**User Story:** As the Agent_Orchestrator, I want a consistent way to call the local LLM, so that responses are generated reliably regardless of which model is configured.

#### Acceptance Criteria

1. THE Agent_Orchestrator SHALL send generation requests to the Local_LLM using the base URL and model name loaded from environment configuration at startup.
2. WHEN the Agent_Orchestrator sends a generation request to the Local_LLM, THE Agent_Orchestrator SHALL include the full Conversation_History and any Tool_Result data produced while processing the current message in the prompt sent to the Local_LLM.
3. IF the Local_LLM does not respond within 25 seconds of a generation request, THEN THE Agent_Orchestrator SHALL abort the request and return a Tool_Result-independent error response to the Chat_API indicating the agent is temporarily unavailable.
4. IF the Local_LLM returns a response to a generation request that is empty (zero-length) or cannot be parsed as valid text, THEN THE Agent_Orchestrator SHALL return an error response to the Chat_API indicating the agent is temporarily unavailable.
5. WHERE the Local_LLM configuration specifies streaming support, THE Chat_API SHALL return generated text to the client in incremental chunks as each chunk is produced by the Local_LLM.
6. IF the base URL or model name is missing or invalid in the environment configuration at startup, THEN THE Agent_Orchestrator SHALL fail to start and produce an error indication identifying the missing or invalid configuration value.
7. IF the connection to the Local_LLM is interrupted while streaming a response, THEN THE Chat_API SHALL terminate the stream and send an error indication to the client that the response is incomplete.

### Requirement 9: Tool Invocation Failure Handling

**User Story:** As a banking chat user, I want clear feedback when a requested banking action fails, so that I understand what happened and what to do next.

#### Acceptance Criteria

1. IF a Banking_Tool invocation returns a Tool_Result containing an error, THEN THE Agent_Orchestrator SHALL include in the response sent to the user a plain-language explanation of the failure reason that excludes internal error codes, stack traces, and system identifiers, without invoking the Local_LLM to fabricate account data.
2. IF a Banking_Tool invocation raises an unhandled exception, THEN THE Agent_Orchestrator SHALL return a response to the Chat_API indicating the requested banking action could not be completed, excluding internal exception details or stack traces, and without invoking the Local_LLM to fabricate account data.
3. IF a Banking_Tool invocation does not return a Tool_Result or raise an exception within 30 seconds of being invoked, THEN THE Agent_Orchestrator SHALL treat the invocation as failed and return a response to the Chat_API indicating the requested banking action could not be completed, without invoking the Local_LLM to fabricate account data.
4. THE Agent_Orchestrator SHALL log the Intent for every processed message; for every processed message that results in a Banking_Tool invocation attempt, THE Agent_Orchestrator SHALL additionally log the invoked Banking_Tool name and the Tool_Result status, recorded as one of: success, error, or timeout/exception.

### Requirement 10: Authentication and Authorization for Banking Operations

**User Story:** As a bank, I want every account-specific action to be tied to a verified identity, so that user financial data and funds are protected from unauthorized access.

#### Acceptance Criteria

1. WHEN Chat_API receives a request to `/api/chat` that requires an Authenticated_User context (any Intent other than `general_question`), THE Chat_API SHALL verify the request's identity credential with the Authentication_Service before the Agent_Orchestrator invokes any Banking_Tool for that request.
2. IF the Authentication_Service cannot verify the identity credential for a request requiring an Authenticated_User context, THEN THE Chat_API SHALL return an HTTP 401 response with a JSON body containing an `error` string field, and THE Agent_Orchestrator SHALL NOT invoke a Banking_Tool for that request.
3. THE Balance_Inquiry_Tool, Transaction_History_Tool, and Transfer_Tool SHALL restrict all Account data access and modification to Account_Id values owned by the Authenticated_User associated with the current request.
4. IF an Authenticated_User's request specifies an Account_Id that is not owned by that Authenticated_User, THEN THE Chat_API SHALL return an HTTP 403 response with a JSON body containing an `error` string field, and THE Balance_Inquiry_Tool, Transaction_History_Tool, or Transfer_Tool SHALL NOT perform the requested data access or modification for that Account_Id.

### Requirement 11: Configuration and Environment

**User Story:** As a developer deploying this backend, I want the API, agent, and LLM connection to be configurable, so that I can point the system at different environments without code changes.

#### Acceptance Criteria

1. THE Chat_API SHALL read its listening port from an environment variable, defaulting to port 8080 when the environment variable is not set or is empty.
2. IF the listening port environment variable is set to a value that is not an integer between 1 and 65535, THEN THE Chat_API SHALL fail to start and log an error message indicating the invalid port configuration.
3. THE Agent_Orchestrator SHALL read the Local_LLM base URL and model name from environment configuration at startup.
4. IF required environment configuration for the Local_LLM base URL is missing at startup, THEN THE Chat_API SHALL fail to start and log an error message indicating that the Local_LLM base URL is missing.
5. IF required environment configuration for the Local_LLM model name is missing at startup, THEN THE Chat_API SHALL fail to start and log an error message indicating that the Local_LLM model name is missing.
