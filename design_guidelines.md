# Design Guidelines: Multi-Tenant SaaS Automation Platform

## Design Approach

**Selected Approach:** Design System - Modern SaaS Dashboard  
**Inspiration:** Linear (clean data presentation) + Notion (intuitive forms) + Stripe Dashboard (sophisticated metrics)  
**Rationale:** Enterprise B2B application requiring consistent, efficient data management interfaces with clear information hierarchy and role-based navigation.

---

## Core Design Principles

1. **Data Clarity First:** Every dashboard element serves a functional purpose - no decorative clutter
2. **Scannable Hierarchy:** Users should grasp key metrics within 3 seconds of landing on any page
3. **Consistent Patterns:** Reusable components across all dashboards (Owner/Manager/Accountant views)
4. **Responsive Data Tables:** Mobile-friendly approaches to complex data displays

---

## Typography System

**Font Families:**
- Primary: Inter (via Google Fonts CDN) - body text, UI elements, data tables
- Monospace: JetBrains Mono - numerical data, codes, API keys

**Type Scale:**
- Hero/Dashboard Titles: text-3xl font-bold (30px)
- Section Headings: text-xl font-semibold (20px)
- Card Titles: text-lg font-medium (18px)
- Body/Table Text: text-base (16px)
- Metadata/Labels: text-sm text-gray-600 (14px)
- Small Print: text-xs (12px)

**Hierarchy Rules:**
- Dashboard page titles always left-aligned with action buttons right-aligned in same row
- Metric cards use large numbers (text-2xl font-bold) with small labels above
- Table headers: text-sm font-semibold uppercase tracking-wide

---

## Layout System

**Spacing Primitives (Tailwind units):** 
Standardize on: **2, 4, 6, 8, 12, 16** units
- Component padding: p-6 (cards, modals)
- Section spacing: space-y-8 (between dashboard sections)
- Grid gaps: gap-6 (card grids)
- Inline spacing: space-x-4 (button groups)
- Tight spacing: space-y-2 (form fields)

**Container Widths:**
- Sidebar: fixed w-64 (256px)
- Main content area: flex-1 with max-w-7xl mx-auto px-8
- Modals/Forms: max-w-2xl
- Data tables: w-full with horizontal scroll on mobile

**Grid Patterns:**
- Metrics cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- Product/Service cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Two-column forms: grid-cols-1 md:grid-cols-2

---

## Component Library

### Navigation
**Sidebar Navigation:**
- Fixed left sidebar (w-64) with logo at top
- Navigation items with icons (Heroicons) + labels
- Active state: subtle highlight, left border accent
- Collapsed state on mobile (hamburger menu)
- Bottom section: user profile dropdown, subscription status badge

**Top Bar:**
- Breadcrumb navigation (Home > Dashboard > Orders)
- Right side: notifications bell icon, user avatar with dropdown

### Dashboard Components

**KPI Metric Cards:**
- Elevated card (shadow-sm) with border
- Layout: Icon top-left, large number center, label below, trend indicator (↑/↓ percentage)
- Dimensions: h-32 with p-6
- Grid display for 2-4 metrics per row

**Chart Cards:**
- Larger card container (min-h-96)
- Header row: chart title left, time period selector right (tabs: 7D, 30D, 90D)
- Recharts line/bar charts with subtle grid lines
- Tooltip on hover showing exact values

**Data Tables:**
- Sticky header row with subtle shadow on scroll
- Alternating row backgrounds for readability
- Action column (right-aligned) with icon buttons
- Pagination footer: rows per page selector + page numbers
- Empty state: centered icon + "No data yet" message
- Loading state: skeleton rows

### Forms

**Input Fields:**
- Label above input (text-sm font-medium mb-2)
- Input: border rounded-lg px-4 py-2.5 with focus ring
- Helper text below in text-sm text-gray-500
- Error state: red border + error message

**Form Layouts:**
- Two-column grid on desktop, stack on mobile
- Submit button: primary style, bottom-right or full-width on mobile
- Cancel button: secondary style, left of submit
- Required fields marked with red asterisk

**Buttons:**
- Primary: solid fill, medium weight, px-6 py-2.5, rounded-lg
- Secondary: outline style with hover fill
- Icon buttons: square aspect ratio, p-2
- Button groups: space-x-2 with consistent heights

### Modals & Overlays

**Modal Structure:**
- Backdrop: semi-transparent overlay
- Modal: centered, max-w-2xl, rounded-xl, shadow-2xl
- Header: title + close icon (top-right)
- Body: p-6 with scrollable content
- Footer: action buttons right-aligned

**Dropdown Menus:**
- Trigger: button/avatar with caret icon
- Menu: absolute positioning, shadow-lg, rounded-lg
- Items: hover background change, icon + text layout

### Status Badges

**Badge Component:**
- Small rounded-full px-3 py-1 inline-flex items-center
- Variants: Success (orders completed), Warning (pending), Error (failed), Info (active subscription)
- Text: text-xs font-medium uppercase tracking-wide

---

## Specialized Sections

### Authentication Pages (Login/Register)
- Centered card on minimal background
- Logo at top center
- Form max-w-md
- Social login buttons below form
- "Don't have an account?" link at bottom

### Subscription Management
- Three pricing cards in grid-cols-1 md:grid-cols-3
- Each card: plan name, price (large text-4xl), feature list with checkmarks, CTA button
- Current plan highlighted with border accent
- Billing history table below pricing cards

### Chat Interface (AI Simulation)
- Two-column layout: conversation list left (w-80), chat area right (flex-1)
- Chat messages: alternating alignment (customer left, AI right)
- Message bubbles: rounded-2xl, max-w-md, px-4 py-3
- Input area: sticky bottom, textarea with send button
- Session info header: customer name, platform badge, "Request Human" button

### Order/Appointment Lists
- Filter bar above table: search input, date range picker, status dropdown
- Quick actions: "Export CSV", "New Order" buttons top-right
- Detail view: slide-out panel from right showing full order/appointment info

---

## Responsive Behavior

**Breakpoints:**
- Mobile: base (< 768px) - stack everything, hide sidebar, show mobile menu
- Tablet: md (768px+) - two-column layouts, collapsible sidebar
- Desktop: lg (1024px+) - full sidebar, multi-column dashboards

**Mobile Adaptations:**
- Tables: horizontal scroll with sticky first column OR card-based view
- Metrics: stack cards vertically
- Charts: reduce height, simplify tooltips
- Forms: single column
- Navigation: hamburger menu with slide-out drawer

---

## Animation Guidelines

**Minimal, Purposeful Animations:**
- Page transitions: none (instant)
- Modal open/close: fade in/out (200ms)
- Dropdown menus: slide down (150ms)
- Hover states: smooth transition (100ms)
- Loading states: subtle pulse on skeleton elements
- **No scroll-triggered animations, parallax, or decorative motion**

---

## Accessibility Standards

- All interactive elements keyboard navigable (tab order)
- Focus states: visible outline or ring
- Color contrast: WCAG AA minimum (4.5:1 for text)
- Form labels properly associated with inputs
- ARIA labels for icon-only buttons
- Screen reader announcements for dynamic content updates

---

## Images

**No hero images** - this is a dashboard application, not a marketing site.

**Logo/Branding:**
- Company logo in sidebar (h-10, auto width)
- Favicon for browser tab

**Icons:**
- Use Heroicons (outline style) via CDN for all UI icons
- Icon size: w-5 h-5 for navigation, w-4 h-4 for inline buttons

**Empty States:**
- Illustrative icon (from Heroicons, large size w-16 h-16)
- Centered with explanatory text below

**No product images, no decorative photography** - focus is entirely on functional data display and interaction.