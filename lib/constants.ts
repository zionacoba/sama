export const DEFAULT_WAIVER_TEXT = `I understand that outdoor activities involve inherent risks including but not limited to physical injury, accidents, and unpredictable weather conditions. I voluntarily participate in this trip organized by [Organizer Name] and assume all risks associated with it. I confirm that I am physically fit to participate. I understand that sharing any relevant medical conditions with the organizer is optional but strongly recommended for my safety. I release the organizer from liability for any injury, loss, or damage arising from my participation, except in cases of gross negligence. I have read and understood the cancellation policy for this trip.`;

// Adults-only attestation. The booking-level sentence is what the booker checks
// in the booking modal; the participant-level sentence is what each participant
// checks on /join. Both are folded into the stored waiver snapshots so there is
// a durable record of exactly what was agreed to.
export const ADULT_ATTESTATION_BOOKING_TEXT =
  "I confirm that I and all other participants in this booking are 18 years of age or older.";

export const ADULT_ATTESTATION_PARTICIPANT_TEXT =
  "I confirm I am 18 years of age or older.";

// Snapshot of the platform terms stored on every booking row at creation time.
export const PLATFORM_WAIVER_SNAPSHOT_TEXT = `By completing this booking, I agree that Sama is a technology marketplace that connects participants with independent trip organizers. Sama is not responsible for the conduct, acts, or omissions of organizers. I voluntarily assume all risks associated with outdoor activities. ${ADULT_ATTESTATION_BOOKING_TEXT}`;

// Snapshot of the organizer agreement shown on the apply form. Stored verbatim
// on the organizer row at acceptance time, per Sections 1 and 28 of the terms.
export const ORGANIZER_TERMS_VERSION = "1.0";

export const ORGANIZER_TERMS_TEXT = `SAMA ORGANIZER TERMS

1. What this is

These are the terms between Sama (sama.com.ph), operated by Paul Zion Acoba, and you as an organizer.

You accept them when you tick the box on your application. They apply from that moment, and they continue until they end under Section 19.

We keep a copy of the exact wording you agreed to, along with the date. If we change these terms later, the version you agreed to is the one that applies to you unless you agree to a new one.

The Sama Terms of Service and Privacy Policy on sama.com.ph also apply to you. Where they differ from these terms on something specific to organizers, these terms govern.

These terms form a binding agreement between Sama and you when you accept them through the application process. You agree that electronic acceptance, together with our records of the accepted version, the date and time of acceptance, and other transaction records, may be used as evidence of your agreement.

2. What Sama does, and what Sama does not do

Sama is a booking platform. We list your trips, take bookings, collect payment from joiners, and pass that payment to you less our commission.

You run the trip. We do not. We are not the tour operator or the guide. We do not plan your itinerary, check your route, supervise your participants, or decide whether it is safe to go ahead on the day. Those stay with you.

You set your own prices and your own schedule, you may list on other platforms, and you may take bookings directly.

You are an independent contractor. Nothing in these terms creates an employment, agency, partnership, joint venture, franchise or fiduciary relationship between Sama and you. You have no authority to represent, bind or make commitments on behalf of Sama. You are solely responsible for your guides, employees, contractors, drivers, vessels, equipment, suppliers and any other person you use to run a trip. Sama does not supervise those people and does not guarantee their acts or omissions.

3. Applying, and being approved

Ticking the box means you accept these terms. It does not mean you are approved. We review every application and we may decline without giving a reason.

If we approve you, you can list trips. Until then you cannot.

By applying, and for as long as you remain an organizer, you confirm that:

- Everything in your application is true.
- You hold, and will keep current, all permits, licences, registrations, accreditations, consents and other authorisations required by law or by the relevant national or local authority for every trip you offer.
- You will comply with all applicable laws, regulations, safety requirements, destination rules and lawful government orders.
- You will not accept anyone under 18. Sama is an adults-only platform.
- You will tell us promptly if something material changes — your contact details, your ability to run a trip you have listed, or any incident on a trip.

We may ask you for reasonable evidence of compliance, and may unpublish a trip if you do not provide it.

4. Your trips and your prices

You set your own price for every trip.

If you offer a deposit option, the deposit must be at least 10% of the trip price, and the rest is due before the trip runs.

Everything in your listing must be accurate — the itinerary, the difficulty, what is included, the meeting point, and what participants need to bring or be able to do.

You must promptly update a listing when a material fact changes, including the route, schedule, inclusions, exclusions, difficulty, meeting point, equipment, transport, permit status or safety conditions.

You must not describe Sama as the operator, guide, insurer or guarantor of your trip.

We may unpublish or ask you to change a listing that is inaccurate, unsafe, or breaks these terms. Where we can, we will tell you first.

5. Bookings and payment

Joiners book and pay through Sama. We receive that payment and pass it on to you under Section 7.

A booking accepted through Sama is your obligation to provide the listed trip, subject to these terms and any lawful cancellation, refund or force-majeure provision.

The trip itself is between you and the joiner. Our part is taking the booking, collecting the money, and paying you.

We use third-party payment providers. Payment reversals, chargebacks and disputes may be deducted, withheld or recovered under these terms.
6. Our commission

Sama's commission is a percentage of the trip price on each booking. That is the only thing we take.

Your rate is the rate we approve you at, and we show it to you and read it back when we approve you. Different organizers may be on different rates.

To be clear about what the rate means: we work out the commission from the full price of every slot booked — so at 5%, a ₱3,000 trip booked for four people is a ₱12,000 booking and our commission is ₱600. We then take that ₱600 out of the money we are holding for you.

If a joiner pays you part of the price directly — a balance handed over in cash on the day, for example — we never see that money, so we cannot take our share from it. The full ₱600 still comes out of the part we are holding. Your payout for that booking will be smaller than the headline rate might suggest, because the commission is the same but the amount we are holding is less. A direct payment does not reduce the commission due to Sama.

Refunds, discounts, credits, chargebacks and payment reversals may be reflected in the commission reconciliation for the affected booking.

We pay the payment processing fees ourselves. GCash and Maya charge us a fee on every transaction and we absorb it — it is not passed on to you and not deducted from your payout.

As a founding partner, your rate will not go up. We may charge new organizers more in future; yours stays where it started.

The one exception: if GCash or Maya raise the processing fees they charge us, we may pass that increase on. We would tell you before it took effect, and it would only ever be the amount their fees went up by. Nothing else changes your rate.

Founding-partner terms apply to the first 20 organizers we approve, and only to organizers approved on or before 30 September 2026 — whichever limit is reached first. After that, our standard rate at the time applies.

7. Getting paid

We pay out to the payout details you give us after approval.

Most bookings become payable about two days after the booking is made, before your trip runs. Two kinds wait until after the trip has run: bookings made in the final week before departure, and balances paid to us online.

Payouts are prepared by hand. We run them regularly and will tell you when yours is on its way. There is no fixed payout day.

We take our commission before paying out.

We may delay, withhold or reserve all or part of a payout where reasonably necessary because of a refund, chargeback, payment reversal, suspected fraud, payment dispute, unresolved safety complaint, suspected breach of these terms, or an amount you owe Sama. We will tell you the reason where reasonably practicable, and pay out once it is resolved. We may apply amounts we owe you against amounts you owe us.

Keeping your payout details correct is up to you. We cannot recover money sent to details that turn out to be wrong.

8. When a joiner cancels

Every trip has a cancellation policy that you choose when you list it. Joiners see it before they book, and it decides what they get back.

Flexible
- 7 or more days before the trip: Full refund
- 3 to 6 days before: 50% refund
- Less than 3 days before: No refund

Moderate
- 14 or more days before: Full refund
- 7 to 13 days before: 50% refund
- Less than 7 days before: No refund

Strict
- 30 or more days before: Full refund
- 7 to 29 days before: 50% refund
- Less than 7 days before: No refund

Days are calendar days, counted in Philippine time, to the trip's start date. Each threshold is inclusive.

Nothing in a cancellation policy removes a refund or other right that cannot lawfully be excluded.

Sama makes the refund. If it happens before we have paid you, we pay you the reduced amount. If it happens after, Section 9 applies.

9. Refunds we have already paid out to you

Sometimes a refund becomes due after we have already sent you the money — usually a late cancellation, or a trip you cancelled after being paid.

When that happens, the refunded amount becomes immediately due to Sama.

We may deduct it from your next payout, or from any other amount payable to you. If no further payout is due, you must pay it within ten (10) calendar days of our written demand. You remain responsible for the amount even after your account is closed.

We will always tell you what it is for and which booking it relates to.

10. When you cancel

If you cancel a trip date, every joiner on it is refunded in full everything they paid through Sama — whatever that trip's cancellation policy says, however close to the day you cancel, and whatever the reason. That includes weather, illness, and events outside your control. Section 20 does not change this.

We can only refund what went through us. If a joiner paid you part of the price directly, that part is between you and them, and you should return it to them yourself.

If a trip cannot run on its date but can run on another, change the date rather than cancelling. Your listing keeps its bookings and its joiners keep their slots. Cancelling refunds everyone and ends that date.

You can cancel a trip date yourself from your dashboard. Once we have already sent you the payout for it, you cannot cancel it yourself — email hello@sama.com.ph and we will sort it out with you.

Note that cancelling cancels that date, not your whole listing.

Cancelling often, or cancelling close to departure, is something we will raise with you and may act on under Section 19.
11. Transfers between joiners

A joiner can pass their slot to someone else before the trip. Any money between those two people is their own arrangement and does not go through Sama.

The replacement gives their own details and accepts your waiver in their own name, and their record replaces the previous person's for that slot. Treat them as your participant, not as the original booker.

A transfer is subject to reasonable verification. You may refuse a replacement participant who does not meet applicable age, safety, permit, capacity or other lawful participation requirements.

12. Waivers and safety

You provide the waiver for your own trip. It should describe the real hazards of your activity — not generic adventure risk. A hiking waiver that never mentions altitude or weather is not doing its job.

Every participant is asked to accept your waiver through their own personal link before the trip, and we record the acceptances we receive.

Before your trip leaves, it is your job to check that everyone on it has accepted your waiver. A booking being paid and confirmed does not by itself mean every person on it has signed.

Sama collecting or displaying a waiver is not an inspection, certification or approval of the safety of your trip.

13. Organizer responsibility

You are solely responsible for running your trip safely and lawfully.

That includes selecting and supervising your guides and other personnel, assessing conditions and hazards, giving appropriate safety instructions, providing appropriate equipment, deciding whether a participant is suitable, staying within capacity and permit limits, keeping workable emergency procedures, and deciding whether to go ahead, change, postpone or stop the trip.

14. Insurance

Sama does not provide any insurance covering you, your trips, or your participants. Nothing on the platform should be read as Sama insuring anything.

We may require you to carry appropriate insurance, and to show us reasonable proof of it, where the nature or risk of an activity makes that appropriate.

15. Joiner information

To run a trip you receive personal information about your participants — names, contact details, emergency contacts, and any medical information they choose to share. Medical information is sensitive personal information under the Data Privacy Act.

You agree to:

- Use it only to run that trip and to contact those participants about it.
- Not use it for marketing or add it to any mailing list.
- Not share or sell it to anyone.
- Limit access to people who need it for the trip.
- Keep it secure and confidential.
- Delete or return your own copies once the trip is done and you no longer need them, subject to any lawful retention requirement.

Tell us promptly about any actual or suspected unauthorised access, disclosure, loss or other personal-data breach involving participant information you received through Sama.

We both comply with the Data Privacy Act of 2012 and applicable National Privacy Commission issuances. Our respective roles as personal information controllers or processors will be determined by the actual data-processing arrangement and documented in the applicable privacy terms or data-processing agreement.

Sama deletes booking-level medical and emergency-contact information a set period after the trip ends, as described in our Privacy Policy. Records showing that someone accepted a waiver are kept longer, because they are the proof that it happened.

If a participant asks you to delete their information, or asks what you hold, tell us and we will handle it together.

16. Taxes and withholding

You are responsible for your own taxes, registrations, filings and reporting arising from your activities and your payouts, except where Sama is required by law to withhold, report or remit an amount.

Sama may make any withholding or deduction required by law, and may ask you for tax information or documents reasonably necessary for compliance.

17. Your content

You own your own photos and trip descriptions. Listing on Sama does not hand them to us.

By listing, you give Sama a non-exclusive, worldwide, royalty-free licence to host, reproduce, display, adapt for formatting, and promote your trip content on the platform and in Sama's marketing, while you are an organizer and for a reasonable period afterwards in connection with listings or campaigns already published.

You confirm you have all rights, permissions and consents needed for that content and for the licence above, including any permission required for identifiable people shown in photographs or video.

Sama's own name, branding and platform content stay ours.

18. Being straight with people

Treat joiners honestly and respectfully. Honour what your listing promises.

You must comply with applicable anti-discrimination, consumer-protection and safety laws. You must not misrepresent the trip, conceal a material risk, or retaliate against a participant for making a good-faith complaint.

Tell us promptly about any serious incident, injury, death, law-enforcement involvement, or material complaint connected with a Sama booking.

19. Ending this

These terms are open-ended. They run until one of us ends them.

Ordinary ending. Either of us can end this by telling the other. Where trips are already booked, these terms stay in force for those trips so you can run them and get paid for them, and you may not list new trips in the meantime. It ends once the last booked trip has run and been paid out.

Immediate ending. Where there is a safety risk, dishonesty, or a serious breach of these terms, Sama may end this immediately. If we do, your remaining trips are cancelled and every affected joiner is refunded in full, and Section 9 applies to any money already paid to you for them.

Corrective action short of ending. While we look into a safety concern, suspected fraud, material breach, regulatory issue, payment dispute or privacy incident, we may unpublish a trip, stop accepting new bookings on it, or hold a payout. Where appropriate we will tell you what we need you to correct, and we will lift it once the issue is resolved. Doing this does not waive any other right or remedy.

What carries on afterwards: anything about payment obligations, refunds, indemnity, liability, confidentiality, data protection, intellectual property, dispute resolution and records that by its nature should survive. That includes our right under Section 9 to recover refunds already paid to you, your obligations under Section 15 about joiner information, and our keeping of waiver and consent records.

20. Force majeure and safety events

Neither of us is responsible for a failure or delay caused by an event beyond our reasonable control, including severe weather, typhoon, earthquake, flood, volcanic activity, epidemic or public-health emergency, war, civil disturbance, government order, destination closure, or a comparable event (a Force Majeure Event).

If a Force Majeure Event or an objectively unsafe condition makes a trip impracticable or unsafe, do not run it. Take reasonable steps to protect your participants and tell us promptly.

Section 10 still applies in full. If you cancel the date, every joiner is refunded everything they paid through Sama. A Force Majeure Event does not reduce that refund. Where the trip can run on another date, changing the date rather than cancelling keeps your bookings in place and is usually better for everyone.
21. Your representations and warranties

You represent and warrant that:

(a) the information you provide to Sama is true, complete and not misleading;
(b) you have authority to enter into these terms and to operate each trip you list;
(c) you hold all permits, licences, registrations, accreditations and consents required for your activities;
(d) your trips and their operation comply with applicable law;
(e) you will use competent and appropriately qualified personnel where required;
(f) your uploaded content does not infringe another person's rights; and
(g) you will promptly tell Sama if any of these statements becomes materially untrue.

22. Indemnity

To the extent permitted by law, you agree to defend, indemnify and hold harmless Sama, its owners, officers, employees and agents from third-party claims, losses, liabilities, damages, penalties, costs and reasonable expenses arising out of or relating to: (a) your trip or its operation; (b) your negligence, wilful misconduct or unlawful act or omission; (c) your breach of these terms; (d) injury, death or property damage caused by your trip, personnel, contractors or suppliers; (e) your failure to obtain required permits or insurance; or (f) your breach of applicable data-protection or intellectual-property obligations.

Sama will give you reasonably prompt notice of a covered claim and may participate in its defence. You may not settle a claim in a way that admits fault by, or imposes an obligation on, Sama without Sama's prior written consent.

23. Limitation of liability

To the extent permitted by law, Sama is not liable for indirect, incidental, special, exemplary or consequential loss, loss of profit, loss of business or loss of goodwill arising from your trip or your use of the platform.

Sama is not responsible for the acts or omissions of you or your personnel, contractors, suppliers or participants.

Except for liability that cannot lawfully be limited, Sama's aggregate liability arising out of these terms will not exceed the total commissions actually retained by Sama from your bookings during the twelve (12) months immediately before the event giving rise to the claim.

24. Governing law and dispute resolution

These terms are governed by the laws of the Republic of the Philippines, without regard to conflict-of-law rules.

We will first try in good faith to resolve a dispute through written notice and discussion. If it is not resolved within thirty (30) calendar days, either of us may pursue the remedies available under Philippine law in the proper courts.

The parties agree to the exclusive jurisdiction of the courts of Mandaluyong City, Metro Manila, Philippines, subject to applicable law.

25. Changes

We may update these terms. Changes apply to organizers who join after the change.

If we want a change to apply to you, we will ask you to accept the new version, and you can end this under Section 19 instead. The exception is a change required by law or regulation, where we will give you the notice the law requires.

26. Getting in touch

Email us at hello@sama.com.ph.

Contractual notices to you may be sent to the email address on your application. Notices to Sama may be sent to hello@sama.com.ph. A notice is treated as received when it is sent without a delivery-failure message, unless the sender later receives notice that the address is invalid.

27. General

Entire agreement. These terms, together with the Sama Terms of Service, Privacy Policy and any organizer-specific policies we expressly incorporate, form the agreement about your use of Sama as an organizer.

Severability. If a provision is unenforceable, the rest stays effective, and the invalid provision is modified only as far as necessary to make it enforceable.

Waiver. Not enforcing a provision once does not waive the right to enforce it later.

Assignment. You may not assign these terms or your organizer account without Sama's prior written consent. Sama may assign these terms in connection with a merger, sale, reorganisation or transfer of the platform, subject to applicable law.

No third-party beneficiaries. Except as expressly stated, these terms do not give rights to anyone who is not a party to them.

28. Electronic acceptance and records

You agree that accepting these terms by electronic means, including ticking an acceptance box or using another acceptance mechanism we provide, is your electronic agreement to these terms.

Sama may keep the accepted version of the terms, the acceptance date and time, the IP address, and related transaction records as evidence of the agreement. Electronic records and communications may be used to establish our agreement and transactions, subject to applicable law.
`;
