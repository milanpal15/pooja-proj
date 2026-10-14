/**
 * The routes the WALLET service owns that the BFFs serve (phase 4).
 *
 * Wallet's internal paths mirror the monolith's `/api` paths exactly (`/api/admin/coin-packs/5` -> `/internal/wallet/admin/coin-packs/5`),
 * so `to === path`. A path that is NOT in these tables is not wallet's: it falls through to the monolith (which answers 404 for the
 * wallet/coins paths once WALLET_URL is set).
 *
 *   WALLET_ADMIN_ROUTES    operator routes the admin BFF hands to wallet AFTER the area gate (access/routes.js), which a role without
 *                          the area never gets past; wallet re-checks the permission from the signed token. Money-affecting writes keep the
 *                          roles the monolith enforces: packs and billing rules need `money:edit`, an adjustment `wallets:edit`, a wallet
 *                          search also `devotees:view` - all admin-only, because editor/viewer hold none of those edits.
 *   WALLET_DEVOTEE_ROUTES  the devotee routes the MOBILE BFF serves (its device auth edge supplies the uid as the signed `sub`).
 *   WALLET_PUBLIC_GETS     public reads both BFFs serve; `maxStaleMs` is how long a last good answer may be served if wallet is down.
 *   RAZORPAY_WEBHOOK       `POST /api/webhooks/razorpay`: streamed byte for byte (the signature is over the raw bytes) by both BFFs.
 */
const ID = '000000000000000000000001';

export const WALLET_ADMIN_ROUTES = [
  { method: 'GET', path: '/admin/wallets', to: '/admin/wallets', area: 'wallets' },
  { method: 'GET', path: '/admin/wallet-transactions', to: '/admin/wallet-transactions', area: 'wallets' },
  { method: 'POST', path: '/admin/wallet/adjust', to: '/admin/wallet/adjust', area: 'wallets' },

  { method: 'GET', path: '/admin/coin-packs', to: '/admin/coin-packs', area: 'money' },
  { method: 'POST', path: '/admin/coin-packs', to: '/admin/coin-packs', area: 'money', successStatus: 201 },
  { method: 'PUT', path: '/admin/coin-packs/:id', to: '/admin/coin-packs/:id', area: 'money', sample: `/admin/coin-packs/${ID}` },
  { method: 'DELETE', path: '/admin/coin-packs/:id', to: '/admin/coin-packs/:id', area: 'money', sample: `/admin/coin-packs/${ID}` },
  { method: 'GET', path: '/admin/coin-orders', to: '/admin/coin-orders', area: 'orders' },
  { method: 'GET', path: '/admin/coin-stats', to: '/admin/coin-stats', area: 'money' },

  { method: 'GET', path: '/admin/billing/rules', to: '/admin/billing/rules', area: 'money' },
  { method: 'PUT', path: '/admin/billing/rules', to: '/admin/billing/rules', area: 'money' },
];

export const WALLET_DEVOTEE_ROUTES = [
  { method: 'GET', path: '/wallet' },
  { method: 'GET', path: '/wallet/transactions' },
  { method: 'POST', path: '/wallet/orders' },
  { method: 'POST', path: '/wallet/orders/:orderId/verify', sample: `/wallet/orders/${ID}/verify` },
];

const HOUR = 3_600_000;
export const WALLET_PUBLIC_GETS = [{ path: '/coins/packs', maxStaleMs: HOUR }];

export const RAZORPAY_WEBHOOK = '/api/webhooks/razorpay';
