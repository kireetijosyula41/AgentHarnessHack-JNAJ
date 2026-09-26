import type {
  AgentRun,
  AttackTrace,
  DeploymentState,
  EvaluationResult,
  HarnessVersion,
  RegressionCase,
} from "@/src/types";

export type MongoShape = Record<string, unknown> & { _id: string };

function toMongo<T extends { id: string }>(value: T): MongoShape {
  const { id, ...rest } = value;
  return { _id: id, ...rest };
}

function fromMongo<T extends { id: string }>(value: MongoShape): T {
  const { _id, ...rest } = value;
  return { id: String(_id), ...rest } as T;
}

export const serialize = {
  harness: (value: HarnessVersion) => toMongo(value),
  attack: (value: AttackTrace) => toMongo(value),
  regression: (value: RegressionCase) => toMongo(value),
  evaluation: (value: EvaluationResult) => toMongo(value),
  deployment: (value: DeploymentState) => toMongo(value),
  run: (value: AgentRun) => toMongo(value),
};

export const deserialize = {
  harness: (value: MongoShape) => fromMongo<HarnessVersion>(value),
  attack: (value: MongoShape) => fromMongo<AttackTrace>(value),
  regression: (value: MongoShape) => fromMongo<RegressionCase>(value),
  evaluation: (value: MongoShape) => fromMongo<EvaluationResult>(value),
  deployment: (value: MongoShape) => fromMongo<DeploymentState>(value),
  run: (value: MongoShape) => fromMongo<AgentRun>(value),
};
