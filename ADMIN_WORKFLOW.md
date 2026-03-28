# Staycation Haven PH — Admin System Workflow

---

## Admin Roles Overview

The admin system has **three distinct roles**, each with its own dashboard and set of responsibilities:

| Role        | Route             | Description                                      |
|-------------|-------------------|--------------------------------------------------|
| **Owner**   | `/admin/owners`   | Full system access — property, finance, staff, settings |
| **CSR**     | `/admin/csr`      | Customer service — bookings, payments, guest support |
| **Cleaner** | `/admin/cleaners` | Field operations — cleaning tasks, issue reporting |

All roles require authentication. Unauthenticated access redirects to `/admin/login`.

---

## Admin Login

**Route:** `/admin/login`

- Login with email & password (credentials)
- Session managed via NextAuth
- On success → redirects to role-specific dashboard
- Back navigation to login is blocked after login (history lock)
- Active page is persisted in `localStorage` per role (survives page reload)

---

## Role 1 — Owner Dashboard

**Route:** `/admin/owners`

The Owner has full visibility and control over the entire system.

### Navigation Structure

#### Overview
| Page | Description |
|------|-------------|
| **Dashboard** | KPIs — total bookings, revenue, occupancy, guest count, reviews, trending stats |
| **Analytics & Reports** | Revenue charts, booking trends, occupancy rates, downloadable reports |

#### Bookings
| Page | Description |
|------|-------------|
| **Booking Calendar** | Visual calendar of all reservations per haven |
| **Reservations** | Full reservations table — filter, search, approve/reject, view details |
| **Blocked Dates** | Manage unavailable date ranges per haven |

#### Property
| Page | Description |
|------|-------------|
| **Haven Management** | Add, edit, view all units — rates, amenities, images, photo tours |
| **Maintenance** | Track reported issues — assign to staff, update status (Open → In Progress → Resolved → Closed) |
| **Cleaning Management** | Assign cleaning tasks per haven, track completion |

#### Finance
| Page | Description |
|------|-------------|
| **Revenue Management** | Revenue breakdown by haven, date range, stay type |
| **Payment Methods** | Configure accepted payment channels (GCash, bank, etc.) |

#### Communication
| Page | Description |
|------|-------------|
| **Guest Assistance** | View and respond to guest support requests |
| **Messages** | Internal messaging between staff and guest conversations |
| **Reviews & Feedback** | View and moderate guest reviews per haven |

#### Team
| Page | Description |
|------|-------------|
| **Staff Management** | Create, edit, deactivate employee accounts; view employment details |
| **User Management** | View and manage guest/user accounts |
| **Partner Management** | Manage business partners and affiliates |

#### System
| Page | Description |
|------|-------------|
| **Settings** | System-wide configuration (booking policies, rates, notifications) |
| **Audit Logs** | Full log of all admin actions with timestamps and actor info |

### Owner Modals
| Modal | Purpose |
|-------|---------|
| Add Unit | Register a new haven/unit |
| Add New Haven | Extended haven creation with full details |
| Booking Date | Set or adjust booking date windows |
| Booking Settings | Configure booking rules per haven |
| Payment Settings | Set payment requirements and deadlines |
| Create Employee | Add new staff member |
| Edit Employee | Update staff details |
| Policies | Edit booking, cancellation, and house rule policies |
| Notification | View system notifications |
| Message | Compose / view messages |
| Assign To | Assign a maintenance issue to a staff member |
| View Report Details | Full maintenance report view |

---

## Role 2 — CSR (Customer Service Representative) Dashboard

**Route:** `/admin/csr`

The CSR handles day-to-day guest interactions and booking operations.

### Navigation Structure

| Page | Description |
|------|-------------|
| **Dashboard** | Summary stats — today's check-ins/check-outs, pending bookings, active guests |
| **Bookings** | Full booking management — view, approve, reject, process check-in/check-out |
| **Calendar** | Monthly calendar view of all bookings |
| **Google Calendar** | Sync and view bookings in Google Calendar |
| **Payments** | View payment submissions, verify proof of payment, mark as paid |
| **Deposits** | Manage security deposit records |
| **Discounts** | Create and manage discount codes / promotions |
| **Deliverables** | Track guest deliverables and add-on fulfillment |
| **Cleaners** | View cleaner assignments and status |
| **Inventory** | Track and manage in-room inventory and supplies |
| **Messages** | Guest and staff messaging |
| **Activity Logs** | Log of all CSR actions within the system |
| **Notifications** | View system and booking notifications |
| **Settings** | Personal/account settings |
| **Profile** | View and update own profile |

### Booking Management Workflow (CSR)

```
Guest submits booking (status: Pending)
        │
        ▼
CSR reviews booking details + payment proof
        │
        ├── Approve ──► status: Confirmed ──► Send approval email
        │
        └── Reject ──► Enter rejection reason ──► status: Rejected ──► Send rejection email
                              (2-step confirmation modal)
        │
        ▼ (on check-in date)
CSR processes Check-in ──► status: Checked In ──► Send check-in email
        │
        ▼ (on check-out date)
CSR processes Check-out ──► status: Checked Out ──► Send check-out email
```

### CSR Header Features
- Live clock and date display
- Real-time weather widget (location: Mother Ignacia Ave, Diliman, QC)
- Unread message badge (polling every 5 seconds)
- Unread notification badge (polling every 30 seconds)
- Profile dropdown (view profile, settings, sign out)
- Dark/light/system theme toggle

---

## Role 3 — Cleaner Dashboard

**Route:** `/admin/cleaners`

Cleaners are field staff responsible for unit turnover and issue reporting.

### Navigation Structure

| Page | Description |
|------|-------------|
| **Dashboard** | Overview of today's tasks, schedule, and assigned units |
| **My Assignment** | View current cleaning assignments with haven details |
| **Property Location** | Map view of property location for navigation |
| **Cleaning Checklist** | Step-by-step checklist to complete per unit turnover |
| **Report an Issue** | Submit a maintenance/damage report for a unit |
| **Notifications** | View task assignments and alerts |
| **My Schedule** | Calendar view of upcoming cleaning schedule |
| **User Guide** | In-app documentation and how-to guides |
| **Messages** | Communication with CSR and Owner |
| **Profile** | View and update own profile |

### Cleaner Issue Reporting Workflow

```
Cleaner notices issue during cleaning
        │
        ▼
Report an Issue page
  - Select haven
  - Select issue type
  - Set priority level (Low / Medium / High / Urgent)
  - Specify location within unit
  - Describe the issue
  - Upload photos (optional)
        │
        ▼
Report submitted ──► Owner sees it in Maintenance page
        │
        ▼
Owner/Admin assigns report to staff member
        │
        ▼
Status: Open → In Progress → Resolved → Closed
```

---

## Cross-Role: Notifications & Messaging

All three roles have access to:

- **Notifications** — real-time alerts for booking updates, task assignments, and system events
- **Messages** — internal messaging modal in the header for quick communication; full page view available in sidebar

Notification polling:
- CSR notifications: every 30 seconds
- CSR conversations: every 5 seconds

---

## Cross-Role: Email Triggers (Admin-Initiated)

| Action | Trigger | Email Sent |
|--------|---------|------------|
| Booking submitted by guest | Automatic | Booking confirmation + pending status |
| CSR approves booking | Manual | Down payment approval email |
| CSR rejects booking | Manual | Rejection email with reason |
| CSR checks in guest | Manual | Check-in instructions email |
| CSR checks out guest | Manual | Check-out summary email |

---

## Booking Status Reference (Admin View)

```
pending ──► confirmed ──► checked-in ──► checked-out
         └──► rejected
         └──► cancelled
```

| Status        | Who Sets It  | Meaning                              |
|---------------|--------------|--------------------------------------|
| `pending`     | System       | Guest submitted, awaiting CSR review |
| `confirmed`   | CSR / Owner  | Payment verified, booking approved   |
| `rejected`    | CSR / Owner  | Booking declined (with reason)       |
| `checked-in`  | CSR          | Guest has arrived                    |
| `checked-out` | CSR          | Guest has departed                   |
| `cancelled`   | Guest / CSR  | Booking cancelled before check-in    |

---

## Admin Route Summary

| Route                         | Role     | Page                     |
|-------------------------------|----------|--------------------------|
| `/admin/login`                | All      | Login                    |
| `/admin/owners`               | Owner    | Owner Dashboard          |
| `/admin/owners/analytics`     | Owner    | Analytics & Reports      |
| `/admin/csr`                  | CSR      | CSR Dashboard            |
| `/admin/csr/calendar`         | CSR      | Booking Calendar         |
| `/admin/csr/google-calendar`  | CSR      | Google Calendar Sync     |
| `/admin/csr/activity-logs`    | CSR      | Activity Logs            |
| `/admin/csr/inventory`        | CSR      | Inventory Management     |
| `/admin/cleaners`             | Cleaner  | Cleaner Dashboard        |
