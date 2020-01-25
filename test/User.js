const { Model, DataTypes } = require('sequelize');

class User extends Model {
}

// persistent properties
const attributes = {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    primaryKey: true,
  },
  jobtitle: DataTypes.STRING,
};

// table options
const options = {
  indexes: [{
    fields: ['username'],
    unique: true,
  }],
};

module.exports = (sequelize) => User.init(attributes, { ...options, sequelize });
