import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { wagmiConfig } from "@/lib/wagmi";
import { RoleProvider } from "@/context/RoleContext";
import Landing from "./pages/Landing.tsx";
import Index from "./pages/Index.tsx";
import Manufacturer from "./pages/Manufacturer.tsx";
import Carrier from "./pages/Carrier.tsx";
import Wholesaler from "./pages/Wholesaler.tsx";
import Playground from "./pages/Playground.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: "hsl(160 84% 45%)",
          accentColorForeground: "hsl(222 47% 6%)",
          borderRadius: "medium",
          overlayBlur: "small",
        })}
      >
        <RoleProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/overview" element={<Index />} />
                <Route path="/manufacturer" element={<Manufacturer />} />
                <Route path="/carrier" element={<Carrier />} />
                <Route path="/wholesaler" element={<Wholesaler />} />
                <Route path="/playground" element={<Playground />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </RoleProvider>
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
);

export default App;
