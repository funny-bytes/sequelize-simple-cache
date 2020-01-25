const { Sequelize } = require('sequelize');
const User = require('./User');
const SequelizeSimpleCache = require('..');
require('./test-helper');

describe('Integration sqlite', () => {
  let sequelize;
  let cache;
  let cacheEvents = [];
  let UserCached;

  before(async () => {
    sequelize = new Sequelize('sqlite::memory:');

    cache = new SequelizeSimpleCache({
      User: { ttl: 5 * 60 }, // 5 minutes
    }, {
      debug: true,
      delegate: (event) => cacheEvents.push(event),
    });

    UserCached = cache.init(User(sequelize));

    await sequelize.sync();

    await UserCached.create({
      username: 'johndoe',
      jobtitle: 'manager',
    });

    await UserCached.create({
      username: 'janedoe',
      jobtitle: 'engineer',
    });
  });

  beforeEach(() => {
    cache.clear();
    cacheEvents = [];
  });

  it('should cache User.findOne', async () => {
    const findOne = async (username, jobtitle) => {
      const jane = await UserCached.findOne({ where: { username } });
      expect(jane).to.have.property('username', username);
      expect(jane).to.have.property('jobtitle', jobtitle);
    };
    await findOne('janedoe', 'engineer');
    await findOne('janedoe', 'engineer');
    await findOne('janedoe', 'engineer');
    expect(cacheEvents).to.be.deep.equals(['miss', 'load', 'hit', 'hit']);
  });

  it('should cache User.findAll', async () => {
    const findAll = async (count) => {
      const users = await UserCached.findAll();
      expect(users.length).to.be.equal(count);
    };
    await findAll(2);
    await findAll(2);
    expect(cacheEvents).to.be.deep.equals(['miss', 'load', 'hit']);
    await UserCached.create({
      username: 'jimdoe',
      jobtitle: 'Web Designer',
    });
    await findAll(3);
    await findAll(3);
    expect(cacheEvents).to.be.deep.equals(['miss', 'load', 'hit', 'miss', 'load', 'hit']);
  });

  it('should cache User.findByPk', async () => {
    const findByPk = async (username, jobtitle) => {
      const jane = await UserCached.findByPk(username);
      expect(jane).to.have.property('username', username);
      expect(jane).to.have.property('jobtitle', jobtitle);
    };
    await findByPk('janedoe', 'engineer');
    await findByPk('janedoe', 'engineer');
    await UserCached.noCache().findByPk('janedoe');
    await findByPk('janedoe', 'engineer');
    await findByPk('johndoe', 'manager');
    expect(cacheEvents).to.be.deep.equals(['miss', 'load', 'hit', 'hit', 'miss', 'load']);
  });
});
