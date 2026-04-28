import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia, optimismSepolia } from "wagmi/chains";

// Demo projectId — replace with a real WalletConnect Cloud projectId for production.
// RainbowKit still works for injected wallets (MetaMask) without it.
export const wagmiConfig = getDefaultConfig({
  appName: "ChainGuard",
  projectId: "chainguard_demo_projectid_replace_me",
  chains: [baseSepolia, optimismSepolia],
  ssr: false,
});
