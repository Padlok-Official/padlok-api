Method Path Purpose Powers which UI
GET /disputes/:code Full dispute detail in one shot —
summary, status, both parties nested.
Top "Dispute Summary" card and
"Involved Parties" panel.
GET /disputes/:code/evid
ence
Timeline of all evidence events with
attachments (image URLs, uploader,
timestamp).
Entire "Evidence Timeline" feed including
image thumbnails.
GET /disputes/:code/stat
s
Aggregate stats (days open, evidence
count, message count, similar-dispute
rate).
"Dispute Stats" card at the bottom of the
page.
PadLok Admin — Dispute Detail API Endpoints
Reference for the dashboard screen at /disputes/:code (e.g.
https://main.d37bpt4nx3d74t.amplifyapp.com/disputes/DPOQ22332)
All paths below are prefixed with /api/v1. Every request must include Authorization: Bearer <token>.
Each action endpoint should append an entry to the dispute's evidence timeline so the audit log stays complete.
Read endpoints (page load)
Tip. These three could be flattened into a single GET network calls and fewer race conditions on initial render.
/disputes/:code if the response stays under ~50KB. Cleaner
Method Path Body Purpose
POST /disputes/:code/payo
ut
{ note?: string } Approve Seller Payout — releases escrow to the
seller.
POST /disputes/:code/refu
nd
{ note?: string } Refund Buyer — returns escrow to the buyer.
POST /disputes/:code/pena
lize
{ targetUserId, reason, severity } Penalize User — applies a strike or penalty to
buyer or seller.
POST /disputes/:code/flag { flagType, note?: string } Apply Dispute Flag — marks the dispute for
review or escalation.
POST /disputes/:code/reso
lve
{ outcome, note?: string } Close the dispute with a resolution decision
(often triggered automatically by payout/refund).
Action endpoints (admin buttons)
Communication endpoints (the two dropdowns)
The "Communicate with Buyer" and "Communicate with Seller" dropdowns are message-template pickers. Two
endpoints power them, plus an optional history endpoint if you want to surface prior comms.
Method Path Body Purpose
GET /disputes/message-te
mplates
— Fetch the list of templates that populate
the dropdown options.
POST /disputes/:code/mess
ages
{ recipient: 'buyer' | 'seller', templateId?,
body, channel: 'email' | 'sms' | 'in-app' }
Send a message to one of the parties.
GET /disputes/:code/mess
ages
— Fetch message history for this dispute
(optional, only if showing prior comms).
Route(s) Required permission(s)
GET /disputes/:code, /evidence, /stats view_disputes
GET /disputes/:code/evidence review_evidence
POST /disputes/:code/payout resolve_disputes, release_funds
POST /disputes/:code/refund resolve_disputes, process_refunds
POST /disputes/:code/resolve resolve_disputes
POST /disputes/:code/flag apply_flags
POST /disputes/:code/penalize suspend_users or flag_users
POST /disputes/:code/messages send_messages
Method Path Purpose
GET /disputes?status=&search;=&page;=&lim
it;=
(filtering, search, pagination).
Permissions to enforce on each route
Permission keys taken from the API's seed file (src/database/seed.ts). Each route should reject the request
if the caller's role lacks the listed permission.
Bonus — list/index endpoint (the page before this one)
Paginated list of disputes for the /disputes index page
Suggested implementation order
1. Audit what already exists in the padlok-api repo — grep the routes folder to see which of the endpoints
above are already wired.
2. Build the missing endpoints on the API, enforcing the permission map above.
3. Wire the dashboard frontend — React Query hooks for the GETs, mutation handlers for each button, with
optimistic UI on the action endpoints.
4. Add audit-log entries for every action endpoint so the evidence timeline reflects admin decisions.