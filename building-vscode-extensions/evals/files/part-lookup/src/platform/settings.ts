import * as vscode from 'vscode';

/** Must equal the prefix of every key under contributes.configuration in package.json. */
export const SETTINGS_SECTION = 'partLookup';

/**
 * Reads a contributed setting. package.json is the single source of truth for defaults, so a
 * missing value means manifest and code drifted: fail loudly rather than invent a second default.
 */
export function readSetting<T>(key: string, scope?: vscode.ConfigurationScope): T {
  const value = vscode.workspace.getConfiguration(SETTINGS_SECTION, scope).get<T>(key);
  if (value === undefined) {
    throw new Error(
      `Setting "${SETTINGS_SECTION}.${key}" has no value. Is it declared in package.json contributes.configuration?`,
    );
  }
  return value;
}

/** True when a configuration change event touches one of our settings (optionally a single key). */
export function affectsSetting(event: vscode.ConfigurationChangeEvent, key?: string): boolean {
  return event.affectsConfiguration(key ? `${SETTINGS_SECTION}.${key}` : SETTINGS_SECTION);
}
