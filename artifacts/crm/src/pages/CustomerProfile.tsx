import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetAdminCustomer, useListAdminBookings } from "@workspace/api-client-react";
import { formatBookingAmount, formatDateTime, formatDate, cn } from "@/lib/utils";
import BookingDetail from "./BookingDetail";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  User,
  Mail,
  Phone,
  Calendar,
  ChevronLeft,
  FileText,
} from "lucide-react";

const BOOKING_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CONFIRMED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  DELIVERED: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  RETURNED: "bg-green-500/10 text-green-500 border-green-500/20",
  CANCELED: "bg-red-500/10 text-red-500 border-red-500/20",
  NO_SHOW: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  UNPAID: "bg-red-500/10 text-red-500 border-red-500/20",
  HALF: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  PAID: "bg-green-500/10 text-green-500 border-green-500/20",
  PREPAID: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  REFUNDED: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

export default function CustomerProfile() {
  const params = useParams<{ id: string }>();
  const customerId = parseInt(params.id ?? "0", 10);
  const queryClient = useQueryClient();
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);

  const { data: customer, isLoading: customerLoading } = useGetAdminCustomer(customerId);

  const { data: bookingsData, isLoading: bookingsLoading } = useListAdminBookings({
    customerId,
    limit: 200,
    page: 1,
  });

  const bookings = (bookingsData as any)?.data ?? [];
  const displayName = customer?.fullName || customer?.email || customer?.phone || `Customer #${customerId}`;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">

      {/* ─── Back link + header ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <Link href="/customers">
          <Button variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Customers
          </Button>
        </Link>

        <div className="flex items-center gap-3 mt-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            {customerLoading ? (
              <Skeleton className="h-7 w-48" />
            ) : (
              <h1 className="text-2xl font-bold font-display tracking-tight leading-tight">
                {displayName}
              </h1>
            )}
            <p className="text-sm text-muted-foreground">Customer profile</p>
          </div>
        </div>
      </div>

      {/* ─── Customer info card ───────────────────────────────────────────── */}
      <Card className="p-5">
        {customerLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-40" />
          </div>
        ) : customer ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {customer.fullName && (
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium">{customer.fullName}</span>
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{customer.email}</span>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{customer.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Customer since {formatDate(customer.createdAt)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Customer not found.</p>
        )}
      </Card>

      {/* ─── Booking history ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Booking History</h2>
          {!bookingsLoading && (
            <Badge variant="secondary" className="ml-1">
              {bookings.length}
            </Badge>
          )}
        </div>

        <Card className="overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Booking</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Vehicle</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Pickup</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Return</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Payment</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookingsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                      No bookings found for this customer.
                    </TableCell>
                  </TableRow>
                ) : (
                  bookings.map((b: any) => {
                    const vehicle = b.vehicle
                      ? `${b.vehicle.vehicleModel?.brand?.name ?? ""} ${b.vehicle.vehicleModel?.name ?? ""}`.trim()
                      : b.vehicleModel
                        ? `${b.vehicleModel.brand?.name ?? ""} ${b.vehicleModel.name ?? ""}`.trim()
                        : "—";
                    const plate = b.vehicle?.licensePlate;
                    return (
                      <TableRow
                        key={b.id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setDetailBookingId(b.id)}
                      >
                        <TableCell className="font-mono text-sm font-medium text-primary">
                          #{b.id}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{vehicle || "—"}</div>
                          {plate && (
                            <div className="text-xs font-bold tracking-wider text-primary/70 bg-primary/5 border border-primary/10 rounded px-1 py-0.5 inline-block mt-0.5">
                              {plate}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDateTime(b.pickupDatetime)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDateTime(b.dropoffDatetime)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              BOOKING_STATUS_COLORS[b.status] ?? "bg-gray-500/10 text-gray-500"
                            )}
                          >
                            {b.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              PAYMENT_STATUS_COLORS[b.paymentStatus] ?? "bg-gray-500/10 text-gray-500"
                            )}
                          >
                            {b.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatBookingAmount(b.totalAmount, b.currency)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile list */}
          <div className="md:hidden divide-y divide-border/50">
            {bookingsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 flex flex-col gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))
            ) : bookings.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                No bookings found for this customer.
              </div>
            ) : (
              bookings.map((b: any) => {
                const vehicle = b.vehicle
                  ? `${b.vehicle.vehicleModel?.brand?.name ?? ""} ${b.vehicle.vehicleModel?.name ?? ""}`.trim()
                  : b.vehicleModel
                    ? `${b.vehicleModel.brand?.name ?? ""} ${b.vehicleModel.name ?? ""}`.trim()
                    : "—";
                const plate = b.vehicle?.licensePlate;
                return (
                  <div
                    key={b.id}
                    className="p-4 cursor-pointer hover:bg-muted/40 transition-colors active:bg-muted/60"
                    onClick={() => setDetailBookingId(b.id)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-mono text-sm font-bold text-primary">#{b.id}</span>
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] font-bold uppercase tracking-wider",
                            BOOKING_STATUS_COLORS[b.status] ?? "bg-gray-500/10 text-gray-500"
                          )}
                        >
                          {b.status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] font-bold uppercase tracking-wider",
                            PAYMENT_STATUS_COLORS[b.paymentStatus] ?? "bg-gray-500/10 text-gray-500"
                          )}
                        >
                          {b.paymentStatus}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-sm font-medium">
                      {vehicle || "—"}
                      {plate && (
                        <span className="ml-2 text-xs font-bold tracking-wider text-primary/70 bg-primary/5 border border-primary/10 rounded px-1 py-0.5">
                          {plate}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(b.pickupDatetime)} → {formatDateTime(b.dropoffDatetime)}
                    </div>
                    <div className="text-sm font-semibold mt-1">
                      {formatBookingAmount(b.totalAmount, b.currency)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* ─── Booking Detail panel ─────────────────────────────────────────── */}
      <BookingDetail
        bookingId={detailBookingId}
        open={detailBookingId !== null}
        onClose={() => setDetailBookingId(null)}
        onPaymentChanged={() => queryClient.invalidateQueries()}
      />
    </div>
  );
}
