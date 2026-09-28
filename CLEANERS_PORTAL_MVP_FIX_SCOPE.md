# Cleaners Portal — MVP Fix Scope

**Goal:** Make the portal reliable from booking confirmation through inspection, while distributing paid cleaning opportunities fairly and retaining Owner/CSR control.

## 1. Implement fair automatic and manual assignment

**Problem:** Existing automation runs at checkout, skips cleaning records already created during booking, and does not reliably balance automatic assignments, manual assignments, cancellations, and reassignments.

### Assignment timing

- Automatically assign cleaning when a guest’s booking is confirmed, using the stored `approved` booking status.
- Schedule cleaning for the guest’s checkout.
- Reuse an existing unassigned cleaning record.
- Processing the same confirmation again must not create another task or consume another turn.
- Advance assignment must not allow cleaning to start before the guest checks out.

### Fair rotation

- Every eligible cleaner receives one assignment before anyone receives their next assignment.
- With four cleaners: **Cleaner 1 → Cleaner 2 → Cleaner 3 → Cleaner 4 → repeat.**
- Finishing faster does not give a cleaner extra turns.
- An unfinished assignment does not by itself remove a cleaner from the rotation; actual availability determines eligibility.
- Manual assignments count toward the cleaner’s share. Future automatic assignments compensate by prioritizing cleaners with fewer retained or completed opportunities.
- Simultaneous confirmations must preserve the rotation without duplicate turns.

### Owner/CSR control

- Owner/CSR can manually assign or reassign a task.
- Automatic processing preserves existing assignments, including manual assignments and work already started.
- Record who made each assignment, whether it was automatic or manual, and subsequent reassignments.

### Cancelled and reassigned work

- If a booking is cancelled before cleaning is performed, the cleaner receives priority for a replacement assignment.
- If an unperformed task is reassigned, restore the original cleaner’s opportunity and count the task toward the receiving cleaner’s share.
- Completed cleaning continues to count toward the cleaner who performed it.
- Repeated processing of the same cancellation or reassignment must not restore an opportunity more than once.

### Availability and exceptions

- Assign only to active, available cleaners.
- If no cleaner is eligible, leave the task unassigned and notify Owner/CSR.
- Show why an assignment needs manual attention.
- Remove sample-data creation from the task-list endpoint.

### Acceptance examples

- **Four cleaners, four bookings:** each receives one assignment when all remain eligible.
- **Four cleaners, eight bookings:** each receives two assignments when all remain eligible.
- **Manual assignment to Cleaner 1:** it counts toward their share; automatic assignment prioritizes the others.
- **Cleaner 1 finishes first:** completion speed does not move them ahead in the rotation.
- **Cleaner 2’s booking is cancelled:** Cleaner 2 receives replacement priority.
- **An unperformed task moves from Cleaner 2 to Cleaner 3:** restore Cleaner 2’s opportunity and count the task toward Cleaner 3.
- **Two bookings confirmed simultaneously:** assignments remain fair without duplicate turns.
- **The same confirmation is processed twice:** only one cleaning task and one assignment opportunity are recorded.

**Fairness is measured by cleaning opportunities retained or completed—not simply by how many assignments were originally issued.**

## 2. Secure task access and inspection

**Problem:** Cleaners can modify other cleaners’ tasks and bypass inspection through general status APIs.

**MVP requirements:**

- Cleaners may update only tasks assigned to them.
- Only Owner/CSR may manually assign, reassign, approve, or reject work.
- Automatic assignment follows the controlled process in item 1.
- Enforce this sequence on the server: Assigned → In Progress → Awaiting Inspection → Ready.
- Rejection returns the task to In Progress with a required explanation.
- Remove unnecessary guest contact and payment details from cleaner responses.

**Acceptance:** A cleaner cannot approve a room or modify another cleaner’s assignment, including through direct API requests.

## 3. Make checklist completion and photo proof mandatory

**Problem:** Submission can automatically complete unfinished items, missing checklists can pass completion checks, and photo proof is not enforced.

**MVP requirements:**

- Require a valid checklist before completion.
- Verify all required checklist items on the server.
- Remove automatic completion of unchecked items.
- Require photo proof for every checklist task before submission.
- Verify that required photos have uploaded successfully and are linked to the correct assignment’s checklist.
- Block submission while required items or photos are missing, or uploads are still pending or have failed.
- Clearly identify which tasks still need completion or photo proof.
- Show submission and upload failures while retaining saved progress.
- Allow Owner/CSR to review the photos during inspection.

**Acceptance:** A cleaning task cannot advance to Awaiting Inspection until every required checklist item is complete and every task has successfully uploaded photo proof. Enforce these checks on the server, including for direct API requests.

## 4. Make both interfaces show accurate work

**Problem:** Desktop shows sample schedules and broader task lists, with limited automatic refreshing.

**MVP requirements:**

- Replace sample schedules with actual assignments and checkout-based cleaning dates.
- Show upcoming assignments created when bookings are confirmed.
- Apply consistent assignment visibility on mobile and desktop.
- Reflect cancellations, reassignments, and inspection feedback.
- Refresh assignments periodically.
- Distinguish loading, empty, and failed requests.
- Revert displayed status when an update fails.

**Acceptance:** Both devices show consistent assignments, schedules, and statuses; failed requests never appear successful.

## Release checks

- Test with four cleaner accounts, one Owner account, and one CSR account.
- Verify confirmation → automatic assignment → checkout → cleaning → inspection.
- Verify fair distribution across at least two full rotation rounds.
- Verify manual assignments count toward distribution and finishing faster gives no extra priority.
- Verify replacement priority after cancellation and reassignment, including repeated processing.
- Verify inactive or unavailable cleaners are skipped.
- Verify unassigned tasks show a reason and notify Owner/CSR.
- Verify repeated and simultaneous confirmations do not duplicate tasks or turns.
- Verify completed work retains its original cleaner attribution.
- Test incomplete checklists, inspection rejection, unauthorized API requests, and failed network requests.
- Pass automated workflow tests and the production build.

**Outside this MVP:** visual redesign, advanced performance dashboards, payroll calculation, offline support, expanded messaging, and advanced staff scheduling.

**Implementation order:** access controls → fair assignment and replacement handling → checklist validation → interface consistency.
