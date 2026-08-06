export type RuleConfig = {
  name: string;
  version: number;
  actions: {
    chi: boolean;
    gang: boolean;
    peng: boolean;
  };
  claimPriority: {
    chi: number;
    gang: number;
    hu: number;
    peng: number;
  };
  enabledFans: {
    chinitsu: boolean;
    honitsu: boolean;
    honroutou: boolean;
    pinfu: boolean;
    riichi: boolean;
    sevenPairs: boolean;
    tanyao: boolean;
    toitoi: boolean;
    root?: boolean;
  };
  fanValues: {
    chinitsu: number;
    honitsu: number;
    honroutou: number;
    pinfu: number;
    riichi: number;
    sevenPairs: number;
    tanyao: number;
    toitoi: number;
    root?: number;
  };
  winningPatterns: {
    sevenPairs: boolean;
  };
  tileSet: "standard" | "suited";
  drawCondition: "wallEmpty";
  scoring: {
    basePoints: number;
    fanLimit: number | null;
    fanPointValue: number;
    minimumFan: number;
    mode: "standard" | "sichuan";
  };
  sichuan?: SichuanRuleOptions;
};

export type SichuanRuleOptions = {
  root: { enabled: boolean; fanValue: number };
  gangPoints: { concealed: number; added: number; discard: number };
  settlement: {
    flowerPigPoints: number;
    readyPayment: "maxPoints" | "fixed";
    readyFixedPoints: number;
    skipFlowerPigReadyPayment: boolean;
    winPayment: "selfDrawAll" | "discardPayer";
  };
};

export type RulePresetName = "simple" | "standard" | "sichuan" | "sichuan-tournament";

const standardClaimPriority = Object.freeze({ chi: 1, gang: 2, hu: 3, peng: 2 });
const standardEnabledFans = Object.freeze({
  chinitsu: true,
  honitsu: true,
  honroutou: true,
  pinfu: true,
  riichi: true,
  sevenPairs: true,
  tanyao: true,
  toitoi: true
});
const standardFanValues = Object.freeze({
  chinitsu: 6,
  honitsu: 3,
  honroutou: 2,
  pinfu: 1,
  riichi: 1,
  sevenPairs: 2,
  tanyao: 1,
  toitoi: 2
});

const defaultSichuanOptions: SichuanRuleOptions = Object.freeze({
  root: Object.freeze({ enabled: true, fanValue: 1 }),
  gangPoints: Object.freeze({ concealed: 2, added: 1, discard: 1 }),
  settlement: Object.freeze({
    flowerPigPoints: 4,
    readyPayment: "maxPoints" as const,
    readyFixedPoints: 4,
    skipFlowerPigReadyPayment: true,
    winPayment: "selfDrawAll" as const
  })
});

export const standardRuleConfig: RuleConfig = Object.freeze({
  name: "standard",
  version: 1,
  actions: Object.freeze({ chi: true, gang: true, peng: true }),
  claimPriority: standardClaimPriority,
  enabledFans: standardEnabledFans,
  fanValues: standardFanValues,
  winningPatterns: Object.freeze({ sevenPairs: true }),
  tileSet: "standard",
  drawCondition: "wallEmpty",
  scoring: Object.freeze({
    basePoints: 20,
    fanLimit: null,
    fanPointValue: 10,
    minimumFan: 0,
    mode: "standard"
  })
});

export const simpleRuleConfig: RuleConfig = Object.freeze({
  name: "simple",
  version: 1,
  actions: Object.freeze({ chi: false, gang: true, peng: true }),
  claimPriority: standardClaimPriority,
  enabledFans: standardEnabledFans,
  fanValues: standardFanValues,
  winningPatterns: Object.freeze({ sevenPairs: true }),
  tileSet: "suited",
  drawCondition: "wallEmpty",
  scoring: Object.freeze({
    basePoints: 20,
    fanLimit: null,
    fanPointValue: 10,
    minimumFan: 0,
    mode: "standard"
  })
});

/** Base configuration for the Sichuan ruleset; opening phases are added later. */
export const sichuanRuleConfig: RuleConfig = Object.freeze({
  name: "sichuan",
  version: 1,
  actions: Object.freeze({ chi: false, gang: true, peng: true }),
  claimPriority: standardClaimPriority,
  enabledFans: Object.freeze({
    ...standardEnabledFans,
    pinfu: false,
    riichi: false,
    root: true
  }),
  fanValues: Object.freeze({
    ...standardFanValues,
    pinfu: 0,
    riichi: 0,
    root: 1
  }),
  winningPatterns: Object.freeze({ sevenPairs: true }),
  tileSet: "suited",
  drawCondition: "wallEmpty",
  scoring: Object.freeze({
    basePoints: 10,
    fanLimit: 5,
    fanPointValue: 0,
    minimumFan: 1,
    mode: "sichuan"
  }),
  sichuan: defaultSichuanOptions
});

/** Competitive preset with explicit versioned Sichuan settlement parameters. */
export const sichuanTournamentRuleConfig: RuleConfig = Object.freeze({
  ...sichuanRuleConfig,
  name: "sichuan-tournament",
  version: 2,
  sichuan: Object.freeze({
    ...defaultSichuanOptions,
    settlement: Object.freeze({
      ...defaultSichuanOptions.settlement,
      readyPayment: "fixed",
      readyFixedPoints: 4
    })
  })
});

const rulePresetByName: Readonly<Record<RulePresetName, RuleConfig>> = {
  simple: simpleRuleConfig,
  standard: standardRuleConfig,
  sichuan: sichuanRuleConfig,
  "sichuan-tournament": sichuanTournamentRuleConfig
};

export function getSichuanRuleOptions(rules: RuleConfig): SichuanRuleOptions {
  return rules.sichuan ?? defaultSichuanOptions;
}

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

export function getClaimPriorityConfig(rules: RuleConfig): RuleConfig["claimPriority"] {
  return rules.claimPriority ?? standardClaimPriority;
}

export function getEnabledFans(rules: RuleConfig): RuleConfig["enabledFans"] {
  return rules.enabledFans ?? standardEnabledFans;
}

export function getFanValues(rules: RuleConfig): RuleConfig["fanValues"] {
  return rules.fanValues ?? standardFanValues;
}

export function getScoringConfig(rules: RuleConfig): RuleConfig["scoring"] {
  if (rules.scoring) {
    return {
      ...rules.scoring,
      fanLimit: rules.scoring.fanLimit ?? null,
      minimumFan: rules.scoring.minimumFan ?? 0
    };
  }

  return {
    basePoints: 20,
    fanLimit: null,
    fanPointValue: 10,
    minimumFan: 0,
    mode: (rules as LegacyRuleConfig).scoringMode ?? "standard"
  };
}

export function shouldEndOnEmptyWall(rules: RuleConfig): boolean {
  return rules.drawCondition === undefined || rules.drawCondition === "wallEmpty";
}

export function getRuleConfigValidationErrors(rules: RuleConfig): string[] {
  const errors: string[] = [];
  const claimPriority = getClaimPriorityConfig(rules);
  const fanValues = getFanValues(rules);
  const scoring = getScoringConfig(rules);

  if (!rules.name.trim()) {
    errors.push("Rule name must not be empty");
  }
  if (!Number.isInteger(rules.version) || rules.version < 1) {
    errors.push("Rule version must be a positive integer");
  }

  for (const [action, priority] of Object.entries(claimPriority)) {
    if (!Number.isFinite(priority) || priority < 0) {
      errors.push(`Claim priority for ${action} must be a non-negative number`);
    }
  }

  for (const [fan, value] of Object.entries(fanValues)) {
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`Fan value for ${fan} must be a non-negative number`);
    }
  }

  if (!Number.isFinite(scoring.basePoints) || scoring.basePoints < 0) {
    errors.push("Scoring base points must be a non-negative number");
  }
  if (!Number.isFinite(scoring.fanPointValue) || scoring.fanPointValue < 0) {
    errors.push("Scoring fan point value must be a non-negative number");
  }
  if (scoring.fanLimit !== null && (!Number.isInteger(scoring.fanLimit) || scoring.fanLimit < 0)) {
    errors.push("Scoring fan limit must be null or a non-negative integer");
  }
  if (!Number.isInteger(scoring.minimumFan) || scoring.minimumFan < 0) {
    errors.push("Scoring minimum fan must be a non-negative integer");
  }

  if (rules.sichuan) {
    const { root, gangPoints, settlement } = rules.sichuan;
    if (!Number.isFinite(root.fanValue) || root.fanValue < 0)
      errors.push("Sichuan root fan value must be non-negative");
    for (const [name, value] of Object.entries(gangPoints)) {
      if (!Number.isFinite(value) || value < 0)
        errors.push(`Sichuan gang points for ${name} must be non-negative`);
    }
    if (!Number.isFinite(settlement.flowerPigPoints) || settlement.flowerPigPoints < 0)
      errors.push("Sichuan flower-pig points must be non-negative");
    if (!Number.isFinite(settlement.readyFixedPoints) || settlement.readyFixedPoints < 0)
      errors.push("Sichuan fixed ready points must be non-negative");
  }

  return errors;
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
    claimPriority: getClaimPriorityConfig(rules),
    enabledFans: getEnabledFans(rules),
    fanValues: getFanValues(rules),
    drawCondition: "wallEmpty",
    scoring: getScoringConfig(rules),
    tileSet: getRuleTileSet(rules),
    ...(rules.sichuan ? { sichuan: rules.sichuan } : {}),
    winningPatterns: { sevenPairs: allowsSevenPairs(rules) }
  };
}
