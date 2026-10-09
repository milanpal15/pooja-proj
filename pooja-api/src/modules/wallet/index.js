export * as walletService from './wallet.service.js';
export { Wallet, WalletTxn } from './wallet.model.js';
import { walletRouters } from './wallet.routes.js';
export { walletRouters };

export const routers = (deps) => walletRouters(deps);
export const seed = async () => {};
