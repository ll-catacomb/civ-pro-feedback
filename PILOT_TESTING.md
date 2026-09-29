# TA Pilot Testing

Use the production app at <https://civ-pro-feedback.vercel.app/> in a private or
incognito browser window. Sign in with the exact Harvard Google account supplied
to the course roster; there is no separate access code.

## Suggested test

1. Confirm that sign-in opens the material-animal student dashboard and shows
   five available attempts for a new account.
2. Submit a practice response in the same form a student would use: full exam
   or one question, and prose or bullet-point outline.
3. Confirm that the progress page appears promptly. It is safe to close the tab
   once the submission is queued.
4. Reopen **My feedback**, select the submission, and confirm that progress or
   completed feedback is still available.
5. Check that the displayed attempt count changes only after feedback finishes.

## Reporting a problem

Please send the course team:

- the approximate time and timezone;
- the page or progress step where the problem appeared;
- the exact on-screen message and error reference, if one is shown;
- the browser and device type; and
- whether **My feedback** shows the submission after reloading.

Do not email the practice answer itself unless the course team specifically
requests it through an approved channel. If Google sign-in is rejected, report
the Harvard address shown in Google's account chooser privately so the roster
entry can be checked.

## Course-team triage

- A rejected Google account usually means the OAuth address and private roster
  address differ. Correct the private mapping; do not add emails to Vercel or
  the feedback workbook.
- If a submission is visible as **In progress**, do not ask the tester to submit
  it again. The durable workflow may still be running.
- A **Failed** or **Refunded** submission has released its attempt. Use the
  displayed error reference to correlate the Sheets row and Vercel log before
  asking the tester to retry.
- If the browser loses its session, sign in again and open **My feedback**. A
  queued submission is stored independently of the browser tab.
