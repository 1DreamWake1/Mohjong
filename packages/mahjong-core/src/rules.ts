export type RuleConfig = {
  name: string;
  version: number;
  actions: {
    chi: boolean;
    gang: boolean;
    peng: boolean;
  };
  winningPatterns: {
    sevenPairs: boolean;
  };
  tileSet: "standard" | "suited";
  drawCondition: "wallEmpty";
  scoring: {
    basePoints: number;
    fanPointValue: number;
    mode: "standard" | "sichuan";
  };
};

export type RulePresetName = "simple" | "standard";

export const standardRuleConfig: RuleConfig = Object.freeze({
  name: "standard",
  version: 1,
  actions: Object.freeze({ chi: true, gang: true, peng: true }),
  winningPatterns: Object.freeze({ sevenPairs: true }),
  tileSet: "standard",
  drawCondition: "wallEmpty",
  scoring: Object.freeze({ basePoints: 20, fanPointValue: 10, mode: "standard" })
});

export const simpleRuleConfig: RuleConfig = Object.freeze({
  name: "simple",
  version: 1,
  actions: Object.freeze({ chi: false, gang: true, peng: true }),
  winningPatterns: Object.freeze({ sevenPairs: true }),
  tileSet: "suited",
  drawCondition: "wallEmpty",
  scoring: Object.freeze({ basePoints: 20, fanPointValue: 10, mode: "standard" })
});

const rulePresetByName: Readonly<Record<RulePresetName, RuleConfig>> = {
  simple: simpleRuleConfig,
  standard: standardRuleConfig
};

export function getRulePreset(name: string): RuleConfig | undefined {
  return rulePresetByName[name as RulePresetName];
}

export function getRuleTileSet(rules: RuleConfig): RuleConfig["tileSet"] {
  if (rules.tileSet === "standard" || rules.tileSet === "suited") {
    return rules.tileSet;
  }

  const legacyRules = rules as RuleConfig & { useDragons?: boolean; useWinds?: boolean };
  return legacyRules.useDragons === false && legacyRules.useWinds === false ? "suited" : "standard";
}

type LegacyRuleConfig = RuleConfig & {
  allowChi?: boolean;
  allowGang?: boolean;
  allowPeng?: boolean;
  allowSevenPairs?: boolean;
  scoringMode?: "standard" | "sichuan";
  useDragons?: boolean;
  useWinds?: boolean;
};

export function getRuleActions(rules: RuleConfig): RuleConfig["actions"] {
  if (rules.actions) {
    return rules.actions;
  }

  const legacyRules = rules as LegacyRuleConfig;
  return {
    chi: legacyRules.allowChi ?? true,
    gang: legacyRules.allowGang ?? true,
    peng: legacyRules.allowPeng ?? true
  };
}

export function allowsSevenPairs(rules: RuleConfig): boolean {
  return rules.winningPatterns?.sevenPairs ?? (rules as LegacyRuleConfig).allowSevenPairs ?? true;
}

export function getScoringConfig(rules: RuleConfig): RuleConfig["scoring"] {
  if (rules.scoring) {
    return rules.scoring;
  }

  return {
    basePoints: 20,
    fanPointValue: 10,
    mode: (rules as LegacyRuleConfig).scoringMode ?? "standard"
  };
}

export function shouldEndOnEmptyWall(rules: RuleConfig): boolean {
  return rules.drawCondition === undefined || rules.drawCondition === "wallEmpty";
}

export function normalizeRuleConfig(rules: RuleConfig): RuleConfig {
  const currentRules: LegacyRuleConfig = { ...(rules as LegacyRuleConfig) };
  delete currentRules.allowChi;
  delete currentRules.allowGang;
  delete currentRules.allowPeng;
  delete currentRules.allowSevenPairs;
  delete currentRules.scoringMode;
  delete currentRules.useDragons;
  delete currentRules.useWinds;

  return {
    ...currentRules,
    actions: getRuleActions(rules),
    drawCondition: "wallEmpty",
    scoring: getScoringConfig(rules),
    tileSet: getRuleTileSet(rules),
    winningPatterns: { sevenPairs: allowsSevenPairs(rules) }
  };
}
