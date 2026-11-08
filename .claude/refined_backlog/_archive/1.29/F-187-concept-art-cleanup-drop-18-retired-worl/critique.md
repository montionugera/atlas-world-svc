# F-187 critique: click-to-enlarge lore art

Checked with real clicks in Chromium (Playwright) against the worktree server, lore tab, Maro Folk sheet:
- Desktop 1280x800: image 1152x768, fits the viewport, no horizontal scroll, Escape removes the overlay.
- Phone 390x844: image 358x239, fits the width with an 16px gutter, no horizontal scroll, Escape removes the overlay.
- Desktop also checked in Chrome with a real mouse click; overlay opened and closed.

Findings:
- P2: on a phone the landscape sheet is only 358px wide, so small labels stay hard to read. Mitigation: native pinch-zoom works on the fixed overlay; a dedicated pan/zoom view is a possible follow-up, not needed to ship.
- P3: no visible close button; dismissal is click-anywhere or Escape. Matches the cursor hint but is less discoverable on touch.
- P3: the overlay does not trap focus. Acceptable for a single image, Escape works from the document.

Anti-pattern scan: no side stripes, gradient text, glass cards or eyebrows added; reuses existing tokens and the overlay's z-index.

Verdict: ship. P2/P3 items are follow-ups.
