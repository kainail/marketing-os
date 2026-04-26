# Manus Task — Content Posting

**Task type:** Recurring execution task
**Runs:** After AHRI's content calendar is approved by Kai (distribution/queue/ready-to-post/)
**Operator:** Manus AI
**Human oversight:** Kai approval required before this task file is run — never auto-triggered

---

## STEP 0 — ACCOUNT VERIFICATION (REQUIRED — DO NOT SKIP)

Before posting anything, verify which accounts you have access to.

1. Open Facebook. Check: are you logged into the Anytime Fitness gym's Facebook Page, or a personal account? If you are on a personal account, stop. Do not post. Send this message: "MANUS BLOCKED — logged into personal Facebook account. Kai must log into the gym page before this task can run."

2. Open Instagram. Check: are you logged into the gym's business Instagram profile? The profile name should be the gym's name. If you see a personal name or personal photos, stop. Do not post. Send this message: "MANUS BLOCKED — personal Instagram account detected. Kai must log into the gym account."

3. Open Google Business Profile (business.google.com). Check: does the gym's business listing appear in your account? If you see "no business found" or a personal Google account, stop. Send: "MANUS BLOCKED — Google Business Profile not accessible. Kai must connect the gym's Google account."

If all three accounts are verified — continue to Step 1.

---

## STEP 0B — READ THRESHOLDS (REQUIRED BEFORE POSTING)

Before posting any content, open: `knowledge-base/paid-media/thresholds.md`

Scan the queue for any post flagged with [BUDGET APPROVAL REQUIRED: $X].
If any post carries this flag:
  DO NOT post it.
  Log it as: "MANUS SKIPPED — [post name] has [BUDGET APPROVAL REQUIRED] flag. Kai must approve budget before this posts."
  Continue with all other posts normally.

---

## STEP 1 — READ THE APPROVED CONTENT QUEUE

1. Open the file at: `distribution/queue/ready-to-post/content-calendar-[date].md`
   If the file is not there, stop. Send: "MANUS BLOCKED — no approved content found in ready-to-post/. Nothing to post."

2. Read the full calendar. Note:
   - How many pieces are scheduled for today
   - What platform each piece is assigned to
   - What time each piece should post
   - Which pieces have a real photo assigned vs. an image brief

3. If a piece has an image brief (not a real photo): do not post that piece today. Mark it as "image brief pending — requires image generation." Send: "MANUS NOTE — [N] pieces have image briefs that need to be generated before posting. These are skipped today."

4. If a piece has a real photo assigned: confirm the photo file exists in the approved media folder before proceeding to post.

---

## STEP 2 — FACEBOOK POSTS

For each piece assigned to Facebook (check the "Platform" field in the calendar):

1. Go to the gym's Facebook Page
2. Click "Create Post"
3. Copy the COPY field from the calendar entry exactly — word for word, no edits
4. Add the assigned photo (real photo filename from calendar)
5. Do NOT add hashtags on Facebook — Facebook posts do not use hashtags
6. Set the post to publish NOW (not scheduled) unless the calendar specifies a future time
7. If a future time is specified: click "Schedule for later" and enter the exact day and time from the calendar
8. Publish or schedule the post
9. Screenshot the published/scheduled post for the end-of-task log

Repeat for each Facebook piece.

---

## STEP 3 — INSTAGRAM POSTS

For each piece assigned to Instagram (Feed, Stories, or Reels — check the "Platform" field):

**Instagram Feed post:**
1. Open Instagram (business account confirmed in Step 0)
2. Tap the + icon to create a new post
3. Select the assigned photo
4. Copy the COPY field exactly as written — this is the caption
5. Add the hashtags listed in the calendar entry (Instagram only — 5–8 hashtags)
6. Set location tag if the calendar specifies one
7. Post immediately or use Meta Business Suite to schedule if a specific time is listed
8. Screenshot confirmation

**Instagram Stories:**
1. Go to Stories
2. Use the assigned image or the text overlay as specified in the calendar
3. Copy any text from the COPY field exactly — place it on the story as specified
4. Include the link sticker if the calendar specifies a CTA link
5. Publish immediately — Stories cannot be meaningfully scheduled in advance
6. Screenshot confirmation

**Instagram Reels:**
1. The calendar provides a 60-second script — this must be recorded as video, not uploaded as text
2. If no video has been recorded for this Reel: skip it. Send: "MANUS NOTE — Reel [piece number] requires a video recording. Piece skipped — recording needed."
3. If a video file is provided: upload it, use the caption from the COPY field, add hashtags, publish

---

## STEP 4 — GOOGLE BUSINESS PROFILE POSTS

For each piece assigned to Google Business Profile:

1. Go to business.google.com
2. Select the gym's listing
3. Click "Add update" (for standard updates) or "Add offer" (if the calendar specifies an offer post)
4. Copy the COPY field exactly as written
5. Add the assigned photo if one is specified
6. If the calendar specifies a CTA button: select the correct button type (Book, Call, Learn more) and paste the URL
7. Publish
8. Screenshot confirmation

Note: GBP posts expire after 7 days by default. The calendar accounts for this — one GBP post per week is sufficient.

---

## STEP 5 — END-OF-TASK LOG

After posting all pieces for the day:

Create a log entry in this format:

```
MANUS POSTING LOG — [DATE]

Accounts verified: Facebook ✓ / Instagram ✓ / GBP ✓ (note any ✗ with reason)

Facebook posts published today: [N]
- Piece [N]: [first 5 words of caption] — Published at [time] / Scheduled for [time]

Instagram feed posts: [N]
- Piece [N]: [first 5 words of caption] — Published at [time]

Instagram Stories: [N]
- Piece [N]: [description] — Published at [time]

Instagram Reels: [N published] / [N skipped — video needed]

Google Business Profile posts: [N]
- Piece [N]: [first 5 words of caption] — Published at [time]

Pieces skipped today: [N]
- Piece [N]: [reason — image brief pending / video needed / account access blocked]

Total posted: [N] of [N scheduled for today]
```

Save this log to: `distribution/queue/posted/posting-log-[DATE].md`

Move the calendar file from `ready-to-post/` to `posted/` after all pieces are confirmed published.

---

## WHAT MANUS NEVER DOES

- Never edits the copy — post exactly what is written in the calendar
- Never adds emojis, hashtags, or commentary that isn't in the calendar
- Never posts from a personal account
- Never posts to any platform not listed in the calendar for that piece
- Never posts content that has not been through the approved ready-to-post/ queue
- Never skips the account verification step — even if "obviously" correct
