export type RuleConfig = {
  name: string;
  allowChi: boolean;
  allowPeng: boolean;
  allowGang: boolean;
  allowSevenPairs: boolean;
  useWinds: boolean;
  useDragons: boolean;
  scoringMode: "standard" | "sichuan";
};

export const standardRuleConfig: RuleConfig = {
  name: "standard",
  allowChi: true,
  allowPeng: true,
  allowGang: true,
  allowSevenPairs: true,
  useWinds: true,
  useDragons: true,
  scoringMode: "standard"
};

export const simpleRuleConfig: RuleConfig = {
  name: "simple",
  allowChi: false,
  allowPeng: true,
  allowGang: true,
  allowSevenPairs: true,
  useWinds: false,
  useDragons: false,
  scoringMode: "standard"
};
