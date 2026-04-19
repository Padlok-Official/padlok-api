# PadLok Dashboard — Data & Actions Inventory

Source of truth for API documentation. One item per bullet, grouped by page.

---

## Navigation & Layout

1. Sidebar → BI Overview (Dashboard)
2. Sidebar → Financial Forecast
3. Sidebar → Payment Behavior
4. Sidebar → Integration Insights
5. Sidebar → Revenue Analytics
6. Sidebar → Wallet & Escrow
7. Sidebar → Disputes
8. Sidebar → Flags & Reports
9. Sidebar → Notifications
10. Sidebar → Admin Management
11. Sidebar → Logout (with confirmation modal)
12. Topbar page title ("Business Intelligence")
13. Topbar subtitle ("Partner Intelligence Dashboard")
14. Topbar admin avatar image
15. Topbar admin name
16. Topbar admin role label
17. Route transition progress bar

---

## Login Page

### Data shown
18. Email input field
19. Password input field (masked)
20. Password visibility toggle (Eye/EyeOff icon)
21. Brand panel text — "Security"
22. Brand panel text — "Speed"
23. Brand panel text — "Trust"

### Actions
24. Enter email
25. Enter password
26. Toggle password visibility
27. Submit login form → `POST /auth/login` → navigate to dashboard
28. Dev fallback login: `admin@padlok.com` / `admin123` when API unreachable

---

## BI Overview (Dashboard)

### Data shown
29. Page title — "Business Intelligence Overview"
30. Page subtitle
31. Live indicator dot (pulsing green / red for offline)
32. Live status label ("Live" / "Offline")
33. Platform Activity chart title
34. Disputes count (numeric, bar 1)
35. Completed Transactions count (numeric, bar 2)
36. Ongoing Transactions count (numeric, bar 3)
37. Active Users count (numeric, bar 4)
38. Platform Activity histogram (4-bar chart)
39. Financial Summary pie chart title
40. Total Revenue amount (¢)
41. In Escrow Balance amount (¢)
42. Transaction Fees amount (¢)
43. Total Revenue % of pie
44. In Escrow Balance % of pie
45. Transaction Fees % of pie
46. Financial Summary pie legend (3 entries)

### Actions
47. API error banner — "Couldn't reach the API — retrying…"
48. Skeleton animation while first load is pending

---

## Financial Forecast Page

### Data shown
49. Page title — "Financial Forecasting"
50. Page subtitle
51. Monthly Forecasted Revenue — ¢ amount
52. Monthly Forecasted Revenue — % trend delta
53. Monthly Forecasted Revenue — trend arrow (up/down)
54. Seasonal Peak — quarter/year (e.g. "Q4 2025")
55. Seasonal Peak — description ("High Demand")
56. Seasonal Peak — trend arrow
57. Projected Escrow Growth — ¢ amount
58. Projected Escrow Growth — % trend delta
59. Projected Escrow Growth — trend arrow
60. Seasonal Demand Chart — 12-month line chart

### Actions
61. Render chart on load

---

## Payment Behavior Page

### Data shown
62. Page title — "Payment Behavior Analysis"
63. Page subtitle
64. Avg Top-Up Amount — ¢ amount
65. Avg Top-Up Amount — % trend delta
66. Avg Top-Up Amount — trend arrow
67. Top-Up Frequency — count / hour
68. Top-Up Frequency — % trend delta
69. Top-Up Frequency — trend arrow
70. Promo Redemption — %
71. Promo Redemption — % trend delta
72. Promo Redemption — trend arrow
73. Top Up Frequency chart
74. Wallet Balance Trend chart
75. Promotional Strategy Recommendations section title
76. Recommendation 1 title — "Weekend Boost"
77. Recommendation 1 description
78. Recommendation 1 impact (e.g. "+$18K revenue")
79. Recommendation 2 title — "Loyalty Rewards"
80. Recommendation 2 description
81. Recommendation 2 impact (e.g. "+22% retention")
82. Recommendation 3 title — "Referrals"
83. Recommendation 3 description
84. Recommendation 3 impact (e.g. "+35% off-peak usage")

### Actions
85. Render Top Up Frequency chart
86. Render Wallet Balance Trend chart
87. Read-only recommendations

---

## Integration Insights Page

### Data shown
88. Page title — "Integration Insights"
89. Page subtitle
90. Avg Transaction Value — ¢ amount
91. Avg Transaction Value — % trend delta
92. Avg Transaction Value — trend arrow
93. Failed Transactions — %
94. Failed Transactions — % trend delta
95. Failed Transactions — trend arrow
96. Refund Rate — %
97. Refund Rate — % trend delta
98. Refund Rate — trend arrow
99. Transaction Vol — count
100. Transaction Vol — % trend delta
101. Transaction Vol — trend arrow
102. Revenue chart
103. Wallet Transaction Insights section title
104. Daily Transactions — count
105. Avg Transaction Value — ¢ amount (insights table)
106. Failed Transactions — % (insights table)
107. Refund Rate — % (insights table)

### Actions
108. Render Revenue chart
109. Render Wallet Transaction Insights table

---

## Revenue Analytics Page

### Data shown
110. Page title — "Enhanced Revenue Analytics"
111. Page subtitle
112. Revenue / Transaction — ¢ ratio (e.g. "¢1.92/km")
113. Revenue / Transaction — % trend delta
114. Revenue / Transaction — trend arrow
115. Service Availability — %
116. Service Availability — % trend delta
117. Service Availability — trend arrow
118. Pricing Efficiency — %
119. Pricing Efficiency — % trend delta
120. Pricing Efficiency — trend arrow
121. Wallet Loading Patterns chart title
122. Wallet Loading Patterns — 7-day weekly line chart
123. Optimal Pricing Strategies section title
124. Strategy 1 title — "Dynamic Base Fare"
125. Strategy 1 description
126. Strategy 1 potential (e.g. "+$32K/month")
127. Strategy 2 title — "Distance Tier Optimization"
128. Strategy 2 description
129. Strategy 2 potential (e.g. "+$28K/month")
130. Strategy 3 title — "Wallet Incentive Program"
131. Strategy 3 description
132. Strategy 3 potential (e.g. "+$45K/month")

### Actions
133. Render Wallet Loading Patterns chart
134. Read-only pricing strategies

---

## Wallet & Escrow Page

### Data shown
135. Page title — "Wallet & Escrow"
136. Page subtitle
137. Total Funds in Escrow — ¢ amount
138. Total Funds in Escrow — % trend delta
139. Total Funds in Escrow — trend arrow
140. Top-Up Frequency — count/hour
141. Top-Up Frequency — % trend delta
142. Top-Up Frequency — trend arrow
143. Total Released Funds — ¢ amount
144. Total Released Funds — % trend delta
145. Total Released Funds — trend arrow
146. Transaction Log section title
147. Column: Transaction ID
148. Column: Movement Path (e.g. "Buyer Escrow")
149. Column: Amount
150. Column: Date
151. Column: Status
152. Row — Transaction ID (string)
153. Row — Movement Path (string)
154. Row — Amount (¢)
155. Row — Date (string)
156. Row — Status badge "Released" (green)
157. Row — Status badge "Refunded" (red)
158. Additional transaction rows with same columns

### Actions
159. Click transaction row → navigate to transaction details (planned)
160. View transaction log table

---

## Disputes Page

### Data shown
161. Page title — "Disputes"
162. Page subtitle
163. Open Disputes — count
164. Open Disputes — % trend delta
165. Open Disputes — trend arrow
166. Resolved This Month — count
167. Resolved This Month — % trend delta
168. Resolved This Month — trend arrow
169. Average Resolution Time — duration (e.g. "1.2 days")
170. Average Resolution Time — % trend delta
171. Average Resolution Time — trend arrow
172. Recent Disputes section title
173. Column: Dispute ID
174. Column: Buyer
175. Column: Seller
176. Column: Amount
177. Column: Date
178. Column: Status
179. Row — Dispute ID (string, clickable)
180. Row — Buyer name
181. Row — Seller name
182. Row — Amount (GHS)
183. Row — Date
184. Row — Status badge "Open" (amber)
185. Row — Status badge "Resolved" (green)
186. Additional dispute rows with same columns

### Actions
187. Click dispute row → navigate to `/disputes/:disputeId` (Evidence Panel)
188. Row hover → background highlight
189. Render disputes table

---

## Evidence Panel Page

### Data shown
190. Back-to-Disputes text link
191. Page title — "Evidence Panel"
192. Dispute ID subtitle (e.g. "#DPOQ22332")
193. Dispute Summary section title
194. Label — "Transaction ID"
195. Value — Transaction ID (e.g. "#TXN8834521")
196. Label — "Escrow Amount"
197. Value — Escrow Amount (GHS)
198. Label — "Filed Date"
199. Value — Filed Date
200. Label — "Buyer"
201. Value — Buyer name
202. Label — "Seller"
203. Value — Seller name
204. Label — "Evidence Status"
205. Value — Evidence Status (e.g. "Complete")
206. Evidence Timeline section title
207. Timeline event 1 title — "Escrow Funded by Buyer"
208. Timeline event 1 datetime
209. Timeline event 1 description
210. Timeline event 1 dot color (green)
211. Timeline event 2 title — "Order Accepted by Seller"
212. Timeline event 2 datetime
213. Timeline event 2 description
214. Timeline event 3 title — "Item Marked as Delivered (Seller)"
215. Timeline event 3 image count
216. Timeline event 3 image placeholders
217. Timeline event 4 title — "Delivery Proof from Buyer"
218. Timeline event 4 image count
219. Timeline event 5 title — "Reason for Dispute"
220. Timeline event 5 bold description
221. Timeline event 5 dot color (red)
222. Admin Actions section title
223. Buyer contact — name
224. Buyer contact — role label "Buyer"
225. Buyer contact — email
226. Buyer contact — phone
227. Seller contact — name
228. Seller contact — role label "Seller"
229. Seller contact — email
230. Seller contact — phone
231. Buyer push-notification textarea placeholder
232. Involved Parties section title
233. Buyer initials avatar
234. Seller initials avatar
235. Dispute Stats section title
236. Days Since Filed — count
237. Evidence Items — count

### Actions
238. Click Back-to-Disputes → navigate to `/disputes`
239. Expand "Communicate with Buyer" panel
240. Expand "Communicate with Seller" panel
241. Type message in buyer textarea
242. Type message in seller textarea
243. Click "Send Notification" (buyer) → push notification to buyer
244. Click "Send Notification" (seller) → push notification to seller
245. Toast — "Push notification sent to [Name]"
246. Click "Approve Seller Payout" → open payout confirmation modal
247. Click "Refund Buyer" → open refund confirmation modal
248. Click "Penalize User" → apply penalty (planned)
249. Click "Apply Dispute Flag" → flag user (planned)
250. Payout modal shows amount + seller name
251. Click "Confirm Payout" → release escrow funds
252. Click "Cancel" on payout modal → close
253. Toast — "Seller payout of GHS X approved successfully"
254. Refund modal shows amount + buyer name
255. Click "Confirm Refund" → refund to buyer
256. Click "Cancel" on refund modal → close
257. Toast — "Refund of GHS X issued to [Buyer]"

---

## Flags & Reports Page

### Data shown
258. Page title — "Flags and Reports"
259. Page subtitle
260. Flagged Users — count
261. Flagged Users — % trend delta
262. Flagged Users — trend arrow
263. Active Risk Alerts — count
264. Active Risk Alerts — % trend delta
265. Active Risk Alerts — trend arrow
266. Accounts Frozen — count
267. Accounts Frozen — % trend delta
268. Accounts Frozen — trend arrow
269. Permanently Banned — count
270. Permanently Banned — numeric trend delta
271. Permanently Banned — trend arrow
272. Flagged Users table
273. Filter button
274. Export button
275. Column: User ID
276. Column: Name
277. Column: Type (Buyer/Seller)
278. Column: Flag Reason
279. Column: Flags (count)
280. Column: Risk Level
281. Column: Status
282. Row — User ID
283. Row — Name
284. Row — Type
285. Row — Flag Reason
286. Row — Flags count (colored)
287. Row — Risk Level badge "High" (red)
288. Row — Status "Pending Ban" (red)
289. Row — Risk Level badge "Medium" (amber)
290. Row — Status "Under Review" (amber)
291. Row — Risk Level badge "Medium" (amber)
292. Row — Status "Warning Issued" (amber)
293. Row — Risk Level badge "Low" (green)
294. Row — Status "Under Review" (amber)
295. Row — Risk Level badge "High" (red)
296. Row — Status "Banned" (red)
297. Row — Risk Level badge "Medium" (amber)
298. Row — Status "Frozen" (red)
299. Pagination label — "Showing 1-6 of 18 flagged users"
300. Previous pagination button
301. Next pagination button
302. Recent Risk Alerts section title
303. Alert 1 dot color (red)
304. Alert 1 title
305. Alert 1 description
306. Alert 1 relative time
307. Alert 2 dot color (amber)
308. Alert 2 title
309. Alert 2 description
310. Alert 2 relative time
311. Alert 3 dot color (amber)
312. Alert 3 title
313. Alert 3 description
314. Alert 3 relative time

### Actions
315. Click Filter → open filter panel (planned)
316. Click Export → download CSV of flagged users
317. Click flagged user row → navigate to `/flags-reports/:userId`
318. Click Previous pagination → previous page
319. Click Next pagination → next page

---

## Flagged User Details Page

### Data shown
320. Breadcrumb — "Flags and Reports"
321. Breadcrumb — user ID (e.g. "#USR00892")
322. Page title — "Flagged User Details"
323. User avatar initials
324. User full name
325. User role + registration (e.g. "Seller - Registered Jan 15, 2024")
326. Risk badge — "High Risk" (red)
327. Label — "User ID"
328. Value — User ID
329. Label — "Email"
330. Value — email
331. Label — "Phone"
332. Value — phone
333. Label — "Total Transactions"
334. Value — Total Transactions count
335. Flag History section title — "Flag History (N Flags)"
336. Flag 1 title — "Flag 3 - High Dispute Rate"
337. Flag 1 severity badge — "Critical"
338. Flag 1 description
339. Flag 1 datetime + source
340. Flag 1 dot color (red)
341. Flag 2 title
342. Flag 2 severity badge — "Warning"
343. Flag 2 description
344. Flag 2 datetime
345. Flag 2 dot color (amber)
346. Flag 3 title
347. Flag 3 severity badge — "Warning"
348. Flag 3 description
349. Flag 3 datetime
350. Flag 3 dot color (amber)
351. Related Disputes section title
352. Column: Dispute ID
353. Column: Buyer
354. Column: Amount
355. Column: Status
356. Column: Date
357. Row — Dispute ID
358. Row — Buyer name
359. Row — Amount
360. Row — Status badge "Open" (amber)
361. Row — Date
362. Row — Status badge "Resolved" (green)
363. Row — Status badge "Resolved" (green)
364. Admin Actions section title
365. Warning banner — "User has N flags"
366. Warning banner — "Eligible for permanent ban per policy"
367. Account Statistics section title
368. Open Disputes — count (red)
369. Total Disputes — count (red)
370. Dispute Rate — %
371. Total Volume — currency (green)
372. Recent Activity section title
373. Activity 1 title — "New dispute opened (#...)"
374. Activity 1 datetime
375. Activity 1 dot color (red)
376. Activity 2 title — "Warning issued by Admin"
377. Activity 2 datetime
378. Activity 2 dot color (amber)
379. Activity 3 title — "Account temporarily frozen"
380. Activity 3 dot color (blue)
381. Activity 4 title — "Account unfrozen after review"
382. Activity 4 dot color (green)
383. Activity 5 title — "Dispute #... resolved"
384. Activity 5 dot color (red)

### Actions
385. Click back arrow → navigate to `/flags-reports`
386. Click "Review Account Details" → show account details (planned)
387. Click "Freeze Account" → freeze user
388. Click "Issue Warning" → issue warning
389. Click "Permanently Ban User" → ban user
390. Click "Remove Latest Flag" → remove most recent flag
391. Click dispute ID in table → navigate to dispute (planned)

---

## Notifications Page (Notification Center)

### Data shown
392. Page title — "Notification Center"
393. Breadcrumb — "Dashboard / Notifications"
394. Total Sent Today — count (green)
395. Delivery Rate — % (green)
396. Pending — count (green)
397. Failed — count (red)
398. Compose Notification section title
399. Notification Type label
400. Type button — "Warning"
401. Type button — "Dispute Update"
402. Type button — "Transaction"
403. Type button — "Announcement"
404. Recipient label
405. Recipient search input placeholder
406. "All Users" button
407. "Broadcast to All" button
408. Subject label
409. Subject input placeholder
410. Message label
411. Message textarea placeholder
412. Recent Notifications section title
413. View All link
414. Filter icon button
415. Column: Recipient
416. Column: Type
417. Column: Subject
418. Column: Channel
419. Column: Status
420. Column: Time
421. Row 1 — Recipient name
422. Row 1 — Recipient user ID
423. Row 1 — Type badge "Warning" (red)
424. Row 1 — Subject
425. Row 1 — Channels (push, sms icons)
426. Row 1 — Status badge "Sent" (green)
427. Row 1 — Relative time
428. Row 2 — Type badge "Dispute" (purple)
429. Row 2 — Channels (push, email icons)
430. Row 3 — Type badge "Transaction" (green)
431. Row 3 — Channel (sms icon)
432. Row 4 — Type badge "Announcement" (dark)
433. Row 4 — Recipient — "All Users"
434. Row 4 — Recipient user ID — "Broadcast"
435. Row 4 — Channels (push, sms, email icons)
436. Row 5 — Status badge "Failed" (red)
437. Delivery Channels section title
438. Push Notification status — "Active" (green)
439. SMS status — "Active" (green)
440. Email status — "Optional" (gray)
441. Schedule label
442. Schedule date picker input
443. Send Notification button
444. Quick Templates section title
445. Template 1 icon — AlertTriangle
446. Template 1 title — "Account Warning"
447. Template 1 description — "Standard warning template"
448. Template 1 Use link
449. Template 2 icon — Scale
450. Template 2 title — "Dispute Resolution"
451. Template 2 description
452. Template 2 Use link
453. Template 3 icon — CreditCard
454. Template 3 title — "Payment Released"
455. Template 3 description
456. Template 3 Use link
457. Template 4 icon — Megaphone
458. Template 4 title — "Platform Update"
459. Template 4 description
460. Template 4 Use link
461. Channel Performance section title
462. Channel 1 name — "Push Notifications"
463. Channel 1 delivery rate — "99.1%"
464. Channel 1 count sent today
465. Channel 1 label — "sent today"
466. Channel 2 name — "SMS Messages"
467. Channel 2 delivery rate — "97.8%"
468. Channel 2 count sent today
469. Channel 3 name — "Email"
470. Channel 3 delivery rate — "94.2%"
471. Channel 3 count sent today

### Actions
472. Click Warning type → select notification type
473. Click Dispute Update type → select
474. Click Transaction type → select
475. Click Announcement type → select
476. Type in recipient search → filter users
477. Click "All Users" → target all users
478. Click "Broadcast to All" → broadcast mode
479. Type subject → update state
480. Type message → update state
481. Click "View All" → navigate to notifications list (planned)
482. Click Filter icon → open filter panel (planned)
483. Click "Use" on a template → prefill subject + message
484. Click "Send Notification" → send with current type/recipient/subject/message

---

## Admin Management Page

### Data shown
485. Breadcrumb — "Dashboard / Admin Management"
486. Page title — "User Management"
487. Page subtitle
488. Invite User button (disabled when no roles exist)
489. Total Users — count
490. Active — count
491. Inactive — count
492. Pending Invites — count
493. Tab — "Users" with count badge
494. Tab — "Roles" with count badge
495. Tab — "Invitations" with count badge
496. Users tab search input placeholder
497. Users column: Administrator
498. Users column: Role
499. Users column: Email
500. Users column: Status
501. Users column: Last Active
502. Admin row — avatar initials
503. Admin row — name
504. Admin row — ID suffix (first 8 chars)
505. Admin row — role badge
506. Admin row — email
507. Admin row — status (active/inactive/suspended)
508. Admin row — relative last active
509. Create Role button (Roles tab)
510. Role card — name
511. Role card — description
512. Role card — "System" badge (when applicable)
513. Role card — permission count
514. Role card — user count
515. Role card — Edit icon
516. Role card — Delete icon
517. Invitations column: Email
518. Invitations column: Role
519. Invitations column: Sent
520. Invitations column: Expires
521. Invitations column: Status
522. Invitations column: Actions
523. Invitation row — email
524. Invitation row — role badge
525. Invitation row — sent relative time
526. Invitation row — expires date
527. Invitation row — status (pending/accepted/expired/revoked)
528. Invitation row — Resend button (when pending)
529. Invitation row — Revoke button (when pending)

### Actions
530. Click "Invite User" → open AddAdminModal
531. Search users by name/email → filter Users table
532. Click "Create Role" → open CreateRoleModal
533. Click Edit on role card → open CreateRoleModal in edit mode
534. Click Delete on role card → confirm → delete role
535. Type role name in modal
536. Type role description in modal
537. Toggle permission category checkbox → select/deselect all in category
538. Toggle individual permission checkbox
539. Click category header → expand/collapse
540. Click "Create Role" in modal → create role
541. Click "Update Role" in modal → update existing role
542. Click "Cancel" in modal → close
543. Type admin email in AddAdminModal
544. Click role dropdown in AddAdminModal → show roles
545. Select role in AddAdminModal
546. Click "Send Invite" → send invitation
547. Click "Cancel" in AddAdminModal → close
548. Click "Resend" on invitation → resend email
549. Click "Revoke" on invitation → revoke
550. Toast — "Invitation sent to [email] as [role]"
551. Toast — "Invitation resent"
552. Toast — "Invitation revoked"
553. Toast — "Role '[name]' created"
554. Toast — "Role '[name]' updated"
555. Toast — "Role '[name]' deleted"
556. Toast — API error message

---

## Role Permissions Page

### Data shown
557. Breadcrumb — "Dashboard / Admin Management / Role Permissions"
558. Page title — "Role Permissions"
559. Back button
560. Role card — "Super Admin" title
561. Role card — "Full platform access"
562. Role card — Shield icon
563. Role card — selected state styling
564. Role card — "Operations Admin" title
565. Role card — "User and transaction mgmt"
566. Role card — Users icon
567. Role card — "Dispute Officer" title
568. Role card — "Disputes and evidence"
569. Role card — Scale icon
570. Role card — "Finance Admin" title
571. Role card — "Escrow and finances"
572. Role card — Wallet icon
573. Create New Role card (dashed border)
574. Create New Role — Plus icon
575. Permissions Matrix section title
576. Permissions Matrix subtitle
577. Save Changes button
578. Column header — Permission
579. Column header — Super Admin
580. Column header — Operations Admin
581. Column header — Dispute Officer
582. Column header — Finance Admin
583. Column header — Description
584. Category — "User Management"
585. Permission — "View user profiles"
586. Permission 1 access dots per role
587. Permission 1 description — "Access user details"
588. Permission — "Edit user information"
589. Permission 2 access dots per role
590. Permission 2 description — "Modify user data"
591. Permission — "Suspend / Ban users"
592. Permission 3 access dots per role
593. Permission 3 description — "Account restrictions"
594. Permission — "Verify KYC documents"
595. Permission 4 access dots per role
596. Permission 4 description — "ID verification"
597. Category — "Transaction Management"
598. Permission — "View transactions"
599. Permission 5 access dots per role
600. Permission 5 description — "Read-only access"
601. Permission — "Release escrow funds"
602. Permission 6 access dots per role
603. Permission 6 description — "Approve fund release"
604. Permission — "Refund transactions"
605. Permission 7 access dots per role
606. Permission 7 description — "Process refunds"
607. Category — "Dispute Management"
608. Permission — "View disputes"
609. Permission 8 access dots per role
610. Permission 8 description — "Read-only access"
611. Permission — "Resolve disputes"
612. Permission 9 access dots per role
613. Permission 9 description — "Make decisions"
614. Permission — "Review evidence"
615. Permission 10 access dots per role
616. Permission 10 description — "Access attachments"
617. Permission — "Manage admin accounts"
618. Permission 11 access dots per role
619. Permission 11 description — "Super Admin only"
620. Legend — "Has Access" (green dot)
621. Legend — "No Access" (gray dot)
622. Legend — "Limited" (amber dot)

### Actions
623. Click "Back" → navigate to `/admin-management`
624. Click role card → set selected role
625. Hover role card → highlight
626. Click "Save Changes" → persist permission matrix (planned)
627. Click permission row → visual feedback (planned)
628. Click "Create New Role" card → open CreateRoleModal (planned)

---

**Total: 628 items.**

Format key:
- **Data shown** — things rendered on screen (labels, values, columns, charts, badges, counts).
- **Actions** — anything that changes state or navigates (clicks, form submissions, toasts, modals).
- **(planned)** — UI exists or is referenced but not yet wired to an API.
