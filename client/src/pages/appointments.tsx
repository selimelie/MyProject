import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon } from "lucide-react";
import type { Appointment } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";

export default function Appointments() {
  const { data: appointments, isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "confirmed":
        return "secondary";
      case "pending":
        return "outline";
      case "cancelled":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getPlatformBadge = (platform: string) => {
    const colors: Record<string, string> = {
      whatsapp: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      instagram: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
      messenger: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      chat: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    };
    return colors[platform] || "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Appointments</h1>
        <p className="text-muted-foreground mt-1">
          Manage customer appointments and bookings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : appointments && appointments.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((appointment) => (
                    <TableRow key={appointment.id} data-testid={`row-appointment-${appointment.id}`}>
                      <TableCell className="font-medium font-mono">
                        #{appointment.id}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{appointment.customerName}</div>
                          {appointment.customerPhone && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {appointment.customerPhone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {appointment.serviceName}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">
                            {format(new Date(appointment.date), "PPP")}
                          </div>
                          <div className="text-muted-foreground">
                            {format(new Date(appointment.date), "p")}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {appointment.duration} min
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        ${parseFloat(appointment.price.toString()).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getPlatformBadge(appointment.platform)} capitalize`}>
                          {appointment.platform}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(appointment.status)} className="capitalize">
                          {appointment.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-16">
              <CalendarIcon className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No appointments yet</h3>
              <p className="text-muted-foreground">
                Appointments booked through your AI agent will appear here
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
