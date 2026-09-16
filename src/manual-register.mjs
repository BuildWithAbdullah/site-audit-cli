/**
 * The criteria a scanner cannot decide, and the test that does decide them.
 *
 * Every automated accessibility tool reports what it found. None of them
 * report what they are structurally unable to look for, which is how a client
 * ends up with a clean report and a lawsuit. This register is printed in every
 * accessibility run, whether or not axe found anything, and it is not
 * suppressible.
 *
 * Each entry names the criterion, why the machine is blind to it, and the
 * specific thing a person does to settle it. Source: WCAG 2.2 Levels A and AA.
 */
export const MANUAL_REGISTER = [
  {
    id: 'manual/1.4.10',
    wcag: ['1.4.10'],
    level: 'AA',
    title: 'Reflow at 320 CSS pixels',
    whyMachineBlind:
      'A scanner reads the DOM at one viewport. Deciding whether a layout is usable at 320px needs the page rendered at 320px and a judgement about whether the sideways scrolling that remains is acceptable.',
    howToTest:
      'Set the browser to 320 by 256 CSS pixels, or zoom a 1280px window to 400 per cent. Read a full paragraph. If you scroll horizontally to finish a sentence, it fails. Data tables and maps are the allowed exceptions.',
  },
  {
    id: 'manual/1.4.11',
    wcag: ['1.4.11'],
    level: 'AA',
    title: 'Non-text contrast',
    whyMachineBlind:
      'Automated contrast checks cover text. Deciding the contrast of an input border, a focus ring or an icon requires knowing which part carries the meaning, and that is a judgement about the design.',
    howToTest:
      'Sample the border of every form field, the focus ring on every background it appears over, and any icon that is the only indicator of state. Each needs 3:1 against what sits behind it.',
  },
  {
    id: 'manual/2.1.1',
    wcag: ['2.1.1'],
    level: 'A',
    title: 'Keyboard operability',
    whyMachineBlind:
      'A div with a click handler is indistinguishable from a decorative div in the DOM. Whether every control can actually be reached and operated is only answered by operating them.',
    howToTest:
      'Unplug the mouse. Complete the primary task of the page: open the menu, filter a list, add to cart, submit the form. Note anything reachable by pointer that is not reachable by Tab.',
  },
  {
    id: 'manual/2.1.2',
    wcag: ['2.1.2'],
    level: 'A',
    title: 'No keyboard trap',
    whyMachineBlind:
      'A trap is a runtime behaviour. It exists only once a modal, drawer or embedded player has been opened, and a static scan never opens anything.',
    howToTest:
      'Open every modal, drawer, menu and third-party embed with the keyboard. Confirm Escape closes it, that focus moves inside on open, and that it returns to the trigger on close.',
  },
  {
    id: 'manual/2.4.3',
    wcag: ['2.4.3'],
    level: 'A',
    title: 'Focus order',
    whyMachineBlind:
      'Source order is machine-readable. Whether the resulting sequence is meaningful, after CSS grid or flex ordering has rearranged it visually, is a reading comprehension task.',
    howToTest:
      'Tab through the page and watch the focus ring. It should move the way the eye reads. Watch particularly for content reordered by CSS and for hidden content that still takes focus.',
  },
  {
    id: 'manual/2.4.7',
    wcag: ['2.4.7'],
    level: 'AA',
    title: 'Focus visible',
    whyMachineBlind:
      'Scanners can find `outline: none`. They cannot tell whether the custom indicator that replaced it is visible on the dark footer, over the hero image, or on a button whose background matches the ring.',
    howToTest:
      'Tab across every distinct background on the page. The focused element must be obvious at a glance on all of them, not merely present in the computed styles.',
  },
  {
    id: 'manual/2.4.11',
    wcag: ['2.4.11'],
    level: 'AA',
    title: 'Focus not obscured',
    whyMachineBlind:
      'Requires knowing what is on top of the focused element at the moment it receives focus. Sticky headers, consent bars and chat widgets are all painted after the scan has finished reading the DOM.',
    howToTest:
      'Tab down a long page. When the sticky header is showing, confirm the newly focused link is not sitting behind it. Repeat with the cookie bar and the chat widget open.',
  },
  {
    id: 'manual/1.1.1-quality',
    wcag: ['1.1.1'],
    level: 'A',
    title: 'Whether alternative text is any good',
    whyMachineBlind:
      'A scanner confirms the attribute exists. `alt="image"`, `alt="DSC_0041.jpg"` and a description of the wrong image all pass every automated check on the market.',
    howToTest:
      'Read the alt text of the ten most important images with the images switched off. Decorative images should be `alt=""`. An image inside a link needs alt text describing the destination, not the picture.',
  },
  {
    id: 'manual/1.3.5',
    wcag: ['1.3.5'],
    level: 'AA',
    title: 'Identify input purpose',
    whyMachineBlind:
      'Whether a field collects the user’s own name or somebody else’s is not visible in the markup, and that is what decides whether an autocomplete token is required or wrong.',
    howToTest:
      'For each field collecting information about the user, check for the matching autocomplete token. A gift recipient’s address should not carry one.',
  },
  {
    id: 'manual/3.2.2',
    wcag: ['3.2.2'],
    level: 'A',
    title: 'On input',
    whyMachineBlind:
      'This is about what happens after a change event, and a scanner fires no change events.',
    howToTest:
      'Change every select and radio group. Nothing should navigate, submit, or move focus without a warning given before the change.',
  },
  {
    id: 'manual/screen-reader',
    wcag: ['4.1.2', '1.3.1'],
    level: 'A',
    title: 'Screen reader pass',
    whyMachineBlind:
      'Correct ARIA and a comprehensible announcement are different things. A control can be perfectly named in the accessibility tree and still be announced as something nobody can act on.',
    howToTest:
      'One pass with NVDA on Firefox or Chrome, one with VoiceOver on Safari. Navigate by heading, by landmark and by form field. Complete the primary task using announcements alone.',
  },
];

export function manualRegisterAsFindings() {
  return MANUAL_REGISTER.map((entry) => ({
    id: entry.id,
    module: 'accessibility',
    severity: 'info',
    kind: 'manual',
    title: `Manual check required: ${entry.title}`,
    detail: entry.whyMachineBlind,
    help: entry.howToTest,
    wcag: entry.wcag,
    evidence: null,
    count: 1,
  }));
}
