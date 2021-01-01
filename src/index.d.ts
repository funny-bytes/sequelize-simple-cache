import { Model, ModelCtor, ModelStatic } from "sequelize";

export default class SequelizeSimpleCache {
  constructor(options?: SequelizeSimpleCacheOptions);
  add<M extends Model>(model: ModelStatic<M>, config?: SequelizeSimpleCacheModelOptions) : ModelCtor<M> & SequelizeSimpleCacheModel<M>;
  clear(modelnames?: string[]): void;
}

export interface SequelizeSimpleCacheOptions {
  debug?: boolean,
  ops?: number,
  delegate?: (event: string, details?: any) => void,
}

export interface SequelizeSimpleCacheModelOptions {
  ttl?: number;
  limit?: number;
  clearOnUpdate?: boolean;
}

export interface SequelizeSimpleCacheModel<M extends Model> {
  clearCache(): void;
  clearCacheAll(): void;
  noCache(): ModelCtor<M>;
}
