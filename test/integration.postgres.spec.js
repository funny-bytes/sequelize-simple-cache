const chai = require('chai');
const { Sequelize, Model, DataTypes } = require('sequelize');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
// const execFile = util.promisify(require('child_process').execFile);
const SequelizeSimpleCache = require('..');

global.chai = chai;
global.expect = chai.expect;
global.should = chai.should();

describe('Integration postgres', () => {
  let sequelize;
  let cache;
  let UserCached;
  let log = [];

  before(async () => {
    await exec('sh test/startPostgres.sh');

    sequelize = new Sequelize({
      dialect: 'postgres',
      database: 'itest',
      host: 'localhost',
      port: 5432,
      username: 'itest',
      password: 'secret',
      ssl: false,
      dialectOptions: {
        ssl: false,
      },
    });

    class User extends Model {}

    User.init({
      username: DataTypes.STRING,
      birthday: DataTypes.DATE,
      jobtitle: DataTypes.STRING,
    }, { sequelize });

    cache = new SequelizeSimpleCache({
      User: { ttl: 5 * 60 }, // 5 minutes
    }, {
      debug: true,
      delegate: (event, details) => {
        log.push({ event, ...details });
      },
    });

    UserCached = cache.init(User);

    await sequelize.sync();

    await UserCached.create({
      username: 'johndoe',
      birthday: new Date(1990, 3, 15),
      jobtitle: 'manager',
    });

    await UserCached.create({
      username: 'janedoe',
      birthday: new Date(1980, 6, 20),
      jobtitle: 'engineer',
    });
  });

  after(async () => {
    await exec('sh test/stopPostgres.sh');
  });

  beforeEach(() => {
    log = [];
    cache.clear();
  });

  it('should call cache when User.findOne', async () => {
    const jane1 = await UserCached.findOne({ where: { username: 'janedoe' } });
    expect(jane1).to.have.property('username', 'janedoe');
    expect(jane1).to.have.property('jobtitle', 'engineer');
    const jane2 = await UserCached.findOne({ where: { username: 'janedoe' } });
    expect(jane2).to.have.property('username', 'janedoe');
    expect(jane2).to.have.property('jobtitle', 'engineer');
    const jane3 = await UserCached.findOne({ where: { username: 'janedoe' } });
    expect(jane3).to.have.property('username', 'janedoe');
    expect(jane3).to.have.property('jobtitle', 'engineer');
    expect(log.map(({ event }) => event)).to.be.deep.equals(['miss', 'load', 'hit', 'hit']);
  });
});
