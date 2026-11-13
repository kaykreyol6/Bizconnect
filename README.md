# Bizconnect

BizConnect — a global business & social platform. The whole app is a single
`index.html` file (HTML + CSS + JavaScript): open it in a browser, or host it on
any static host (GitHub Pages, Netlify, S3). No build step, no server.

## Features

All buttons from the original design now work. Data is saved in the browser
(`localStorage`), so posts, likes, messages and signatures survive a reload.
Use **My Profile ▾ → Reset demo data** to start over.

| Area | What works |
|---|---|
| **Feed** | Tabs (All Posts, Businesses, Gigs, Bargains, Regional); likes; comments; share (native share sheet or copy link); delete your own posts |
| **Composer** | Text posts (press Enter or **Post**), 📷 photo upload (resized automatically), 🏷️ bargain with price & currency, 💼 gig with budget, application limit & remote option, 📍 show/hide location |
| **Businesses** | Directory with search and industry filters; Contact, Sign Contract, View Bargains on every listing |
| **Gigs** | Marketplace with filters (remote, on-site, applied, mine); apply with cover message; application counts and limits; close/reopen your own gigs |
| **Regulations** | 4-step agreement: read → quiz (graded, 80% required, wrong answers highlighted) → sign → certificate with real date and validity |
| **Contracts** | Proposal form (amount, currency, ICC Incoterm, date, notes); signing the regulations is required first; list of proposals, applications and your certificate (printable) |
| **Messages** | Conversations with any business, unread badges, automatic acknowledgement reply |
| **Profile & settings** | Edit profile, location (country/region/city/address), language & proficiency, accessibility (text size, high contrast, reduced motion) |
| **Mobile** | Responsive layout, bottom navigation bar, bottom-sheet dialogs, horizontally scrolling tabs, large touch targets |
| **Accessibility** | Keyboard support (Tab / Enter / Space / Esc), focus outlines, ARIA roles for menus, tabs and the quiz, skip link, browser back/forward between sections |

## Recommendations

1. **Backend & real accounts (highest priority).** Data currently lives only
   in each visitor's browser. Add a backend (for example Node/Express or
   Supabase/Firebase) with sign-up/login, a database, and an API, so posts,
   gigs and messages are shared between users.
2. **Address privacy.** The platform makes every street address public, but
   GDPR (which users are asked to accept) requires data minimisation. Make the
   street address optional and opt-in (always show country/region/city), and
   update quiz question 2 to match.
3. **Legally valid e-signatures.** The click-to-sign step records a timestamp
   only. For binding cross-border contracts, integrate a provider such as
   DocuSign or Adobe Sign, store signed PDFs, and actually email the copy the
   text promises. Have legal counsel review the regulation texts.
4. **Real messaging.** Replace the automatic reply with real-time messaging
   (WebSockets or Firebase) and email/push notifications.
5. **Translations.** The language picker saves a preference; extract the UI
   text into translation files and add right-to-left layout for Arabic.
6. **Image hosting.** Photos are stored inside the browser (about 5 MB total
   limit). Upload them to object storage or a CDN once a backend exists.
7. **Moderation & trust.** Add report/block buttons, business verification
   (registration documents), and reviews/ratings to back the "Verified" badges.
8. **Payments & escrow.** Add Stripe or a similar provider for gig payments and
   escrow on contracts.
9. **Performance at scale.** When content grows: paginate or infinitely
   scroll the feed, lazy-load images, serve through a CDN, and later split the
   single file into cached CSS/JS assets.
10. **Quality.** Add automated browser tests (Playwright) and analytics/error
    monitoring before launch.
