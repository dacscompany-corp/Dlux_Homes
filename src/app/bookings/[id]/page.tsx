"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { mockBookings } from "@/lib/mock-data";
import { getStoredBookings, type StoredBooking } from "@/lib/booking-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  Calendar,
  Clock,
  Users,
  MapPin,
  CheckCircle2,
  Circle,
  Upload,
  ImageIcon,
  AlertCircle,
  CreditCard,
} from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending: { label: "Pending Review", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  confirmed: { label: "Confirmed", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  "checked-in": { label: "Checked In", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
  "checked-out": { label: "Checked Out", color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" },
  rejected: { label: "Rejected", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  cancelled: { label: "Cancelled", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" },
};

const timelineSteps = [
  { key: "pending", label: "Booking Submitted", desc: "Your booking request has been received" },
  { key: "confirmed", label: "Booking Confirmed", desc: "Payment verified and booking confirmed" },
  { key: "checked-in", label: "Checked In", desc: "You have checked into your haven" },
  { key: "checked-out", label: "Checked Out", desc: "Stay completed — thank you!" },
];

const statusOrder = ["pending", "confirmed", "checked-in", "checked-out"];

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const mockBooking = mockBookings.find((b) => b.id === id) || null;
  const [booking, setBooking] = useState<StoredBooking | (typeof mockBookings)[0] | null>(mockBooking);
  const [storageChecked, setStorageChecked] = useState(false);

  useEffect(() => {
    const stored = getStoredBookings();
    const found = stored.find((b) => b.id === id);
    if (found) setBooking(found);
    setStorageChecked(true);
  }, [id]);

  if (!storageChecked && !booking) return null;
  if (!booking) return notFound();

  const status = statusConfig[booking.status] || statusConfig.pending;
  const currentStepIdx = statusOrder.indexOf(booking.status);
  const isRejected = booking.status === "rejected";
  const isCancelled = booking.status === "cancelled";

  const addOnsTotal = booking.addOns.reduce((sum, a) => sum + a.price * a.qty, 0);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F0E3" }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-gray-200 shadow-sm" style={{ backgroundColor: "#F7F0E3" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/rooms">
            <Image src="/logo.png" alt="D' Lux Homes" width={130} height={44} className="object-cover mix-blend-multiply" style={{ width: "130px", height: "44px" }} />
          </Link>
          <Link href="/login">
            <Button
              size="sm"
              className="rounded-full text-white"
              style={{ backgroundColor: "#B07848" }}
            >
              Login
            </Button>
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link
          href="/my-bookings"
          className="inline-flex items-center gap-2 font-medium text-sm mb-6 group hover:opacity-80 transition-opacity"
          style={{ color: "#B07848" }}
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to My Bookings
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6" style={{ border: "1px solid #E0CEB8" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{booking.roomName}</h1>
              <p className="text-gray-400 font-mono text-sm mt-1">Booking #{booking.id}</p>
            </div>
            <div className={`px-4 py-2 rounded-xl border ${status.bg} ${status.border}`}>
              <p className={`font-bold text-sm ${status.color}`}>{status.label}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Status Timeline */}
            {!isRejected && !isCancelled && (
              <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: "1px solid #E0CEB8" }}>
                <h2 className="font-bold text-gray-900 mb-6">Booking Status</h2>
                <div className="space-y-0">
                  {timelineSteps.map((step, idx) => {
                    const isCompleted = currentStepIdx > idx;
                    const isActive = currentStepIdx === idx;
                    const isFuture = currentStepIdx < idx;
                    return (
                      <div key={step.key} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                              backgroundColor: isCompleted
                                ? "#22c55e"
                                : isActive
                                ? "#B07848"
                                : "#f3f4f6",
                            }}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-5 h-5 text-white" />
                            ) : (
                              <Circle
                                className={`w-5 h-5 ${
                                  isActive ? "text-white fill-white" : "text-gray-300"
                                }`}
                              />
                            )}
                          </div>
                          {idx < timelineSteps.length - 1 && (
                            <div
                              className="w-0.5 h-10 mt-1"
                              style={{ backgroundColor: isCompleted ? "#4ade80" : "#e5e7eb" }}
                            />
                          )}
                        </div>
                        <div className="pb-6">
                          <p
                            className={`font-semibold text-sm ${
                              isCompleted ? "text-green-600" : isFuture ? "text-gray-400" : "text-gray-700"
                            }`}
                            style={isActive ? { color: "#B07848" } : undefined}
                          >
                            {step.label}
                          </p>
                          <p className={`text-xs mt-0.5 ${isFuture ? "text-gray-300" : "text-gray-400"}`}>
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(isRejected || isCancelled) && (
              <div
                className={`rounded-2xl border p-5 flex gap-3 ${
                  isRejected ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"
                }`}
              >
                <AlertCircle
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    isRejected ? "text-red-500" : "text-slate-500"
                  }`}
                />
                <div>
                  <p className={`font-semibold ${isRejected ? "text-red-700" : "text-slate-700"}`}>
                    {isRejected ? "Booking Rejected" : "Booking Cancelled"}
                  </p>
                  <p className={`text-sm mt-0.5 ${isRejected ? "text-red-600" : "text-slate-600"}`}>
                    {isRejected
                      ? "Your booking was rejected. Please contact our support team for assistance."
                      : "This booking has been cancelled. Please contact us if you need help."}
                  </p>
                </div>
              </div>
            )}

            {/* Booking Summary */}
            <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: "1px solid #E0CEB8" }}>
              <h2 className="font-bold text-gray-900 mb-4">Booking Summary</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: "#F7F0E3", border: "1px solid #E0CEB8" }}
                  >
                    <Calendar className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#B07848" }} />
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Check-in Date</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{booking.checkIn}</p>
                    </div>
                  </div>
                  <div
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: "#F7F0E3", border: "1px solid #E0CEB8" }}
                  >
                    <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#B07848" }} />
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Stay Type</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{booking.stayType}</p>
                    </div>
                  </div>
                  <div
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: "#F7F0E3", border: "1px solid #E0CEB8" }}
                  >
                    <Users className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#B07848" }} />
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Guests</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">
                        {booking.guests.adults} adults
                        {booking.guests.children > 0 && `, ${booking.guests.children} children`}
                        {booking.guests.infants > 0 && `, ${booking.guests.infants} infants`}
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: "#F7F0E3", border: "1px solid #E0CEB8" }}
                  >
                    <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#B07848" }} />
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Booked On</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{booking.createdAt}</p>
                    </div>
                  </div>
                </div>

                {/* Add-ons */}
                {booking.addOns.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-3">Add-Ons</p>
                    <div className="space-y-2">
                      {booking.addOns.map((addon) => (
                        <div
                          key={addon.name}
                          className="flex items-center justify-between py-2 last:border-0"
                          style={{ borderBottom: "1px solid #F7F0E3" }}
                        >
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-gray-700">{addon.name}</span>
                            <Badge variant="secondary" className="text-xs">x{addon.qty}</Badge>
                          </div>
                          <span className="text-sm font-medium text-gray-800">
                            ₱{(addon.price * addon.qty).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Documents */}
            <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: "1px solid #E0CEB8" }}>
              <h2 className="font-bold text-gray-900 mb-4">Documents</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  className="rounded-xl p-5 text-center"
                  style={{ border: "2px dashed #E0CEB8" }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: "#EDE0CE" }}
                  >
                    <CreditCard className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="font-medium text-gray-600 text-sm">Payment Proof</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {booking.status === "pending" ? "Awaiting review" : "Verified"}
                  </p>
                  {booking.status === "pending" && (
                    <Button size="sm" variant="outline" className="mt-3 text-xs gap-1.5">
                      <Upload className="w-3 h-3" />
                      Upload
                    </Button>
                  )}
                </div>
                <div
                  className="rounded-xl p-5 text-center"
                  style={{ border: "2px dashed #E0CEB8" }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: "#EDE0CE" }}
                  >
                    <ImageIcon className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="font-medium text-gray-600 text-sm">Valid ID</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {booking.status === "pending" ? "Awaiting review" : "Verified"}
                  </p>
                  {booking.status === "pending" && (
                    <Button size="sm" variant="outline" className="mt-3 text-xs gap-1.5">
                      <Upload className="w-3 h-3" />
                      Upload
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div
              className="bg-white rounded-2xl shadow-sm overflow-hidden sticky top-24"
              style={{ border: "1px solid #E0CEB8" }}
            >
              <div className="p-5 text-white" style={{ backgroundColor: "#B07848" }}>
                <p className="text-xs" style={{ color: "#F7F0E3" }}>Total Amount</p>
                <p className="text-3xl font-bold mt-1">₱{booking.totalAmount.toLocaleString()}</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Room ({booking.stayType})</span>
                  <span className="font-medium text-gray-800">
                    ₱{(booking.totalAmount - addOnsTotal).toLocaleString()}
                  </span>
                </div>
                {booking.addOns.map((addon) => (
                  <div key={addon.name} className="flex justify-between text-sm">
                    <span className="text-gray-500">{addon.name} x{addon.qty}</span>
                    <span className="text-gray-700">₱{(addon.price * addon.qty).toLocaleString()}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span className="text-gray-900">Total</span>
                  <span style={{ color: "#B07848" }}>₱{booking.totalAmount.toLocaleString()}</span>
                </div>

                <div className="pt-3 space-y-2">
                  {booking.status === "confirmed" && (
                    <Button
                      className="w-full bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                      variant="outline"
                      size="sm"
                    >
                      Request Cancellation
                    </Button>
                  )}
                  <Link href="/rooms">
                    <Button
                      className="w-full text-white"
                      style={{ backgroundColor: "#B07848" }}
                      size="sm"
                    >
                      Book Another Room
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
