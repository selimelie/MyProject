import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Calendar,
  MessageSquare,
  CreditCard,
  Building2,
  LogOut,
  Briefcase,
  DollarSign,
  Headset,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AppSidebarProps {
  user?: {
    email: string;
    role: string;
    shop: {
      name: string;
      plan: string;
    };
  };
}

export function AppSidebar({ user }: AppSidebarProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout", {});
      
      // Clear all query cache on logout
      queryClient.clear();
      
      toast({
        title: "Logged out",
        description: "You've been successfully logged out.",
      });
      
      // Redirect to login
      window.location.href = "/login";
    } catch (error) {
      toast({
        title: "Logout failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const role = user?.role || "owner";

  // Owner navigation items
  const ownerItems = [
    { title: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { title: "Products", icon: Package, path: "/products" },
    { title: "Services", icon: Briefcase, path: "/services" },
    { title: "Orders", icon: ShoppingCart, path: "/orders" },
    { title: "Appointments", icon: Calendar, path: "/appointments" },
    { title: "AI Chat", icon: MessageSquare, path: "/chat" },
    { title: "Support Queue", icon: Headset, path: "/support" },
    { title: "Subscription", icon: CreditCard, path: "/subscription" },
  ];

  // Order Manager navigation items - can manage operations but not subscriptions
  const orderManagerItems = [
    { title: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { title: "Products", icon: Package, path: "/products" },
    { title: "Services", icon: Briefcase, path: "/services" },
    { title: "Orders", icon: ShoppingCart, path: "/orders" },
    { title: "Appointments", icon: Calendar, path: "/appointments" },
    { title: "AI Chat", icon: MessageSquare, path: "/chat" },
    { title: "Support Queue", icon: Headset, path: "/support" },
  ];

  // Accountant navigation items - financial data only
  const accountantItems = [
    { title: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { title: "Orders", icon: ShoppingCart, path: "/orders" },
    { title: "Appointments", icon: Calendar, path: "/appointments" },
  ];

  const menuItems =
    role === "order_manager"
      ? orderManagerItems
      : role === "accountant"
      ? accountantItems
      : ownerItems;

  const getPlanBadgeVariant = (plan: string) => {
    if (plan === "business") return "default";
    if (plan === "pro") return "secondary";
    return "outline";
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm text-sidebar-foreground truncate">
              {user?.shop?.name || "My Business"}
            </h2>
            <Badge
              variant="outline"
              className="mt-1 text-xs"
              data-testid={`badge-plan-${user?.shop?.plan || "starter"}`}
            >
              {(user?.shop?.plan || "starter").toUpperCase()}
            </Badge>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.path} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <Icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {user?.email?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.email || "user@example.com"}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {role.replace("_", " ")}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleLogout}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          <span>Log out</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
