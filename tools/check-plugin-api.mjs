#!/usr/bin/env node
// Checks a plugin script against the host API's actual shape.
//
// Two mistakes have already shipped: `colors.danger` (the theme key is
// `destructive`) and `new Input(state)` (gpui-base exposes `Input.new`, not a
// constructor). Both render as "This view could not be rendered" with a stack
// trace, which is a slow way to learn a spelling. This catches them before
// packing.

import { readFileSync } from "node:fs";
import process from "node:process";

const THEME_KEYS = new Set([
  "accent", "accent_foreground", "background", "border", "destructive",
  "destructive_foreground", "foreground", "input", "muted", "muted_foreground",
  "primary", "primary_foreground", "ring", "secondary", "secondary_foreground",
  "selection", "surface", "surface_foreground"
]);

// Every constructor gpui-base exports as `{ new: (...) }`.
const CONSTRUCTORS = [
  "Button", "Link", "Checkbox", "Switch", "Tabs", "Tab", "Progress",
  "ProgressTrack", "ProgressIndicator", "Avatar", "AvatarImage", "AvatarFallback",
  "Pagination", "Accordion", "AccordionItem", "AccordionHeader", "AccordionPanel",
  "AccordionTrigger", "Radio", "Toggle", "RadioGroup", "ToggleGroup", "Table",
  "TableHeader", "TableBody", "TableRow", "TableHead", "TableCell", "TableCaption",
  "Collapsible", "Popover", "HoverCard", "Select", "Combobox", "DatePicker",
  "Input", "InputState", "NumberInput", "Textarea", "TextareaState", "SliderState",
  "Slider", "SliderTrack", "SliderIndicator", "SliderThumb", "OtpState", "OtpInput",
  "Scrollbar"
];

const path = process.argv[2];
if (!path) {
  console.error("usage: node tools/check-plugin-api.mjs <main.js>");
  process.exit(2);
}
const source = readFileSync(path, "utf8");
const problems = [];

// `new Input(...)` throws "Input is not a constructor" at render time.
for (const name of CONSTRUCTORS) {
  const pattern = new RegExp(`\\bnew\\s+${name}\\s*\\(`, "g");
  for (const match of source.matchAll(pattern)) {
    const line = source.slice(0, match.index).split("\n").length;
    problems.push(`${path}:${line}: \`new ${name}(...)\` — use \`${name}.new(...)\``);
  }
}

// A theme key that does not exist reads as undefined and paints nothing.
for (const match of source.matchAll(/colors\.([a-z_]+)/g)) {
  if (!THEME_KEYS.has(match[1])) {
    const line = source.slice(0, match.index).split("\n").length;
    problems.push(
      `${path}:${line}: \`colors.${match[1]}\` is not a theme key ` +
        `(valid: ${[...THEME_KEYS].join(", ")})`
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`${path}: the API calls match the host`);
