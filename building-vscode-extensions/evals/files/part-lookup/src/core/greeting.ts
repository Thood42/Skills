// REFERENCE FEATURE (see src/features/hello). Pure logic: no vscode import, no I/O.

const FALLBACK_GREETING = 'Hello';
const FALLBACK_NAME = 'world';

export function formatGreeting(greeting: string, name: string | undefined): string {
  const salutation = greeting.trim() || FALLBACK_GREETING;
  const who = name?.trim() || FALLBACK_NAME;
  return `${salutation}, ${who}!`;
}
