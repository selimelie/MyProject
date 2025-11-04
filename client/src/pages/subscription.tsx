import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Zap, TrendingUp, Building2, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface SubscriptionData {
  plan: string;
  status: string;
  expiryDate: string | null;
  shop: {
    name: string;
    status: string;
  };
}

const plans = [
  {
    name: "Starter",
    price: 29,
    description: "Perfect for small businesses",
    features: [
      "1 messaging platform",
      "200 AI conversations/month",
      "Basic product/service catalog",
      "Essential analytics dashboard",
      "Email support",
    ],
    icon: Zap,
  },
  {
    name: "Pro",
    price: 59,
    description: "Best for growing businesses",
    features: [
      "All platforms (WhatsApp, Instagram, Messenger)",
      "Unlimited AI conversations",
      "Advanced product/service management",
      "Complete analytics & insights",
      "Role-based team access",
      "Priority support",
    ],
    icon: TrendingUp,
    popular: true,
  },
  {
    name: "Business",
    price: 99,
    description: "Enterprise solution",
    features: [
      "Everything in Pro",
      "Custom AI agent training",
      "Multi-location support",
      "Advanced reporting & exports",
      "Dedicated account manager",
      "24/7 priority support",
    ],
    icon: Building2,
  },
];

export default function Subscription() {
  const { data: subscription, isLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscriptions/status"],
  });
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  // Handle payment success/cancel in URL (must be in useEffect to avoid render errors)
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1]);
    
    if (params.get('success') === 'true') {
      toast({
        title: "Subscription Updated!",
        description: "Your subscription has been successfully updated.",
      });
      // Clean up URL
      setLocation('/subscription');
    } else if (params.get('canceled') === 'true') {
      toast({
        title: "Payment Canceled",
        description: "Your payment was canceled. You can try again anytime.",
        variant: "destructive",
      });
      // Clean up URL
      setLocation('/subscription');
    }
  }, [location, toast, setLocation]);

  const upgradeMutation = useMutation({
    mutationFn: async (plan: string) => {
      const response = await apiRequest("POST", "/api/subscriptions/create-checkout", { plan });
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      // Redirect to Stripe checkout
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Redirect Failed",
          description: "No checkout URL received. Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Upgrade Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const currentPlan = subscription?.plan || "starter";
  const isActive = subscription?.status === "active";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Subscription</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription plan and billing
        </p>
      </div>

      {/* Current Plan Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your subscription details</CardDescription>
            </div>
            <Badge variant={isActive ? "default" : "destructive"} className="text-sm">
              {isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-8 bg-muted rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold capitalize">{currentPlan}</span>
                  <span className="text-xl text-muted-foreground">Plan</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {subscription?.shop?.name || "Your Business"}
                </p>
              </div>
              {subscription?.expiryDate && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {isActive ? "Trial ends on" : "Expired on"}:{" "}
                    </span>
                    <span className="font-medium">
                      {format(new Date(subscription.expiryDate), "PPP")}
                    </span>
                  </div>
                  {isActive && (
                    <p className="text-xs text-muted-foreground">
                      You're currently on a 14-day free trial. Upgrade anytime to continue after trial ends.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h2 className="text-xl font-semibold mb-6">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isCurrent = plan.name.toLowerCase() === currentPlan;
            return (
              <Card
                key={plan.name}
                className={`relative ${
                  plan.popular ? "border-primary shadow-lg" : ""
                } ${isCurrent ? "ring-2 ring-primary" : ""}`}
                data-testid={`card-plan-${plan.name.toLowerCase()}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge>Most Popular</Badge>
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-4 right-4">
                    <Badge variant="default">Current Plan</Badge>
                  </div>
                )}
                <CardHeader className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold font-mono">
                        ${plan.price}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <CardDescription className="mt-2">
                      {plan.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    disabled={isCurrent || upgradeMutation.isPending}
                    onClick={() => upgradeMutation.mutate(plan.name.toLowerCase())}
                    data-testid={`button-upgrade-${plan.name.toLowerCase()}`}
                  >
                    {upgradeMutation.isPending ? "Processing..." : isCurrent ? "Current Plan" : "Upgrade to " + plan.name}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
