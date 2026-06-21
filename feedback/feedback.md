# Accord Project Feedback & Suggestions

This document compiles technical and user experience (UX) feedback identified during the implementation, testing, and deployment of the Accord platform.

---

## 🔍 1. Arca Verification & Notification UX

### The Issue
- When the Arca AI agent returns a verdict like `REVIEW` or `FAIL`, the frontend states: **"Arca verdict: REVIEW. Check notifications."**
- However, there is currently **no dedicated notifications page or panel** in the frontend application. The verdict can only be viewed in the purple `arcaStatus` banner on the Covenant Detail page (`/covenant/[id]`).

### Recommendations
1. **Dedicated Notification Center**: Add a notification bell icon in the main Navigation Bar that lists recent contract updates, agent decisions, and dispute alerts.
2. **Expose Detailed Agent Feedback**:
   - The Arca verifier engine produces a detailed markdown `specific_feedback` string explaining exactly what matched or failed during verification.
   - This detailed feedback should be displayed directly in the UI under the milestone details, rather than just changing the status badge. This will help contractors immediately understand what changes are needed to pass verification.

---

## 🛠️ 2. Frontend Tech Stack & Vercel Deployment

### The Issue
- When deploying the frontend to Vercel, Next.js static site generation (SSG) fails because of `@mysten/dapp-kit`'s dependency on browser-only globals (like `window` and `localStorage`).
- This causes build-time crashes when pages are statically pre-rendered.

### Current Workaround
- Added `export const dynamic = 'force-dynamic'` to Next.js page files to bypass static optimization.

### Recommendations
- Replace the force-dynamic workaround with client-side dynamic imports for any components importing or using dapp-kit hooks/providers:
  ```tsx
  import dynamic from 'next/dynamic';
  const WalletProviderWrapper = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
  ```
- This allows pages to still benefit from static/incremental regeneration where applicable.

---

## 📈 3. Developer & Demo Experience

- **Mock Verification for Testing**: During demos or local development, it is helpful to have a "Mock Agent Success" switch or allow the uploading of a simple `.txt` file with text that matches the milestone description to trigger a quick `PASS`.
- **Gas Fee Estimates**: Provide users with clear warnings about Sui gas fees before executing contract creation or proof certificate minting.
