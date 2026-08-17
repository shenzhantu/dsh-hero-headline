// Host half of the dsh-hero-headline plugin (Node side).
// This plugin is client-only: the host exports a valid loader entry and then
// does nothing. All behavior lives in the browser (client.js), which rewrites
// the empty-state hero headline and hides the adjacent "Preview" badge.

export const name = 'dsh-hero-headline'
export const inject = []

export function apply() {}