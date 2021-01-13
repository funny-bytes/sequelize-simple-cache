import 'mocha';
import { expect } from 'chai';
import { Sequelize, Model, DataTypes, ModelAttributes, ModelOptions } from "sequelize";
import SequelizeSimpleCache from "../..";

export interface UserAttributes {
  id: number;
  name: string;
}

export interface UserInterface {
  foo() : string;
}

export class User extends Model<UserAttributes> implements UserAttributes, UserInterface {
  public id!: number;
  public name!: string;
  public foo() {
    return "bar";
  }
}

export const attributes: ModelAttributes<User, UserAttributes> = {
  id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
};

export const options: ModelOptions<User> = {
  tableName: 'users',
};

const sequelize = new Sequelize('sqlite::memory:');

User.init(attributes, { sequelize, ...options });

let debugSpy = []; // spy

const cache = new SequelizeSimpleCache({
  [User.name]: { ttl: 60000 },
  foo: {},
  bar: { ttl: 10000 },
}, {
  debug: true, delegate: (event, details) => { debugSpy.push(event) }
});

const UserCached = cache.init<User>(User);

describe('Integration TypeScript', () => {
  before(async () => {
    await sequelize.sync();
    await User.create({ id: 0, name: 'fred' });
    await User.create({ id: 1, name: 'john' });
  });

  beforeEach(() => {
    cache.clear();
    debugSpy = [];
  });

  it('should provide Sequelize selectors and cache correctly', async () => {
    const fred1 = await UserCached.findOne({ where: { name: 'fred' } });
    const fred2 = await UserCached.findOne({ where: { name: 'fred' } });
    expect(debugSpy).to.be.deep.equal(['miss', 'load', 'hit']);
  });

  it('should provide cache methods', async () => {
    const fred1 = await UserCached.findOne({ where: { name: 'fred' } });
    const fred2 = await UserCached.findOne({ where: { name: 'fred' } });
    UserCached.clearCache();
    const fred3 = await UserCached.findOne({ where: { name: 'fred' } });
    expect(debugSpy).to.be.deep.equal(['miss', 'load', 'hit', 'miss', 'load']);
  });

  it('should provide specific methods', async () => {
    const fred = await UserCached.findOne({ where: { name: 'fred' } });
    expect(fred.foo()).to.be.equal('bar');
  });
});
