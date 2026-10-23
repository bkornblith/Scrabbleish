"use client";

import type { Settings } from "@/lib/engine";

export function SettingsForm({
  settings,
  onChange,
  disabled,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <div className="settings">
      <label>
        Word checking
        <select disabled={disabled} value={settings.wordCheck} onChange={(e) => set("wordCheck", e.target.value as Settings["wordCheck"])}>
          <option value="challenge">Challenge (official): anything goes until someone challenges</option>
          <option value="auto">Automatic: invalid words are rejected</option>
        </select>
      </label>
      {settings.wordCheck === "challenge" && (
        <label>
          If a challenge fails
          <select
            disabled={disabled}
            value={settings.failedChallenge}
            onChange={(e) => set("failedChallenge", e.target.value as Settings["failedChallenge"])}
          >
            <option value="lose-turn">Challenger loses their next turn (official)</option>
            <option value="bonus-5">Player challenged gets +5 (tournament)</option>
            <option value="none">No penalty</option>
          </select>
        </label>
      )}
      <label>
        Exchanging tiles
        <select
          disabled={disabled}
          value={settings.exchangeRule ?? "enough"}
          onChange={(e) => set("exchangeRule", e.target.value as Settings["exchangeRule"])}
        >
          <option value="enough">Any number, as long as the bag can replace them</option>
          <option value="seven">Only when 7+ tiles are in the bag (official)</option>
        </select>
      </label>
      <label>
        Tile bag
        <select disabled={disabled} value={settings.bag} onChange={(e) => set("bag", e.target.value as Settings["bag"])}>
          <option value="standard">Standard: 100 tiles</option>
          <option value="double">Double: 200 tiles (longer games, good for 5 players)</option>
        </select>
      </label>
    </div>
  );
}
