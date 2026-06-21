# Accord — Judges' Setup Guide

> **TL;DR**: 5 minutes to a live end-to-end demo. Just fill in two values.

---

## Quick Start

```bash
cd frontend
cp .env.example .env
# Fill in NEXT_PUBLIC_GOOGLE_CLIENT_ID (see below — takes 3 minutes)
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## 1 · Google OAuth / zkLogin Setup (3 minutes)

zkLogin turns a Google account into a non-custodial Sui wallet.  
Without it the zkLogin button is visibly disabled — you can still connect a Sui wallet extension.

1. Go to **[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)**
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Add Authorized redirect URIs:
   - `http://localhost:3000/auth/callback`
5. Click **Create** — copy the **Client ID** (ends in `.apps.googleusercontent.com`)
6. Paste it in `frontend/.env`:
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com
   ```
7. Restart `npm run dev` — the zkLogin button is now active.

---

## 2 · Accord Package (already deployed)

The contract is already deployed to Sui Testnet at:
```
0x832f93729a8b1dfe9dd8067536dfa35231cf019f9401afe04a398df6d18c54cb
```

This value is pre-filled in `.env.example`. No re-deployment needed.

---

## 3 · Arca Agent (optional for demo)

The frontend gracefully falls back to local covenant parsing if the agent is offline.

```bash
cd agent
npm install
npm run start   # starts on :3001
```

---

## 4 · Live E2E Demo Flow

1. Open `http://localhost:3000` — Connect via Google (zkLogin)
2. Click **Create a Covenant**
3. Type: *"Pay $100 for a logo. 50% on draft, 50% on final"*
4. Arca structures it → click **Create & Fund Covenant**
5. As contractor: Upload a file on the covenant detail page
6. Watch Arca verify and release payment automatically

### Protocol Fee (PRD §7.2)
- Every milestone release deducts **0.5% (50 bps)** from the gross payout
- Net goes to contractor, fee goes to `protocol_treasury` set at creation
- Both amounts are emitted as on-chain events (`ProtocolFeeCollected`, `MilestoneReleased`)

### Dispute Flow (PRD §7.6)
- As the **client**, each milestone row shows a **"Raise Dispute"** button
- Clicking starts a **48-hour countdown** visible in real time
- After 48 hours, an **Escalate to Arbitration** button appears
- Disputed status is reflected on-chain via `dispute_milestone` (ClientCap required)

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Custom Walrus blob pattern vs official SDK | SDK requires per-network system object ID; HTTP API avoids setup friction for judges |
| `protocol_treasury` passed at creation | Immutable — prevents treasury address swap attacks after deployment |
| `release_milestone_payment` returns `(Coin, Coin)` | Caller (Arca PTB) must transfer both atomically in one transaction |
| `ArcaChat` extracted to component | Reusable in covenant detail page; eliminates architecture drift |
