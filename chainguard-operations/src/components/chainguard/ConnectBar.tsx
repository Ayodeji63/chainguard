import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ChevronDown, LogOut, UserCog } from "lucide-react";
import { useRole, ROLES, type Role } from "@/context/RoleContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useNavigate } from "react-router-dom";

const roleAccentDot: Record<Role, string> = {
  manufacturer: "bg-primary",
  carrier: "bg-accent",
  wholesaler: "bg-warning",
};

export const ConnectBar = () => {
  const { isConnected } = useAccount();
  const { role, setRole } = useRole();
  const navigate = useNavigate();

  const currentRole = ROLES.find((r) => r.id === role);

  const switchRole = (r: Role) => {
    setRole(r);
    navigate(`/${r}`);
  };

  return (
    <div className="flex items-center gap-2">
      {isConnected && (
        <DropdownMenu>
          <DropdownMenuTrigger className="glass flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs font-semibold transition-colors hover:bg-surface-2/80">
            <span className={`h-2 w-2 rounded-full ${currentRole ? roleAccentDot[currentRole.id] : "bg-muted-foreground"}`} />
            <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">
              {currentRole ? currentRole.label : "Choose role"}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Switch role
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ROLES.map((r) => (
              <DropdownMenuItem key={r.id} onClick={() => switchRole(r.id)} className="cursor-pointer">
                <span className={`mr-2 h-2 w-2 rounded-full ${roleAccentDot[r.id]}`} />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">{r.label}</span>
                  <span className="text-[10px] text-muted-foreground">{r.tagline}</span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/">
                <LogOut className="mr-2 h-3.5 w-3.5" />
                <span className="text-xs">Back to overview</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ConnectButton
        showBalance={false}
        accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
        chainStatus={{ smallScreen: "icon", largeScreen: "icon" }}
      />
    </div>
  );
};
