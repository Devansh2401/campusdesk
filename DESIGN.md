# CampusDesk 

### 1. Overlap Checking Logic

To prevent double-bookings, the system detects if a new booking request overlaps with any existing confirmed booking. 

An overlap happens if:
* The existing booking starts before the new one ends, **AND**
* The existing booking ends after the new one starts.

In SQL, the check looks like this:
```sql
startTime < proposed_endTime AND endTime > proposed_startTime
```

#### Why back-to-back bookings work:
Let's say user A has a booking from `10:00 to 11:00`, and user B tries to book `11:00 to 12:00`.
* Part 1: Does A start (`10:00`) before B ends (`12:00`)? **Yes (True)**.
* Part 2: Does A end (`11:00`) after B starts (`11:00`)? **No (False)**. Since `11:00` is not strictly greater than `11:00`, this condition is false.

Because the second condition is false, the overlap check returns false, meaning there is no conflict. The booking goes through successfully, allowing seamless back-to-back slots.

---

### 2. Double-Booking Concurrency (Race Conditions & Admin Approval)

Initially, student bookings are created in a "Pending" status. The actual confirmation and double-booking prevention happen when the admin approves the booking.

If the admin tries to approve two overlapping pending bookings at the same time, the system blocks the second one using two locks:
1. **Database-level Lock**: I wrapped the check and the status update inside a write transaction using `BEGIN IMMEDIATE TRANSACTION;` in SQLite. This immediately locks the database file for writing. Any other concurrent write request is forced to wait in a queue. By the time the second request gets the lock, the first booking has already been approved and saved, so the overlap check runs again and correctly blocks the duplicate.
2. **App-level Lock**: I added a simple JavaScript Promise-queue (`acquireLock`) inside the Express routes to make concurrent requests run one after another in the backend code before they even hit the database.

---

### 3. Logins and Session Persistence (Hard Refresh)

I used passwordless OTP authentication combined with JSON Web Tokens (JWT) for session management:
* When a user logs in, the backend issues a signed JWT containing their `userId` and `role`.
* On the client side, the token and user metadata are saved in `localStorage` as `campusdesk_token` and `campusdesk_user`.
* **On a hard refresh**: A shared script (`client/js/auth.js`) automatically runs on every page load. It reads `campusdesk_token` from `localStorage`. If it exists, it decodes the payload on the fly (to retrieve name and role to build the navbar) and injects the token into the `Authorization: Bearer <token>` header for all subsequent API requests.
* If the token is missing or if the server responds with a `401 Unauthorized` (indicating the token expired or was modified), the script automatically clears `localStorage` and redirects the user back to the `/login` page.

---

### 4. What Didn't Work & How I Debugged It (Timezone Mismatch)

During testing, I ran into a bug where the overlap checking logic started failing and allowed duplicate bookings. 

* **The Problem**: JavaScript serialized some Date objects as local times (e.g. `2026-08-06T10:00:00`) while others were formatted as UTC ISO strings with milliseconds and a 'Z' at the end (e.g. `2026-08-06T10:00:00.000Z`). SQLite stores dates as plain text and compares them using string matching. Because the strings didn't look identical text-wise, the overlap query returned no matches even though they represented the exact same time.
* **How I Debugged It**: I logged the raw SQL queries and variables being sent to the database. I noticed that the timestamps stored in the database had different formats than the ones in the incoming `SELECT` query.
* **The Fix**: I standardized date serialization in the backend. Before writing any date to the database or running an overlap check, I passed the timestamp through the JavaScript `Date` constructor and formatted it using `.toISOString()`. This guarantees that SQLite is always comparing standardized, identical string formats.
