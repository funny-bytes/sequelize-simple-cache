import { Model, ModelCtor, ModelStatic } from "sequelize";

export default class SequelizeSimpleCache {
  constructor(config: SequelizeSimpleCacheConfig, options?: SequelizeSimpleCacheOptions);
  init<M extends Model>(model: ModelStatic<M>) : ModelCtor<M> & SequelizeSimpleCacheModel<M>;
  clear(modelnames?: string[]): void;
}

export interface SequelizeSimpleCacheConfig {
  [modelname: string]: SequelizeSimpleCacheModelConfig;
}

export interface SequelizeSimpleCacheModelConfig {
  ttl?: number;
  limit?: number;
  clearOnUpdate?: boolean;
}

export interface SequelizeSimpleCacheOptions {
  debug?: boolean,
  ops?: number,
  delegate?: (event: string, details?: any) => void,
}

export interface SequelizeSimpleCacheModel<M extends Model> {
  clearCache(): void;
  clearCacheAll(): void;
  noCache(): ModelCtor<M>;
}
