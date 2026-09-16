# What a scanner cannot see

Every automated accessibility tool reports what it found. None report what they
are structurally unable to look for. That silence is the most expensive thing
in the category, because a clean report reads as a clean site to the person
paying for it.

## The number people quote, and what it actually means

The figure usually given is that automated tools catch around a third of WCAG
issues. It gets repeated as though the remaining two thirds were minor. They
are not. They are where operability lives.

Sort the Level A and AA criteria by what a machine can decide and the split is
not random. Machines are good at questions with a syntactic answer: does this
image have an `alt` attribute, is this contrast ratio above 4.5, does this
`label` point at an input that exists. Machines are blind to questions whose
answer requires operating the page or judging a result: can this drawer be
closed with a keyboard, is the focus ring visible on the dark footer, does this
alt text describe the right image.

The second list is what stops people using a site.

## Eleven checks, and why each one resists automation

### 1.4.10 Reflow

A scanner reads the DOM at one viewport. Whether a layout is usable at 320 CSS
pixels needs the page rendered at 320 pixels and a judgement about whether the
horizontal scrolling that remains is the permitted kind. Data tables and maps
are allowed to scroll sideways. A paragraph is not.

**Test.** 320 by 256, or a 1280px window zoomed to 400 per cent. Read a full
paragraph. If you scroll sideways to finish a sentence, it fails.

### 1.4.11 Non-text contrast

Automated contrast checks cover text, because text is the case where the
foreground and the background are both unambiguous. An input border, a focus
ring or an icon requires first deciding which part of the component carries the
meaning, and that is a judgement about the design.

**Test.** Sample the border of every form field, the focus ring against every
background it appears over, and any icon that is the only indicator of state.
3:1 against what sits behind it.

### 2.1.1 Keyboard

`<div onclick>` and a decorative `<div>` are the same thing in the DOM until
somebody tries to use them. There is no static signal that separates a control
from a box.

**Test.** Unplug the mouse and complete the primary task of the page.

### 2.1.2 No keyboard trap

A trap is a runtime behaviour. It exists only once a modal, drawer or embedded
player has been opened, and a static scan opens nothing.

**Test.** Open every modal, drawer, menu and third-party embed with the
keyboard. Escape closes it, focus moves inside on open, focus returns to the
trigger on close.

### 2.4.3 Focus order

Source order is machine-readable. Whether the resulting sequence is meaningful
after CSS grid or flex ordering has rearranged it visually is a reading
comprehension task.

**Test.** Tab through and watch the ring. It should move the way the eye reads.

### 2.4.7 Focus visible

A scanner can find `outline: none`. It cannot tell whether the custom indicator
that replaced it survives the dark footer, the hero image, or a button whose
background happens to match the ring.

**Test.** Tab across every distinct background on the page.

### 2.4.11 Focus not obscured

Requires knowing what is painted on top of the focused element at the moment it
receives focus. Sticky headers, consent bars and chat widgets all arrive after
the scan has finished reading the DOM.

**Test.** Tab down a long page with the sticky header showing, then again with
the cookie bar and the chat widget open.

### 1.1.1 Alternative text quality

The attribute is checkable. The text is not. `alt="image"`,
`alt="DSC_0041.jpg"` and a careful description of the wrong image all pass
every automated check on the market.

**Test.** Read the alt text of the ten most important images with images off.
Decorative images are `alt=""`. An image inside a link describes the
destination, not the picture.

### 1.3.5 Identify input purpose

Whether a field collects the user's own details or somebody else's is not
visible in the markup, and that is exactly what decides whether an
`autocomplete` token is required or wrong. A gift recipient's address should
not carry one.

### 3.2.2 On input

This is about what happens after a change event, and a scanner fires no change
events.

**Test.** Change every select and radio group. Nothing navigates, submits or
moves focus without a warning given beforehand.

### Screen reader pass

Correct ARIA and a comprehensible announcement are different things. A control
can be perfectly named in the accessibility tree and still be announced as
something nobody can act on.

**Test.** One pass with NVDA on Firefox or Chrome, one with VoiceOver on
Safari. Navigate by heading, by landmark, by form field. Complete the primary
task on announcements alone.

## Why this is printed on clean pages too

A register that only appears when something is wrong trains people to read its
absence as a pass. It prints every time, it is never counted as a finding, and
it never fails a budget. Failing a build for something no machine can verify
teaches people to delete the check, which loses the argument entirely.
