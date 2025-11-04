import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, TrendingUp, Building2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const plans = [
  {
    name: "Starter",
    price: 29,
    description: "Perfect for small businesses starting with AI automation",
    features: [
      "1 messaging platform",
      "200 AI conversations/month",
      "Basic product/service catalog",
      "Essential analytics dashboard",
      "Email support",
    ],
    icon: Zap,
    popular: false,
  },
  {
    name: "Pro",
    price: 59,
    description: "Best for growing businesses scaling customer engagement",
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
    description: "Enterprise solution with advanced features",
    features: [
      "Everything in Pro",
      "Custom AI agent training",
      "Multi-location support",
      "Advanced reporting & exports",
      "Dedicated account manager",
      "24/7 priority support",
    ],
    icon: Building2,
    popular: false,
  },
];

export default function Pricing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSelectPlan = async (planName: string) => {
    setLoadingPlan(planName.toLowerCase());
    try {
      const response = await apiRequest("POST", "/api/subscriptions/create-checkout", {
        plan: planName.toLowerCase(),
      });
      
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to create checkout session");
      }

      // For MVP, we'll just activate the plan directly
      toast({
        title: "Plan activated!",
        description: `Your ${planName} plan is now active.`,
      });

      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Checkout failed",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Choose your plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Select the perfect plan for your business. All plans include a 14-day free trial.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.name}
                className={`relative flex flex-col ${
                  plan.popular ? "border-primary shadow-lg" : ""
                }`}
                data-testid={`card-plan-${plan.name.toLowerCase()}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="px-4 py-1">Most Popular</Badge>
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
                      <span className="text-4xl font-bold text-foreground font-mono">
                        ${plan.price}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <CardDescription className="mt-2">
                      {plan.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => handleSelectPlan(plan.name)}
                    disabled={loadingPlan !== null}
                    data-testid={`button-select-${plan.name.toLowerCase()}`}
                  >
                    {loadingPlan === plan.name.toLowerCase()
                      ? "Processing..."
                      : "Get started"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              onClick={() => setLocation("/login")}
              className="text-primary hover:underline font-medium"
              data-testid="link-login"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
