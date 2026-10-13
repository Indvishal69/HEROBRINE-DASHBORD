# Minecraft Nexus AI — Security & Safety Model

Minecraft Nexus AI adheres to a multi-layered security model protecting API keys, server infrastructure, and in-game safety.

---

## 1. Cryptography & Key Management

### 1.1 AES-256-GCM Encryption at Rest
All API keys stored in the SQLite database (`nexus.db`) are encrypted at rest using **AES-256-GCM** (Galois/Counter Mode), providing both confidentiality and cryptographic integrity.

- **Master Key Specification**: A 32-byte (256-bit) cryptographically secure key passed via `NEXUS_MASTER_KEY` environment variable.
- If not provided in the environment, a persistent master key is generated and stored with restricted filesystem permissions at `data/.master.key`.
- **Initialization Vector**: Each encrypted record uses a unique, cryptographically random 12-byte IV (`crypto.randomBytes(12)`).
- **Authentication Tag**: A 16-byte GCM authentication tag verifies the ciphertext has not been tampered with before decryption.

### 1.2 Zero Credential Leakage Policy
- API credentials are **never exposed** in plaintext over the REST API or Socket.IO telemetry.
- The UI only receives redacted masked keys (e.g. `gsk_AbCd...wxyz`).
- System logs sanitize and strip any API key strings prior to console or file writes.

---

## 2. In-Game Prompt Injection Defense

Player chat in Minecraft represents untrusted user input. Untrusted chat messages are processed through a hardened defense pipeline:

1. **Input Normalization & Length Capping**: Chat messages are truncated to safe bounds (max 200 characters) and stripped of non-printable control characters.
2. **Instruction Isolation**: Player inputs are enclosed in strict XML delimiters (`<player_message>...</player_message>`) with explicit system rules commanding the LLM to ignore instructions attempting to override core system rules.
3. **Role-Based Authorization (RBAC)**:
   - **Admin**: Can invoke any task, modify landmarks, stop the bot, and trigger construction.
   - **Trusted**: Can assign mining, farming, and following tasks.
   - **Visitor**: Can query bot status and request following; cannot trigger resource-depleting tasks.
   - **Blocked**: All chat messages from blocked players are dropped immediately without consuming AI tokens.

---

## 3. Web Dashboard Security

- **Session Authentication**: Protected with a configurable `DASHBOARD_PASSWORD`.
- **Audit Logging**: Every sensitive action (manual override, blueprint modification, task cancellation, permission change) is logged with a timestamp, action type, and caller metadata in the SQLite audit ledger.
- **Failover Protection**: The AI pool includes a circuit breaker preventing API credit drain during downstream LLM provider outages.
